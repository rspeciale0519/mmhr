import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  currentEvaluationPublicationResultSchema,
} from "@/server/commands/current-evaluation-publication";
import { publicationReadSchema } from "@/server/matching/option-publication-contract";
import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  createCommandFixture,
  createMembership,
  createSecurityPrincipal,
  rollbackCase,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  CONFIG,
  addContributor,
  addPortalGrant,
  prepare,
  publish,
  publicationPayload,
  readPublication,
  seedSubmittedIntake,
  seedVendorOption,
  type SeededInput,
} from "./r3-evaluation-publication-fixtures";

describe("R3 current evaluation publication discovery", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customerContributor: SecurityPrincipal;

  beforeAll(async () => {
    context = await startRehearsal("r3-current-publication");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const value = await createCommandFixture(sql);
      customerContributor = await createSecurityPrincipal(sql);
      await addContributor(sql, value.organizationId, customerContributor);
      await addPortalGrant(sql, value.organizationId, value.pair[1].identityId);
      return value;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  async function current(
    sql: SecurityTransaction,
    principal: SecurityPrincipal,
    intakeId: string,
    limit = 25,
    assurance: "aal1" | "aal2" = "aal1",
  ) {
    return asAuthenticated(sql, principal, async (probe) => {
      const correlationId = randomUUID();
      const [row] = await probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_get_current_evaluation_publication(
          ${JSON.stringify({ organizationId: fixture.organizationId, intakeId, limit })}::jsonb,
          ${correlationId}::uuid
        ) AS result
      `;
      const parsed = currentEvaluationPublicationResultSchema.parse(row!.result);
      expect(parsed.correlationId).toBe(correlationId);
      return parsed;
    }, assurance);
  }

  async function currentRaw(
    sql: SecurityTransaction,
    principal: SecurityPrincipal,
    payload: unknown,
    assurance: "aal1" | "aal2" = "aal1",
  ) {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: unknown }[]>`
        SELECT public.mmhr_get_current_evaluation_publication(
          ${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid
        ) AS result
      `;
      return row!.result;
    }, assurance);
  }

  async function seedDraft(sql: SecurityTransaction) {
    const intakeId = randomUUID();
    await sql`
      INSERT INTO public.intakes (
        id, organization_id, status, created_by_identity_id, updated_by_identity_id
      ) VALUES (
        ${intakeId}::uuid, ${fixture.organizationId}::uuid, 'draft',
        ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
      )
    `;
    return intakeId;
  }

  async function publishOptions(sql: SecurityTransaction, index: number, count = 6) {
    const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
    const inputs: SeededInput[] = [];
    for (let offset = 0; offset < count; offset += 1) {
      inputs.push(await seedVendorOption(sql, fixture, index + offset));
    }
    const payload = { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG };
    const prepared = await prepare(sql, fixture.pair[0], payload);
    const published = await publish(sql, fixture.pair[0], {
      organizationId: fixture.organizationId,
      publicationId: prepared.publicationId,
      expectedDigest: prepared.inputDigest,
      approvalReference: `current-publication-${index}`,
      reason: "Publish current customer options",
    });
    return { intakeId, inputs, prepared, published };
  }

  test("returns the exact empty wrapper for submitted and draft intakes", async () => {
    await rollbackCase(context!, async (sql) => {
      const submittedId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const draftId = await seedDraft(sql);
      const submitted = await current(sql, customerContributor, submittedId);
      const draft = await current(sql, customerContributor, draftId);
      expect(submitted.publication).toBeNull();
      expect(draft.publication).toBeNull();
      expect(submitted.organizationId).toBe(fixture.organizationId);
      expect(submitted.intakeId).toBe(submittedId);
    });
  }, 120_000);

  test("denies unauthorized, missing, and foreign intake scopes", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      await expect(current(sql, fixture.target, intakeId)).rejects.toMatchObject({ code: "42501" });
      await expect(current(sql, customerContributor, randomUUID())).rejects.toMatchObject({ code: "42501" });

      const foreignOrganizationId = randomUUID();
      const foreignIntakeId = randomUUID();
      await sql`
        INSERT INTO public.orgs (id, name, type, status, activated_at, migration_review_required)
        VALUES (${foreignOrganizationId}::uuid, 'Foreign current publication org', 'customer', 'active', now(), false)
      `;
      await createMembership(sql, foreignOrganizationId, fixture.organizationAdmin, "organization_admin");
      await sql`
        INSERT INTO public.intakes (id, organization_id, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${foreignIntakeId}::uuid, ${foreignOrganizationId}::uuid, 'submitted',
          ${fixture.organizationAdmin.identityId}::uuid, ${fixture.organizationAdmin.identityId}::uuid)
      `;
      await expect(current(sql, customerContributor, foreignIntakeId)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("rejects malformed current-publication payloads with stable input errors", async () => {
    await rollbackCase(context!, async (sql) => {
      const malformed = [
        null,
        [],
        "not an object",
        { organizationId: fixture.organizationId, intakeId: randomUUID(), limit: 0 },
        { organizationId: fixture.organizationId, intakeId: randomUUID(), limit: 51 },
        { organizationId: fixture.organizationId, intakeId: randomUUID(), limit: 1.5 },
        { organizationId: fixture.organizationId, intakeId: randomUUID(), extra: true },
      ];
      for (const payload of malformed) {
        await expect(sql.savepoint((probe) => currentRaw(probe, customerContributor, payload)))
          .rejects.toMatchObject({ code: "22023" });
      }
    });
  }, 120_000);

  test("returns a bounded masked first page and keeps later pages explicit", async () => {
    await rollbackCase(context!, async (sql) => {
      const { intakeId, published } = await publishOptions(sql, 10, 6);
      const first = await current(sql, customerContributor, intakeId, 3);
      expect(first.publication).not.toBeNull();
      const publication = publicationReadSchema.parse(first.publication);
      expect(publication).toMatchObject({
        publicationId: published.publicationId,
        state: "published",
        optionCount: 6,
      });
      expect(publication.options).toHaveLength(3);
      expect(publication.options.map((option) => option.ordinal)).toEqual([1, 2, 3]);
      expect(publication.nextOrdinal).toBe(3);
      expect(JSON.stringify(publication)).not.toMatch(/vendorOrganizationId|productId|sourceId|evidenceId/);

      const second = publicationReadSchema.parse(await readPublication(sql, customerContributor, "get", publicationPayload(
        fixture.organizationId, intakeId, String(published.publicationId), 3, 10,
      ), "aal1"));
      expect(second.options).toHaveLength(3);
      expect(second.options.map((option) => option.ordinal)).toEqual([4, 5, 6]);
      expect(second.nextOrdinal).toBeNull();
    });
  }, 180_000);

  test("does not replace a published version with a newer prepared version, then revokes without fallback", async () => {
    await rollbackCase(context!, async (sql) => {
      const { intakeId, prepared: firstPrepared, published: firstPublished } = await publishOptions(sql, 20, 6);
      const newerPrepared = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
      });
      const beforePublish = await current(sql, customerContributor, intakeId);
      expect(beforePublish.publication).toMatchObject({ publicationId: firstPublished.publicationId });
      expect(newerPrepared.publicationId).not.toBe(firstPrepared.publicationId);

      const newerPublished = await publish(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId: newerPrepared.publicationId,
        expectedDigest: newerPrepared.inputDigest, approvalReference: "current-replacement",
        reason: "Publish replacement",
      });
      const afterPublish = await current(sql, customerContributor, intakeId);
      expect(afterPublish.publication).toMatchObject({ publicationId: newerPublished.publicationId });

      await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        await probe`SELECT public.mmhr_revoke_evaluation_publication(
          ${JSON.stringify({ organizationId: fixture.organizationId, publicationId: newerPublished.publicationId, reason: "Revoke current" })}::jsonb,
          ${randomUUID()}::uuid, ${randomUUID()}::uuid
        )`;
      });
      const afterRevoke = await current(sql, customerContributor, intakeId);
      expect(afterRevoke.publication).toBeNull();
    });
  }, 180_000);

  test("rejects a current publication after approved inputs change", async () => {
    await rollbackCase(context!, async (sql) => {
      const { intakeId, inputs } = await publishOptions(sql, 40, 6);
      const before = await current(sql, customerContributor, intakeId);
      expect(before.publication).not.toBeNull();
      await sql`UPDATE public.vendor_evidence_versions SET fresh_until = now() - interval '1 hour' WHERE id = ${inputs[0]!.evidenceId}::uuid`;
      await sql`UPDATE public.vendor_sources SET active = false WHERE id = ${inputs[0]!.sourceId}::uuid`;
      await expect(current(sql, customerContributor, intakeId)).rejects.toMatchObject({ code: "42501" });
    });
  }, 180_000);
});
