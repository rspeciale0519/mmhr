import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import { reserveFinanceDocument, completeFinanceDocumentUpload } from "@/server/commands/finance-document-upload";
import { getFinanceDocuments, getFinanceDocumentVersions, getFinanceDocumentHistory } from "@/server/commands/finance-documents";
import { getWorkspaceDocuments, getWorkspaceDocumentVersions, getWorkspaceDocumentHistory } from "@/server/commands/workspace-documents";
import { issueFinanceDocumentAccess, recordFinanceDocumentReview } from "@/server/commands/finance-document-review";
import { downloadFinanceDocument } from "@/server/integrations/documents/finance-document-download";
import { createSupabaseDocumentStore } from "@/server/integrations/documents/supabase-document-store";
import { runDocumentScan } from "@/server/workflows/document-scan-worker";
import { seedSignedFinanceDocumentSourceWithPortal } from "./test/r7-finance-document-fixtures";
import { registerFinanceDocumentSourceRegressions } from "./test/r7-finance-document-source-regressions";
import { registerFinanceDemoEvidenceRegressions } from "./test/r7-finance-demo-evidence-regressions";
import { registerFinanceUploadRecoveryRegressions } from "./test/r7-finance-upload-recovery-regressions";
import { createApprovedWorkspaceDemoEvidence } from "./test/r7-finance-workspace-evidence-fixture";
import type { FinanceDocumentSource } from "@/lib/finance-document-upload";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SecurityTransaction } from "./r1-security-command-fixtures";

