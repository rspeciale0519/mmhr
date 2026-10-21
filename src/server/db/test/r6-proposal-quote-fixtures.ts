import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { asAuthenticated, createMembership, createSecurityPrincipal, type SecurityCommandFixture, type SecurityTokenPrincipal, type SecurityTransaction } from "../r1-security-command-fixtures";
import { addContributor, addPortalGrant, CONFIG, prepare, publish, seedSubmittedIntake, seedVendorOption } from "../r3-evaluation-publication-fixtures";
import type { ProposalQuote } from "@/lib/proposal-quote";

export const syntheticQuote: ProposalQuote = {
  quoteReference: "Synthetic portal quote", quoteDate: "2026-01-01", quoteSummary: "Synthetic software scope and commercial terms.",
  pricing: { currency: "USD", implementationCostMinorUnits: 100001, recurringCostMinorUnits: 12345,
    recurringPeriod: "monthly", recurringCostBasis: "50 employees", optionalCostMinorUnits: null,
    optionalCostDescription: null, discountMinorUnits: 0, discountDescription: null, termMonths: 12,
    termsAndAssumptions: ["Synthetic configuration only"], customerRequestedChanges: [] },
};

// Database fixtures model Auth input rows. Genuine signed-token checks run
// separately; this helper does not prove a real participant's approval.
export async function seedQuoteWorkflow(sql: SecurityTransaction, fixture: SecurityCommandFixture,
  actors: { customer: SecurityTokenPrincipal; vendors: readonly [SecurityTokenPrincipal,SecurityTokenPrincipal] } | undefined = undefined) {
  const customer = actors?.customer ?? await createSecurityPrincipal(sql);
  await addContributor(sql, fixture.organizationId, customer);
  await addPortalGrant(sql, fixture.organizationId, fixture.pair[0].identityId);
  await createMembership(sql,fixture.organizationId,fixture.pair[1]);
  await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
    VALUES(${fixture.pair[1].identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,
    ${`organization:${fixture.organizationId}`},'allow',${fixture.pair[0].identityId}::uuid,'Synthetic proposal fixture')`;
  const intakeId = await seedSubmittedIntake(sql,fixture,customer);
  const vendors = [];
  for (const index of [1,2]) {
    const seeded = await seedVendorOption(sql,fixture,index);
    const [vendor] = await sql<{ organization_id: string; vendor_profile_id: string }[]>`
      SELECT organization_id,vendor_profile_id FROM public.products WHERE id=${seeded.productId}::uuid`;
    const actor = actors?.vendors[index-1] ?? await createSecurityPrincipal(sql);
    await addContributor(sql,vendor!.organization_id,actor);
    await sql`INSERT INTO public.portal_access_grants(organization_id,portal,issued_by_identity_id,issue_reason)
      VALUES(${vendor!.organization_id}::uuid,'vendor',${fixture.pair[0].identityId}::uuid,'Synthetic proposal fixture')`;
    vendors.push({ organizationId: vendor!.organization_id, profileId: vendor!.vendor_profile_id, actor, productId: seeded.productId });
  }
  const input = { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG };
  const publication = await prepare(sql,fixture.pair[0],input);
  await publish(sql,fixture.pair[0],{ organizationId:fixture.organizationId,publicationId:publication.publicationId,
    expectedDigest:publication.inputDigest,approvalReference:"approval:synthetic-quotes",reason:"Synthetic quote workflow" });
  const options = await sql<{ id: string; product_id: string }[]>`SELECT id,product_id
    FROM public.evaluation_publication_options WHERE organization_id=${fixture.organizationId}::uuid
      AND publication_id=${String(publication.publicationId)}::uuid
      AND product_id IN (${vendors[0]!.productId}::uuid,${vendors[1]!.productId}::uuid) ORDER BY ordinal`;
  expect(options).toHaveLength(2);
  expect(new Set(options.map(option => option.product_id))).toEqual(new Set(vendors.map(vendor => vendor.productId)));
  await invoke(sql,customer,"mmhr_select_initial_evaluation_options",{ organizationId:fixture.organizationId,intakeId,
    publicationId:publication.publicationId,expectedDigest:publication.inputDigest,optionIds:options.map((option)=>option.id) },"aal1");
  const review = await read(sql,fixture.pair[0],"mmhr_get_evaluation_disclosure_review",{ organizationId:fixture.organizationId,intakeId,pageSize:25 });
  for (const item of review.items as { candidateId: string; reviewDigest: string }[]) {
    await invoke(sql,fixture.pair[0],"mmhr_record_evaluation_disclosure",{ organizationId:fixture.organizationId,intakeId,
      candidateId:item.candidateId,expectedReviewDigest:item.reviewDigest,discussionAt:new Date(Date.now()-60000).toISOString(),
      discussionReference:"Synthetic customer discussion",conflictDisclosure:"Synthetic commission disclosure",reason:"Synthetic quote workflow" });
  }
  const rfpId=randomUUID();
  await invoke(sql,fixture.pair[0],"mmhr_create_rfp_questionnaire",{ organizationId:fixture.organizationId,intakeId,rfpId,sourceRevision:2,
    title:"Synthetic proposal request",content:"Describe payroll support and quoted terms." });
  await invoke(sql,fixture.pair[1],"mmhr_approve_rfp_version",{ organizationId:fixture.organizationId,rfpId,version:1,
    actorIdentityId:fixture.pair[1].identityId,approvalReference:"approval:synthetic-proposal-rfp" });
  const workflow = await read(sql,fixture.pair[0],"mmhr_get_rfp_workflow",{ organizationId:fixture.organizationId,intakeId });
  await invoke(sql,fixture.pair[0],"mmhr_deliver_rfp_to_portals",{ organizationId:fixture.organizationId,rfpId,version:1,
    deadlineAt:new Date(Date.now()+7*86400000).toISOString(),expectedDigest:(workflow.rfps as { deliveryDigest: string }[])[0]!.deliveryDigest });
  const choices = [];
  for (const vendor of vendors) {
    const [scope] = await sql<{ recipient_id: string; candidate_id: string }[]>`SELECT rr.id recipient_id,c.id candidate_id
      FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.id=rr.rfp_version_id
      JOIN public.evaluation_candidates c ON c.intake_id=r.source_intake_id AND c.organization_id=r.organization_id
      WHERE r.rfp_id=${rfpId}::uuid AND rr.vendor_organization_id=${vendor.organizationId}::uuid AND c.product_id=${vendor.productId}::uuid`;
    expect(scope).toBeDefined();
    await invoke(sql,fixture.pair[0],"mmhr_record_demo_coordination",{ action:"create",organizationId:fixture.organizationId,
      candidateId:scope!.candidate_id,recipientId:scope!.recipient_id,plan:{ round:1,audience:"Payroll team",purpose:"Check synthetic requirements",format:"remote",
        participants:[{name:"Synthetic customer",role:"Owner",organization:"customer"}],requiredTopics:["Payroll exports"] } });
    choices.push({...vendor,recipientId:scope!.recipient_id});
  }
  return { intakeId, customer, vendors: choices };
}

export async function invoke(sql: SecurityTransaction,actor: SecurityTokenPrincipal,name: string,payload: object,
  assurance: "aal1" | "aal2"="aal2",key=randomUUID()) {
  return asAuthenticated(sql,actor,async(probe)=>{
    const [row]=await probe<{ result: Record<string, unknown> }[]>`SELECT public.${probe(name)}(${JSON.stringify(payload)}::jsonb,${randomUUID()}::uuid,${key}::uuid) result`;
    return row!.result;
  },assurance);
}
export async function read(sql: SecurityTransaction,actor: SecurityTokenPrincipal,name: string,payload: object,assurance: "aal1" | "aal2"="aal2") {
  return asAuthenticated(sql,actor,async(probe)=>{
    const [row]=await probe<{ result: Record<string, unknown> }[]>`SELECT public.${probe(name)}(${JSON.stringify(payload)}::jsonb,${randomUUID()}::uuid) result`;
    return row!.result;
  },assurance);
}
