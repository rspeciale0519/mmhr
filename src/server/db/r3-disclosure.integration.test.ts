import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createMembership, createSecurityPrincipal, rollbackCase, type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";
import { CONFIG, addContributor, addPortalGrant, createCommandFixture, fixtureDates, prepare, publish, seedSubmittedIntake, seedVendorOption } from "./r3-evaluation-publication-fixtures";
import { evaluationDisclosureReviewResultSchema, evaluationDisclosuresResultSchema, recordEvaluationDisclosureResultSchema } from "@/server/commands/evaluation-disclosure";
import { rfpWorkflowResultSchema, vendorRfpsResultSchema } from "@/server/commands/rfp-portal";

describe("reviewed provider disclosure", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customer: SecurityPrincipal;
  beforeAll(async () => {
    context = await startRehearsal("disclosure");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      customer = await createSecurityPrincipal(sql);
      await addContributor(sql, f.organizationId, customer);
      await addPortalGrant(sql, f.organizationId, f.pair[1].identityId);
      await createMembership(sql,f.organizationId,f.pair[1]);
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${f.pair[1].identityId}::uuid,'workspace.access','organization',${f.organizationId}::uuid,${`organization:${f.organizationId}`},'allow',${f.pair[0].identityId}::uuid,'Synthetic independent RFP reviewer')`;
      return f;
    });
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  async function seed(sql: SecurityTransaction) {
    const intakeId = await seedSubmittedIntake(sql, fixture, customer);
    await seedVendorOption(sql, fixture, 1, fixtureDates());
    const prepared = await prepare(sql, fixture.pair[0], { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG });
    await publish(sql, fixture.pair[0], { organizationId: fixture.organizationId, publicationId: prepared.publicationId, expectedDigest: prepared.inputDigest, approvalReference: "approval:disclosure-fixture", reason: "Synthetic approved comparison" });
    const [option] = await sql<{ id: string }[]>`SELECT id FROM public.evaluation_publication_options WHERE publication_id=${String(prepared.publicationId)}::uuid`;
    await asAuthenticated(sql, customer, async (probe) => {
      await probe`SELECT public.mmhr_select_initial_evaluation_options(${JSON.stringify({ organizationId: fixture.organizationId, intakeId, publicationId: prepared.publicationId, expectedDigest: prepared.inputDigest, optionIds: [option!.id] })}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`;
    }, "aal1");
    return { organizationId: fixture.organizationId, intakeId };
  }

  async function review(sql: SecurityTransaction, input: unknown, principal = fixture.pair[0], assurance: "aal1" | "aal2" = "aal2") {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: unknown }[]>`SELECT public.mmhr_get_evaluation_disclosure_review(${JSON.stringify(input)}::jsonb,${randomUUID()}::uuid) result`;
      return evaluationDisclosureReviewResultSchema.parse(row!.result);
    }, assurance);
  }
  async function history(sql: SecurityTransaction, input: unknown) {
    return asAuthenticated(sql, customer, async (probe) => {
      const [row] = await probe<{ result: unknown }[]>`SELECT public.mmhr_get_evaluation_disclosures(${JSON.stringify(input)}::jsonb,${randomUUID()}::uuid) result`;
      return evaluationDisclosuresResultSchema.parse(row!.result);
    }, "aal1");
  }
  async function disclose(sql: SecurityTransaction, input: unknown, key = randomUUID(), principal = fixture.pair[0], assurance: "aal1" | "aal2" = "aal2") {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: unknown }[]>`SELECT public.mmhr_record_evaluation_disclosure(${JSON.stringify(input)}::jsonb,${randomUUID()}::uuid,${key}::uuid) result`;
      return recordEvaluationDisclosureResultSchema.parse(row!.result);
    }, assurance);
  }
  async function command(sql: SecurityTransaction) {
    const input = await seed(sql);
    const page = await review(sql, input);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.canDisclose).toBe(true);
    return { ...input, candidateId: page.items[0]!.candidateId, expectedReviewDigest: page.items[0]!.reviewDigest,
      discussionAt: new Date(Date.now()-60_000).toISOString(), discussionReference: "Synthetic review meeting",
      conflictDisclosure: "Synthetic commission disclosure", reason: "Synthetic completed customer discussion" };
  }

  test("keeps names hidden until staff disclosure and replays without duplicate records", async () => {
    await rollbackCase(context!, async (sql) => {
      const input = await command(sql);
      const pageInput = { organizationId: input.organizationId, intakeId: input.intakeId };
      expect((await history(sql,pageInput)).items).toEqual([]);
      const key = randomUUID();
      const result = await disclose(sql,input,key);
      expect(result.outcomeCode).toBe("recorded");
      expect(await disclose(sql,input,key)).toMatchObject({ disclosureId: result.disclosureId, outcomeCode: "replayed" });
      const page = await history(sql,pageInput);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ conflictDisclosure: input.conflictDisclosure, candidateId: input.candidateId });
      await expect(sql.savepoint(async (probe) => { await probe`UPDATE public.evaluation_disclosures SET reason='changed' WHERE id=${result.disclosureId}::uuid`; })).rejects.toThrow();
      await expect(asAuthenticated(sql, customer, async (probe) => { await probe`SELECT * FROM public.evaluation_disclosures`; },"aal1")).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("denies customer review, low assurance, changed digest and foreign scope", async () => {
    await rollbackCase(context!, async (sql) => {
      const input = await command(sql);
      const pageInput = { organizationId: input.organizationId, intakeId: input.intakeId };
      await expect(review(sql,pageInput,customer,"aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(review(sql,pageInput,fixture.pair[0],"aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(disclose(sql,input,randomUUID(),customer,"aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(disclose(sql,{ ...input, expectedReviewDigest: "0".repeat(64) })).rejects.toMatchObject({ code: "42501" });
      await expect(disclose(sql,{ ...input, intakeId: randomUUID() })).rejects.toMatchObject({ code: "42501" });
      await expect(disclose(sql,{ ...input, discussionAt: "2099-01-01T00:00:00Z" })).rejects.toMatchObject({ code: "22023" });
      expect((await history(sql,pageInput)).items).toEqual([]);
    });
  });
  test("does not hide a published candidate behind legacy candidates on a small page",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const input=await seed(sql);
      const original=await review(sql,input);
      for(let index=2;index<=3;index++) {
        const vendor=await seedVendorOption(sql,fixture,index,fixtureDates());
        const legacyId=`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
        await sql`INSERT INTO public.evaluation_candidates(id,organization_id,intake_id,product_id,vendor_organization_id,created_by_identity_id,updated_by_identity_id)
          SELECT ${legacyId}::uuid,${fixture.organizationId}::uuid,${input.intakeId}::uuid,id,organization_id,${fixture.pair[0].identityId}::uuid,${fixture.pair[0].identityId}::uuid
          FROM public.products WHERE id=${vendor.productId}::uuid`;
      }
      const page=await review(sql,{...input,pageSize:1});
      expect(page.items.map(item=>item.candidateId)).toEqual(original.items.map(item=>item.candidateId));
      expect(page.nextCursor).toBeNull();
    });
  },40_000);
  test("delivers the approved questionnaire only after disclosure and only to the selected vendor portal", async () => {
    await rollbackCase(context!,async(sql)=>{
      const input=await command(sql);
      const rfpId=randomUUID();
      const content="Synthetic RFP: Explain payroll processing, data migration, implementation timing, and pricing.";
      const createInput={organizationId:fixture.organizationId,intakeId:input.intakeId,rfpId,sourceRevision:2,title:"Synthetic payroll RFP",content};
      await asAuthenticated(sql,fixture.pair[0],async(probe)=>{
        await probe`SELECT public.mmhr_create_rfp_questionnaire(${JSON.stringify(createInput)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`;
      });
      const approval={organizationId:fixture.organizationId,rfpId,version:1,actorIdentityId:fixture.pair[0].identityId,approvalReference:"approval:synthetic-review"};
      await asAuthenticated(sql,fixture.pair[0],async(probe)=>{
        await probe`SELECT public.mmhr_approve_rfp_version(${JSON.stringify(approval)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`;
      });
      async function workflow() {return asAuthenticated(sql,customer,async(probe)=>{
        const [row]=await probe<{result:unknown}[]>`SELECT public.mmhr_get_rfp_workflow(${JSON.stringify({organizationId:fixture.organizationId,intakeId:input.intakeId})}::jsonb,${randomUUID()}::uuid) result`;
        return rfpWorkflowResultSchema.parse(row!.result);
      },"aal1");}
      const before=await workflow(); expect(before.readyToDeliver).toBe(false);
      const delivery={organizationId:fixture.organizationId,rfpId,version:1,deadlineAt:"2030-01-01T00:00:00Z",expectedDigest:before.rfps[0]!.deliveryDigest};
      async function deliver(payload:unknown,key=randomUUID()) {return asAuthenticated(sql,fixture.pair[0],async(probe)=>{
        const [row]=await probe<{result:unknown}[]>`SELECT public.mmhr_deliver_rfp_to_portals(${JSON.stringify(payload)}::jsonb,${randomUUID()}::uuid,${key}::uuid) result`;
        return row!.result;
      });}
      await expect(deliver(delivery)).rejects.toMatchObject({code:"42501"});
      await disclose(sql,input);
      const ready=await workflow();expect(ready.readyToDeliver).toBe(true);
      await expect(deliver(delivery)).rejects.toMatchObject({code:"42501"});
      const key=randomUUID();const exact={...delivery,expectedDigest:ready.rfps[0]!.deliveryDigest};
      expect(await deliver(exact,key)).toMatchObject({status:"distributed"});
      expect(await deliver(exact,key)).toMatchObject({status:"distributed"});
      const [recipient]=await sql<{vendor_organization_id:string}[]>`SELECT vendor_organization_id FROM public.rfp_recipients WHERE rfp_version_id=${rfpId}::uuid`;
      expect(recipient).toBeDefined();
      await sql`INSERT INTO public.portal_access_grants(organization_id,portal,issued_by_identity_id,issue_reason)
        VALUES(${recipient!.vendor_organization_id}::uuid,'vendor',${fixture.pair[0].identityId}::uuid,'Synthetic vendor inbox')`;
      const inbox=await asAuthenticated(sql,fixture.organizationAdmin,async(probe)=>{
        const [row]=await probe<{result:unknown}[]>`SELECT public.mmhr_get_vendor_rfps(${JSON.stringify({organizationId:recipient!.vendor_organization_id})}::jsonb,${randomUUID()}::uuid) result`;
        return vendorRfpsResultSchema.parse(row!.result);
      },"aal1");
      expect(inbox.items).toHaveLength(1);expect(inbox.items[0]!.content).toBe(content);
      await expect(asAuthenticated(sql,customer,async(probe)=>{
        await probe`SELECT public.mmhr_get_vendor_rfps(${JSON.stringify({organizationId:recipient!.vendor_organization_id})}::jsonb,${randomUUID()}::uuid)`;
      },"aal1")).rejects.toMatchObject({code:"42501"});
      await expect(sql.savepoint(async(probe)=>{await probe`UPDATE public.rfp_versions SET sections='[]'::jsonb WHERE id=${rfpId}::uuid`;})).rejects.toMatchObject({code:"42501"});
      expect((await workflow()).rfps[0]).toMatchObject({status:"distributed",recipientCount:1});
    });
  },40_000);
});