describe("Finance source documents through genuine disposable Auth and Storage", () => {
  let fixture: SecurityCommandApiFixtures, worker: Awaited<ReturnType<SecurityCommandApiFixtures["createDocumentScanProcessor"]>>;
  let signedPortal: Awaited<ReturnType<typeof seedSignedFinanceDocumentSourceWithPortal>>;
  let signedSource: typeof signedPortal.source;
  let financeStaff:SecurityApiPrincipal,unrelatedStaff:SecurityApiPrincipal,vendorAdmin:SecurityApiPrincipal;
  const internalOrg=randomUUID(), agreementVendor=randomUUID();
  const bytes=Buffer.from("%PDF-1.7\nSynthetic finance original\n%%EOF"), hash=createHash("sha256").update(bytes).digest("hex");
  const metadata=()=>({correlationId:randomUUID(),idempotencyKey:randomUUID()});
  const reserve=(organizationId:string,source:FinanceDocumentSource,documentId:string=randomUUID(),expectedVersion=0)=>({organizationId,source,
    documentId,versionId:randomUUID(),expectedVersion,fileName:"synthetic.pdf",declaredMimeType:"application/pdf",...metadata()});
  const staff=(index:0|1)=>({supabase:elevatedClient(fixture.pair[index]) as RequestSupabaseClient});
  async function verifiedOwnerContext<T>(client:SupabaseClient, operation:(sql:SecurityTransaction)=>Promise<T>){
    const verified=await client.auth.getClaims();if(verified.error||!verified.data?.claims)throw new Error("Genuine signed claims missing");
    return fixture.owner.begin(async sql=>{await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(verified.data.claims)},true)`;
      return operation(sql);});
  }
  async function evidenceCounts(versionId:string){
    const [proof]=await fixture.owner`SELECT u.state,u.revision,
      (SELECT count(*)::int FROM public.workflow_document_upload_events e WHERE e.version_id=u.version_id) history,
      (SELECT count(*)::int FROM mmhr_private.finance_document_access_grants g WHERE g.version_id=u.version_id) grants,
      (SELECT count(*)::int FROM public.security_command_receipts) receipts,
      (SELECT count(*)::int FROM public.audit_events) audits,(SELECT count(*)::int FROM public.workflow_jobs) jobs
      FROM public.workflow_document_uploads u WHERE u.version_id=${versionId}::uuid`;return proof;
  }
  beforeAll(async()=>{
    fixture=await createSecurityCommandApiFixtures({storage:true});
    expect(fixture.isolation.apiLoopbackOnly).toBe(true);
    await fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required) VALUES
      (${internalOrg}::uuid,'Synthetic internal finance','internal','active',now(),false),
      (${agreementVendor}::uuid,'Synthetic agreement vendor','vendor','active',now(),false)`;
    await verifiedApiClaims(elevatedClient(fixture.pair[1]),"aal2");
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${internalOrg}::uuid,${fixture.pair[1].identityId}::uuid,${fixture.pair[1].subjectId}::uuid,'admin','organization_admin',false),
        (${internalOrg}::uuid,${fixture.pair[0].identityId}::uuid,${fixture.pair[0].subjectId}::uuid,'contributor','contributor',false)`;
    for(const actor of fixture.pair)for(const org of [internalOrg,fixture.organizationId])for(const permission of ["workspace.access","finance.manage","rfp.approve"]){
      // The signed quote fixture creates this exact grant when it adds the reviewed staff membership.
      if(actor===fixture.pair[1]&&org===fixture.organizationId&&permission==="workspace.access")continue;
      await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${actor.identityId}::uuid,${permission},'organization',${org}::uuid,${`organization:${org}`},'allow',
          ${fixture.pair[actor===fixture.pair[0]?1:0].identityId}::uuid,'Synthetic finance document verification')`;
    }
    [financeStaff,unrelatedStaff,vendorAdmin]=await Promise.all([fixture.createSyntheticPrincipal({mfa:true}),
      fixture.createSyntheticPrincipal({mfa:true}),fixture.createSyntheticPrincipal({mfa:true})]);
    for(const actor of [financeStaff,unrelatedStaff]){
      await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${internalOrg}::uuid,${actor.identityId}::uuid,${actor.subjectId}::uuid,'contributor','contributor',false)`;
      const [assignment]=await fixture.owner<{id:string}[]>`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
        VALUES(${actor.identityId}::uuid,'staff',clock_timestamp(),'Synthetic finance document staff') RETURNING id`;
      await fixture.owner`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
        SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
        FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
        WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
    }
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${agreementVendor}::uuid,${vendorAdmin.identityId}::uuid,${vendorAdmin.subjectId}::uuid,'admin','organization_admin',false),
        (${fixture.organizationId}::uuid,${vendorAdmin.identityId}::uuid,${vendorAdmin.subjectId}::uuid,'viewer','viewer',false)`;
    for(const actor of [financeStaff,unrelatedStaff,vendorAdmin])for(const permission of actor===financeStaff?["workspace.access","finance.manage"]:["workspace.access"]){
      const scopedOrganization=actor===vendorAdmin?fixture.organizationId:internalOrg;
      await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${actor.identityId}::uuid,${permission},'organization',${scopedOrganization}::uuid,${`organization:${scopedOrganization}`},'allow',
          ${fixture.pair[0].identityId}::uuid,'Synthetic scoped finance document denial check')`;
    }
    await fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    signedPortal=await seedSignedFinanceDocumentSourceWithPortal(fixture);signedSource=signedPortal.source;
    const signedWorkspace=await elevatedClient(fixture.pair[1]).rpc("mmhr_authorize",{
      permission_key:"workspace.access",organization_id:fixture.organizationId});
    expect(signedWorkspace.error).toBeNull();expect(signedWorkspace.data).toHaveLength(1);
    for(const [principal,organizationId] of [[fixture.pair[0],internalOrg],[financeStaff,internalOrg],
      [unrelatedStaff,internalOrg],[vendorAdmin,fixture.organizationId]] as const){
      const workspace=await elevatedClient(principal).rpc("mmhr_authorize",{permission_key:"workspace.access",organization_id:organizationId});
      expect(workspace.error).toBeNull();expect(workspace.data).toHaveLength(1);
    }
    await fixture.createPrivateDocumentBucket();
    await fixture.owner`SELECT mmhr_private.r4_install_document_storage_upload_policies()`;
    await fixture.owner`SELECT mmhr_private.r4_install_document_scan_read_policies()`;
    await fixture.owner`SELECT mmhr_private.r4_install_document_content_read_policies()`;
    worker=await fixture.createDocumentScanProcessor();
  },420_000);
  afterAll(async()=>{try{if(worker)await worker.close();}finally{if(fixture)await fixture.close();}},180_000);
  async function ready(request:ReturnType<typeof reserve>){
    await reserveFinanceDocument(request,bytes,staff(0));
    await createSupabaseDocumentStore(staff(0).supabase).putQuarantined({organizationId:request.organizationId,documentId:request.documentId,
      versionId:request.versionId,fileName:request.fileName,declaredMimeType:request.declaredMimeType,bytes});
    await completeFinanceDocumentUpload({organizationId:request.organizationId,documentId:request.documentId,versionId:request.versionId,
      expectedRevision:1,...metadata()},staff(0));
    // This scanner double tests the byte/lease/evidence contract. It does not verify a real ClamAV engine.
    const scanned=await runDocumentScan(request.versionId,{repository:worker.repository,store:createSupabaseDocumentStore(worker.reader as RequestSupabaseClient),
      scanner:{async scan(input){return {versionId:input.versionId,sha256:input.expectedSha256,state:"clean",scanner:"clamav",scannerVersion:"1.4.6",
        signatureVersion:28139,signatureUpdatedAt:new Date().toISOString(),scannedAt:new Date().toISOString(),failureCode:null};}}});
    expect(scanned).toMatchObject({outcome:"recorded",state:"ready"});
  }
  async function approve(request:ReturnType<typeof reserve>){
    const scope={organizationId:request.organizationId,documentId:request.documentId,versionId:request.versionId};
    await recordFinanceDocumentReview({...scope,expectedRevision:4,action:"begin_review",reason:"Synthetic content review started",
      reviewReference:"synthetic:review",...metadata()},staff(1));
    const grant=await issueFinanceDocumentAccess({...scope,expectedRevision:5,purpose:"finance_review",...metadata()},staff(1));
    expect((await downloadFinanceDocument({organizationId:scope.organizationId,accessId:grant.accessId,accessToken:grant.accessToken,
      correlationId:randomUUID()},staff(1))).bytes).toEqual(new Uint8Array(bytes));
    const decision={...scope,expectedRevision:5,action:"approve" as const,reason:"Synthetic original independently checked",
      reviewReference:"synthetic:approval",reviewedAccessId:grant.accessId,contentsReviewed:true as const,...metadata()};
    const original=await recordFinanceDocumentReview(decision,staff(1));
    expect(original).toMatchObject({revision:6,state:"approved",outcomeCode:"recorded"});
    return {decision,original};
  }
  // Multi-command journeys include actual Storage operations. Each RPC keeps its existing statement deadline.
  const journey=(name:string,run:()=>Promise<void>)=>test(name,run,60_000);
  test("accepts internal agreement and actual stored signed customer sources without money",async()=>{
    for(const request of [reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor}),reserve(fixture.organizationId,signedSource)]){
      const result=await reserveFinanceDocument(request,bytes,staff(0));expect(result).toMatchObject({state:"received",revision:1});
      const [binding]=await fixture.owner`SELECT source_class,source_snapshot FROM public.finance_document_sources WHERE version_id=${request.versionId}::uuid`;
      expect(binding?.source_snapshot).toEqual(request.source);
    }
  });
  test("denies bare, mixed-scope and changed portal associations without writes",async()=>{
    const requests=[reserve(fixture.organizationId,{sourceClass:"agreement",vendorOrganizationId:agreementVendor}),
      reserve(internalOrg,signedSource),reserve(fixture.organizationId,{...signedSource,contractId:randomUUID()}),
      reserve(fixture.organizationId,{...signedSource,handoffId:randomUUID()}),reserve(fixture.organizationId,{...signedSource,dealId:randomUUID()}),
      reserve(fixture.organizationId,{...signedSource,vendorOrganizationId:agreementVendor})];
    for(const request of requests){await expect(reserveFinanceDocument(request,bytes,staff(0))).rejects.toBeInstanceOf(AuthorizationError);
      const [row]=await fixture.owner`SELECT count(*)::int count FROM public.workflow_document_versions WHERE id=${request.versionId}::uuid`;expect(row?.count).toBe(0);}
  });
  journey("rejects unverified object metadata and permits original reservation retries after later states",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});
    await reserveFinanceDocument(request,bytes,staff(0));
    await expect(completeFinanceDocumentUpload({organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,
      expectedRevision:1,...metadata()},staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    await ready(request);await approve(request);
    expect(await reserveFinanceDocument(request,bytes,staff(0))).toMatchObject({state:"received",revision:1,outcomeCode:"replayed"});
    await expect(reserveFinanceDocument({...request,correlationId:randomUUID()},bytes,staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(reserveFinanceDocument({...request,fileName:"changed.pdf"},bytes,staff(0))).rejects.toThrow();
  });
  journey("requires independent current review and exact bytes before approving",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);
    const review={organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,expectedRevision:4,
      action:"begin_review",reason:"Synthetic independent review",reviewReference:"synthetic:review",...metadata()};
    await expect(recordFinanceDocumentReview(review,staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(issueFinanceDocumentAccess({organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,
      expectedRevision:4,purpose:"finance_original",...metadata()},staff(1))).rejects.toBeInstanceOf(AuthorizationError);
    await approve(request);
    const [proof]=await fixture.owner`SELECT sha256,reviewer_identity_id FROM public.finance_document_approvals WHERE version_id=${request.versionId}::uuid`;
    expect(proof).toMatchObject({sha256:hash,reviewer_identity_id:fixture.pair[1].identityId});
  });
  journey("preserves exact old approval replay and original access after a replacement",async()=>{
    const first=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(first);const approved=await approve(first);
    const second=reserve(internalOrg,first.source,first.documentId,1);await ready(second);await approve(second);
    expect(await recordFinanceDocumentReview(approved.decision,staff(1))).toEqual({...approved.original,outcomeCode:"replayed"});
    const access=await issueFinanceDocumentAccess({organizationId:internalOrg,documentId:first.documentId,versionId:first.versionId,
      expectedRevision:6,purpose:"finance_original",...metadata()},staff(0));
    const original=await downloadFinanceDocument({organizationId:internalOrg,accessId:access.accessId,accessToken:access.accessToken,
      correlationId:randomUUID()},staff(0));expect(original.manifest.versionId).toBe(first.versionId);expect(original.manifest.sha256).toBe(hash);
    const versions=await getFinanceDocumentVersions({organizationId:internalOrg,documentId:first.documentId,correlationId:randomUUID()},staff(0));
    expect(versions.items.map(row=>[row.versionId,row.isCurrent])).toEqual([[first.versionId,false],[second.versionId,true]]);
  });
  journey("excludes finance metadata and originals from every generic reader and legacy search",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);await approve(request);
    expect((await getFinanceDocuments({organizationId:internalOrg,correlationId:randomUUID()},staff(0))).items.some(row=>row.versionId===request.versionId)).toBe(true);
    expect((await getWorkspaceDocuments({organizationId:internalOrg,searchQuery:"synthetic",correlationId:randomUUID()},staff(0))).items).toEqual([]);
    await expect(getWorkspaceDocumentVersions({organizationId:internalOrg,documentId:request.documentId,correlationId:randomUUID()},staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(getWorkspaceDocumentHistory({organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,correlationId:randomUUID()},staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    const search=await elevatedClient(fixture.pair[0]).rpc("mmhr_search_workflow_documents",{payload:{organizationId:internalOrg,
      actorIdentityId:fixture.pair[0].identityId,query:"synthetic",limit:100},correlation_id:randomUUID(),idempotency_key:randomUUID()});
    expect(search.error).toBeNull();expect(search.data.results).toEqual([]);
    const direct=await elevatedClient(fixture.pair[0]).storage.from("mmhr-document-quarantine").download(`${internalOrg}/${request.documentId}/${request.versionId}`);
    expect(direct.error).not.toBeNull();
    const history=await getFinanceDocumentHistory({organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,correlationId:randomUUID()},staff(0));
    expect(history.items.map(row=>row.action)).toEqual(["reserve","uploaded","scan_claimed","scan_clean","review_started","approve"]);
  });
  test("denies real anonymous, customer, vendor and AAL1 staff sessions at both boundaries",async()=>{
    await verifiedApiClaims(financeStaff.aal1,"aal1");
    const [eligible]=await fixture.owner`SELECT mmhr_private.r1_evaluate_permission(${financeStaff.identityId}::uuid,'finance.manage',${internalOrg}::uuid,
      'aal2',clock_timestamp(),false) assigned`;expect(eligible?.assigned).toBe(true);
    for(const client of [fixture.anonymous,fixture.organizationAdmin.aal1,fixture.outsider.aal1,financeStaff.aal1]){
      const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});
      await expect(reserveFinanceDocument(request,bytes,{supabase:client as RequestSupabaseClient})).rejects.toBeInstanceOf(AuthorizationError);
      const {correlationId,idempotencyKey,declaredMimeType,...payload}=request;
      const response=await client.rpc("mmhr_reserve_finance_document",{payload:{...payload,contentType:declaredMimeType,byteSize:bytes.length,sha256:hash},
        correlation_id:correlationId,idempotency_key:idempotencyKey});expect(response.error?.code).toBe("42501");
    }
  });
  test("denies genuine AAL2 customer, vendor and unrelated staff sessions",async()=>{
    for(const [client,request] of [[elevatedClient(fixture.organizationAdmin),reserve(fixture.organizationId,signedSource)],
      [elevatedClient(vendorAdmin),reserve(fixture.organizationId,signedSource)],
      [elevatedClient(unrelatedStaff),reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor})]] as const){
      await verifiedApiClaims(client,"aal2");
      const allowed=await client.rpc("mmhr_authorize",{permission_key:"workspace.access",organization_id:request.organizationId});
      expect(allowed.error).toBeNull();expect(allowed.data).toHaveLength(1);
      await expect(reserveFinanceDocument(request,bytes,{supabase:client as RequestSupabaseClient})).rejects.toBeInstanceOf(AuthorizationError);
      const {correlationId,idempotencyKey,declaredMimeType,...payload}=request;
      const denied=await client.rpc("mmhr_reserve_finance_document",{payload:{...payload,contentType:declaredMimeType,byteSize:bytes.length,sha256:hash},
        correlation_id:correlationId,idempotency_key:idempotencyKey});expect(denied.error?.code).toBe("42501");
      const [proof]=await fixture.owner`SELECT count(*)::int count FROM public.workflow_document_versions WHERE id=${request.versionId}::uuid`;expect(proof?.count).toBe(0);
    }
  });
  test("rolls back reservation when audit storage fails and accepts the unchanged retry",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});
    await fixture.owner`CREATE FUNCTION mmhr_private.finance_document_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.command='r7.finance.document.reserve' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`;
    await fixture.owner`CREATE TRIGGER finance_document_test_audit_failure BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION mmhr_private.finance_document_test_audit_failure()`;
    try{await expect(reserveFinanceDocument(request,bytes,staff(0))).rejects.toThrow();
      const [row]=await fixture.owner`SELECT count(*)::int count FROM public.workflow_document_versions WHERE id=${request.versionId}::uuid`;expect(row?.count).toBe(0);
    }finally{await fixture.owner`DROP TRIGGER finance_document_test_audit_failure ON public.audit_events`;
      await fixture.owner`DROP FUNCTION mmhr_private.finance_document_test_audit_failure()`;}
    expect(await reserveFinanceDocument(request,bytes,staff(0))).toMatchObject({outcomeCode:"recorded"});
  });
  journey("rolls back a failed approval and preserves its original request for retry",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);
    const scope={organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId};
    await recordFinanceDocumentReview({...scope,expectedRevision:4,action:"begin_review",reason:"Synthetic rollback review",
      reviewReference:"synthetic:rollback",...metadata()},staff(1));
    const grant=await issueFinanceDocumentAccess({...scope,expectedRevision:5,purpose:"finance_review",...metadata()},staff(1));
    await downloadFinanceDocument({organizationId:internalOrg,accessId:grant.accessId,accessToken:grant.accessToken,correlationId:randomUUID()},staff(1));
    const decision={...scope,expectedRevision:5,action:"approve",reason:"Synthetic rollback approval",reviewReference:"synthetic:rollback",
      reviewedAccessId:grant.accessId,contentsReviewed:true,...metadata()};
    await fixture.owner`CREATE FUNCTION mmhr_private.finance_document_test_decision_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.command='r7.finance.document.review.approve' THEN RAISE EXCEPTION 'Synthetic approval audit failure'; END IF; RETURN NEW; END $$`;
    await fixture.owner`CREATE TRIGGER finance_document_test_decision_failure BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION mmhr_private.finance_document_test_decision_failure()`;
    try{await expect(recordFinanceDocumentReview(decision,staff(1))).rejects.toThrow();
      const [proof]=await fixture.owner`SELECT state,revision,(SELECT count(*)::int FROM public.finance_document_approvals a WHERE a.version_id=u.version_id) approvals
        FROM public.workflow_document_uploads u WHERE u.version_id=${request.versionId}::uuid`;expect(proof).toEqual({state:"needs_review",revision:5,approvals:0});
    }finally{await fixture.owner`DROP TRIGGER finance_document_test_decision_failure ON public.audit_events`;
      await fixture.owner`DROP FUNCTION mmhr_private.finance_document_test_decision_failure()`;}
    expect(await recordFinanceDocumentReview(decision,staff(1))).toMatchObject({state:"approved",revision:6,outcomeCode:"recorded"});
  });
  journey("binds grants to exact roles, sessions, tokens and live finance authority",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);await approve(request);
    const grant=await issueFinanceDocumentAccess({organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,
      expectedRevision:6,purpose:"finance_original",...metadata()},staff(0));
    expect(Date.parse(grant.expiresAt)-Date.parse(grant.issuedAt)).toBe(60_000);
    const input={organizationId:internalOrg,accessId:grant.accessId,accessToken:grant.accessToken,correlationId:randomUUID()};
    await expect(downloadFinanceDocument(input,staff(1))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(downloadFinanceDocument({...input,accessToken:"0".repeat(64)},staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(downloadFinanceDocument({...input,organizationId:fixture.organizationId},staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    await fixture.owner`UPDATE public.user_permission_overrides SET effect='deny' WHERE identity_id=${fixture.pair[0].identityId}::uuid
      AND permission_key='finance.manage' AND organization_id=${internalOrg}::uuid`;
    try{await expect(downloadFinanceDocument(input,staff(0))).rejects.toBeInstanceOf(AuthorizationError);}
    finally{await fixture.owner`UPDATE public.user_permission_overrides SET effect='allow' WHERE identity_id=${fixture.pair[0].identityId}::uuid
      AND permission_key='finance.manage' AND organization_id=${internalOrg}::uuid`;}
    await expect(fixture.owner`UPDATE public.workflow_document_uploads SET state='superseded',revision=revision+1,updated_at=clock_timestamp()
      WHERE version_id=${request.versionId}::uuid`).rejects.toThrow();
    await expect(fixture.owner`UPDATE public.workflow_document_versions SET sha256=${"f".repeat(64)} WHERE id=${request.versionId}::uuid`).rejects.toThrow();
    await expect(fixture.owner`DELETE FROM public.finance_document_approvals WHERE version_id=${request.versionId}::uuid`).rejects.toThrow();
    await expect(fixture.owner`UPDATE mmhr_private.finance_document_access_grants SET purpose='finance_review' WHERE id=${grant.accessId}::uuid`).rejects.toThrow();
  });
  test("denies owner mutations and raw role access to private finance evidence",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await reserveFinanceDocument(request,bytes,staff(0));
    await expect(fixture.owner`UPDATE public.finance_document_sources SET vendor_organization_id=${randomUUID()}::uuid WHERE version_id=${request.versionId}::uuid`).rejects.toThrow();
    await expect(fixture.owner`DELETE FROM public.finance_document_sources WHERE version_id=${request.versionId}::uuid`).rejects.toThrow();
    await expect(fixture.owner`TRUNCATE public.finance_document_sources CASCADE`).rejects.toThrow();
    for(const table of ["finance_document_sources","finance_document_approvals"]){
      expect((await elevatedClient(fixture.pair[0]).from(table).select("*")).error).not.toBeNull();
    }
    const [properties]=await fixture.owner`SELECT p.prosecdef,p.proconfig FROM pg_proc p WHERE p.oid='public.mmhr_reserve_finance_document(jsonb,uuid,uuid)'::regprocedure`;
    expect(properties).toMatchObject({prosecdef:true,proconfig:['search_path=""']});
  });
  test("denies a fabricated uploaded transition despite genuine current finance claims",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await reserveFinanceDocument(request,bytes,staff(0));
    const before=await evidenceCounts(request.versionId);
    await expect(verifiedOwnerContext(elevatedClient(fixture.pair[0]),async sql=>{
      const [authority]=await sql`SELECT mmhr_private.r7_finance_document_actor(${internalOrg}::uuid) actor`;
      expect(authority?.actor).toBe(fixture.pair[0].identityId);
      await sql`UPDATE public.workflow_document_uploads SET state='quarantined',revision=2,updated_at=clock_timestamp() WHERE version_id=${request.versionId}::uuid`;
      await sql`INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id)
        VALUES(${internalOrg}::uuid,${request.versionId}::uuid,2,'uploaded',${fixture.pair[0].identityId}::uuid,'{"state":"quarantined"}'::jsonb,${randomUUID()}::uuid)`;
    })).rejects.toMatchObject({code:"42501",message:"Finance document upload receipt and job missing"});
    expect(before).toMatchObject({state:"received",revision:1,history:1,grants:0});
    expect(await evidenceCounts(request.versionId)).toEqual(before);
  });
  journey("denies receipt-free owner grants despite valid current content authority",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);await approve(request);const id=randomUUID();
    const before=await evidenceCounts(request.versionId);
    await expect(verifiedOwnerContext(elevatedClient(fixture.pair[0]),async sql=>{
      const [authority]=await sql`SELECT mmhr_private.r7_finance_document_content_actor(${internalOrg}::uuid,
        ${request.documentId}::uuid,${request.versionId}::uuid,6,'finance_original') actor`;
      expect(authority?.actor).toBe(fixture.pair[0].identityId);
      const claims=await verifiedApiClaims(elevatedClient(fixture.pair[0]),"aal2");
      await sql`WITH timing AS(SELECT clock_timestamp() t) INSERT INTO mmhr_private.finance_document_access_grants
        (id,organization_id,document_id,version_id,revision,purpose,actor_identity_id,session_id,access_token,created_at,expires_at,correlation_id)
        SELECT ${id}::uuid,${internalOrg}::uuid,${request.documentId}::uuid,${request.versionId}::uuid,6,'finance_original',
          ${fixture.pair[0].identityId}::uuid,${claims.sessionId}::uuid,${"a".repeat(64)},t,t+interval '60 seconds',${randomUUID()}::uuid FROM timing`;
    })).rejects.toMatchObject({code:"42501",message:"Finance document capability receipt missing"});
    const [proof]=await fixture.owner`SELECT count(*)::int count FROM mmhr_private.finance_document_access_grants WHERE id=${id}::uuid`;expect(proof?.count).toBe(0);
    expect(await evidenceCounts(request.versionId)).toEqual(before);
  });
  journey("denies a grant receipt linked to an unrelated audit despite genuine finance authority",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);await approve(request);
    const grantId=randomUUID(),auditId=randomUUID(),correlationId=randomUUID(),idempotencyKey=randomUUID(),before=await evidenceCounts(request.versionId);
    await expect(verifiedOwnerContext(elevatedClient(fixture.pair[0]),async sql=>{
      const [authority]=await sql`SELECT mmhr_private.r7_finance_document_content_actor(${internalOrg}::uuid,
        ${request.documentId}::uuid,${request.versionId}::uuid,6,'finance_original') actor`;
      expect(authority?.actor).toBe(fixture.pair[0].identityId);
      const claims=await verifiedApiClaims(elevatedClient(fixture.pair[0]),"aal2");
      await sql`WITH timing AS(SELECT clock_timestamp() t) INSERT INTO mmhr_private.finance_document_access_grants
        (id,organization_id,document_id,version_id,revision,purpose,actor_identity_id,session_id,access_token,created_at,expires_at,correlation_id)
        SELECT ${grantId}::uuid,${internalOrg}::uuid,${request.documentId}::uuid,${request.versionId}::uuid,6,'finance_original',
          ${fixture.pair[0].identityId}::uuid,${claims.sessionId}::uuid,${"b".repeat(64)},t,t+interval '60 seconds',${correlationId}::uuid FROM timing`;
      await sql`INSERT INTO public.audit_events(id,actor_type,actor_identity_id,organization_id,command,action,entity_type,entity_id,
        reason,correlation_id,idempotency_key) VALUES(${auditId}::uuid,'user',${fixture.pair[0].identityId}::uuid,${internalOrg}::uuid,
          'r7.finance.document.review.begin_review','document.begin_review','workflow_document_version',${request.versionId},
          'Synthetic mismatched audit evidence',${correlationId}::uuid,${idempotencyKey})`;
      await sql`INSERT INTO public.security_command_receipts(actor_identity_id,command,idempotency_key,request_digest,entity_id,action,audit_event_id)
        VALUES(${fixture.pair[0].identityId}::uuid,'r7.finance.document.access.issue',${idempotencyKey}::uuid,
          encode(sha256(convert_to(jsonb_build_object('organizationId',${internalOrg}::uuid,'documentId',${request.documentId}::uuid,
            'versionId',${request.versionId}::uuid,'expectedRevision',6,'purpose','finance_original')::text,'UTF8')),'hex'),
          ${grantId}::uuid,'document.access.requested',${auditId}::uuid)`;
    })).rejects.toMatchObject({code:"42501",message:"Finance document capability receipt missing"});
    expect(await evidenceCounts(request.versionId)).toEqual(before);
    const [proof]=await fixture.owner`SELECT (SELECT count(*)::int FROM mmhr_private.finance_document_access_grants WHERE id=${grantId}::uuid) grants,
      (SELECT count(*)::int FROM public.audit_events WHERE id=${auditId}::uuid) audits`;expect(proof).toEqual({grants:0,audits:0});
  });
  journey("retains approved historical originals when a vendor becomes inactive",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);await approve(request);
    await fixture.owner`UPDATE public.orgs SET status='suspended',suspended_at=clock_timestamp() WHERE id=${agreementVendor}::uuid`;
    try{
      const grant=await issueFinanceDocumentAccess({organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,
        expectedRevision:6,purpose:"finance_original",...metadata()},staff(0));
      expect((await downloadFinanceDocument({organizationId:internalOrg,accessId:grant.accessId,accessToken:grant.accessToken,
        correlationId:randomUUID()},staff(0))).manifest.sha256).toBe(hash);
      expect((await getFinanceDocuments({organizationId:internalOrg,correlationId:randomUUID()},staff(0))).items.some(row=>row.versionId===request.versionId)).toBe(true);
      await expect(reserveFinanceDocument(reserve(internalOrg,request.source),bytes,staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    }finally{await fixture.owner`UPDATE public.orgs SET status='active',suspended_at=NULL WHERE id=${agreementVendor}::uuid`;}
  });
  test("expires actual private grants and denies original issue retries and Storage access",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);await approve(request);
    const issue={organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,expectedRevision:6,purpose:"finance_original",...metadata()};
    const grant=await issueFinanceDocumentAccess(issue,staff(0));
    const remaining=Date.parse(grant.expiresAt)-Date.now();expect(remaining).toBeGreaterThan(0);expect(remaining).toBeLessThanOrEqual(60_000);
    // Real PostgreSQL time verifies capability expiry. RPC statement deadlines remain unchanged.
    await new Promise(resolve=>setTimeout(resolve,remaining+150));
    await expect(issueFinanceDocumentAccess(issue,staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(downloadFinanceDocument({organizationId:internalOrg,accessId:grant.accessId,accessToken:grant.accessToken,
      correlationId:randomUUID()},staff(0))).rejects.toBeInstanceOf(AuthorizationError);
    expect((await elevatedClient(fixture.pair[0]).storage.from("mmhr-document-quarantine").download(
      `${internalOrg}/${request.documentId}/${request.versionId}`)).error).not.toBeNull();
  },90_000);
  test("revokes grant resolution, issue retries and Storage when the genuine session is removed",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await ready(request);await approve(request);
    const options={supabase:elevatedClient(financeStaff) as RequestSupabaseClient};
    const issue={organizationId:internalOrg,documentId:request.documentId,versionId:request.versionId,expectedRevision:6,purpose:"finance_original",...metadata()};
    const grant=await issueFinanceDocumentAccess(issue,options),claims=await verifiedApiClaims(elevatedClient(financeStaff),"aal2");
    await fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
    await expect(issueFinanceDocumentAccess(issue,options)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(downloadFinanceDocument({organizationId:internalOrg,accessId:grant.accessId,accessToken:grant.accessToken,
      correlationId:randomUUID()},options)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await elevatedClient(financeStaff).storage.from("mmhr-document-quarantine").download(
      `${internalOrg}/${request.documentId}/${request.versionId}`)).error).not.toBeNull();
  },60_000);
  test("checks the finance review reference boundary through genuine signed requests",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});
    await ready(request);
    const before=await evidenceCounts(request.versionId);
    expect(before).toMatchObject({state:"ready",revision:4});
    for(const reviewReference of ["a".repeat(501),"synthetic?review"]){
      const input={organizationId:request.organizationId,documentId:request.documentId,versionId:request.versionId,
        expectedRevision:4,action:"begin_review",reason:"Synthetic content review started",reviewReference,...metadata()};
      const {correlationId,idempotencyKey,...payload}=input;
      const response=await elevatedClient(fixture.pair[1]).rpc("mmhr_record_finance_document_review",{
        payload,correlation_id:correlationId,idempotency_key:idempotencyKey});
      expect(response.data).toBeNull();
      expect(response.error).toMatchObject({code:"22023",message:"Invalid document review"});
      expect(await evidenceCounts(request.versionId)).toEqual(before);
    }
    const input={organizationId:request.organizationId,documentId:request.documentId,versionId:request.versionId,
      expectedRevision:4,action:"begin_review",reason:"Synthetic content review started",reviewReference:"a".repeat(500),...metadata()};
    const {correlationId,idempotencyKey,...payload}=input;
    const response=await elevatedClient(fixture.pair[1]).rpc("mmhr_record_finance_document_review",{
      payload,correlation_id:correlationId,idempotency_key:idempotencyKey});
    expect(response.error).toBeNull();
    expect(response.data).toMatchObject({state:"needs_review",revision:5,action:"begin_review",outcomeCode:"recorded"});
    expect(await evidenceCounts(request.versionId)).toMatchObject({state:"needs_review",revision:5,history:before.history+1});
    const [event]=await fixture.owner`SELECT snapshot->>'reviewReference' AS reference FROM public.workflow_document_upload_events
      WHERE version_id=${request.versionId}::uuid AND revision=5`;
    expect(event?.reference).toBe(input.reviewReference);
  },60_000);
  async function approvedSourceOriginal(organizationId:string,source:FinanceDocumentSource){
    const request=reserve(organizationId,source);await ready(request);await approve(request);
    return {documentId:request.documentId,versionId:request.versionId};
  }
  registerFinanceDocumentSourceRegressions(()=>({fixture,internalOrganizationId:internalOrg,
    agreementVendorOrganizationId:agreementVendor,unrelatedStaff,signedSource,
    approvedAgreementOriginal:()=>approvedSourceOriginal(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor}),
    approvedSignedOriginal:()=>approvedSourceOriginal(fixture.organizationId,signedSource)}));
  registerFinanceDemoEvidenceRegressions(()=>({fixture,customer:signedPortal.customer,vendor:signedPortal.vendor,
    vendorOrganizationId:signedSource.vendorOrganizationId,candidateId:signedPortal.candidateId,recipientId:signedPortal.recipientId,
    approvedFinanceOriginal:()=>approvedSourceOriginal(fixture.organizationId,signedSource),
    approvedWorkspaceOriginal:()=>createApprovedWorkspaceDemoEvidence(fixture,worker,new Uint8Array(bytes))}));
  registerFinanceUploadRecoveryRegressions(()=>({fixture,internalOrganizationId:internalOrg,
    agreementVendorOrganizationId:agreementVendor,unrelatedStaff,vendorAdmin,bytes:new Uint8Array(bytes),
    reservation:reserve,ready,claim:versionId=>worker.repository.claim(versionId),verifiedOwnerContext}));
  test("rejects still-signed sessions after finance denial, provider ban and session deletion",async()=>{
    const request=reserve(internalOrg,{sourceClass:"agreement",vendorOrganizationId:agreementVendor});await reserveFinanceDocument(request,bytes,staff(0));
    await fixture.owner`UPDATE public.user_permission_overrides SET effect='deny' WHERE identity_id=${fixture.pair[0].identityId}::uuid
      AND permission_key='finance.manage' AND organization_id=${internalOrg}::uuid`;
    try{await expect(reserveFinanceDocument(request,bytes,staff(0))).rejects.toBeInstanceOf(AuthorizationError);}
    finally{await fixture.owner`UPDATE public.user_permission_overrides SET effect='allow' WHERE identity_id=${fixture.pair[0].identityId}::uuid
      AND permission_key='finance.manage' AND organization_id=${internalOrg}::uuid`;}
    await fixture.owner`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${fixture.pair[0].subjectId}::uuid`;
    try{await expect(reserveFinanceDocument(request,bytes,staff(0))).rejects.toBeInstanceOf(AuthorizationError);}
    finally{await fixture.owner`UPDATE auth.users SET banned_until=NULL WHERE id=${fixture.pair[0].subjectId}::uuid`;}
    const claims=await verifiedApiClaims(elevatedClient(fixture.pair[0]),"aal2");
    await fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
    await expect(reserveFinanceDocument(request,bytes,staff(0))).rejects.toBeInstanceOf(AuthorizationError);
  });
});
