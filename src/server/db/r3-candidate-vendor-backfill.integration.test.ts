import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  createCommandFixture,
  type SecurityPrincipal,
  type SecuritySql,
  type SecurityTransaction,
  type SecurityCommandFixture,
} from "./r1-security-command-fixtures";

type Journal = {
  version: string;
  dialect: string;
  entries: { tag: string }[];
};

type CandidateIds = {
  organizationId: string;
  intakeId: string;
  productId: string;
  candidateId: string;
  maskId: string;
  scorecardId: string;
  scoreId: string;
  actorIdentityId: string;
  addCorrelationId: string;
  addIdempotencyKey: string;
};

type PopulatedSnapshot = {
  candidate: unknown;
  mask: unknown;
  scorecard: unknown;
  scorecardCriteria: unknown[];
  scorecardEntries: unknown[];
  scorecardHistory: unknown[];
  auditEvents: unknown[];
  receipts: unknown[];
};

async function applyMigrationsThrough110(context: RehearsalContext) {
  const drizzleRoot = path.join(process.cwd(), "drizzle");
  const prefixRoot = path.join(context.scratchRoot, "pre-0111-candidate-vendor-drizzle");
  const journal = JSON.parse(
    await readFile(path.join(drizzleRoot, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  const boundary = journal.entries.findIndex(
    (entry) => entry.tag === "0111_r3_candidate_vendor_scope",
  );
  if (boundary !== 111 || journal.entries[110]?.tag !== "0110_r3_customer_intake_submit") {
    throw new Error("The candidate vendor rehearsal prefix is not the reviewed 0110 sequence");
  }

  await mkdir(path.join(prefixRoot, "meta"), { recursive: true });
  const prefix = journal.entries.slice(0, boundary);
  for (const entry of prefix) {
    if (!/^\d{4}_[a-z0-9_-]+$/.test(entry.tag)) {
      throw new Error(`Invalid migration tag in candidate vendor prefix: ${entry.tag}`);
    }
    await copyFile(
      path.join(drizzleRoot, `${entry.tag}.sql`),
      path.join(prefixRoot, `${entry.tag}.sql`),
    );
  }
  await writeFile(
    path.join(prefixRoot, "meta", "_journal.json"),
    `${JSON.stringify({ ...journal, entries: prefix }, null, 2)}\n`,
    "utf8",
  );
  await migrate(context.db, { migrationsFolder: prefixRoot });
}

async function snapshotPopulatedCandidate(
  sql: SecuritySql,
  ids: CandidateIds,
): Promise<PopulatedSnapshot> {
  const [candidate] = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(ec) - 'vendor_organization_id' AS row
    FROM public.evaluation_candidates AS ec
    WHERE ec.id = ${ids.candidateId}::uuid
      AND ec.organization_id = ${ids.organizationId}::uuid
  `;
  const [mask] = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(m) AS row
    FROM public.evaluation_candidate_masks AS m
    WHERE m.id = ${ids.maskId}::uuid
      AND m.organization_id = ${ids.organizationId}::uuid
  `;
  const [scorecard] = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(sc) AS row
    FROM public.scorecards AS sc
    WHERE sc.id = ${ids.scorecardId}::uuid
      AND sc.organization_id = ${ids.organizationId}::uuid
  `;
  const scorecardCriteria = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(criteria) AS row
    FROM public.scorecard_criteria AS criteria
    WHERE criteria.scorecard_id = ${ids.scorecardId}::uuid
      AND criteria.organization_id = ${ids.organizationId}::uuid
    ORDER BY criteria.id
  `;
  const scorecardEntries = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(entries) AS row
    FROM public.scorecard_entries AS entries
    WHERE entries.scorecard_id = ${ids.scorecardId}::uuid
      AND entries.organization_id = ${ids.organizationId}::uuid
    ORDER BY entries.id
  `;
  const scorecardHistory = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(history) AS row
    FROM public.scorecard_entry_history AS history
    WHERE history.scorecard_id = ${ids.scorecardId}::uuid
      AND history.organization_id = ${ids.organizationId}::uuid
    ORDER BY history.id
  `;
  const auditEvents = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(events) AS row
    FROM public.audit_events AS events
    WHERE events.organization_id = ${ids.organizationId}::uuid
      AND events.command IN (
        'r3.candidate.add', 'r3.candidate.transition', 'r3.candidate.mask',
        'r3.scorecard.create', 'r3.scorecard.entry.record'
      )
      AND events.entity_id IN (
        ${ids.candidateId}, ${ids.maskId}, ${ids.scorecardId}, ${ids.scoreId}
      )
    ORDER BY events.id
  `;
  const receipts = await sql<{ row: unknown }[]>`
    SELECT to_jsonb(receipts) AS row
    FROM public.security_command_receipts AS receipts
    WHERE receipts.actor_identity_id = ${ids.actorIdentityId}::uuid
      AND receipts.command IN (
        'r3.candidate.add', 'r3.candidate.transition', 'r3.candidate.mask',
        'r3.scorecard.create', 'r3.scorecard.entry.record'
      )
      AND receipts.entity_id IN (
        ${ids.candidateId}::uuid, ${ids.maskId}::uuid,
        ${ids.scorecardId}::uuid, ${ids.scoreId}::uuid
      )
    ORDER BY receipts.id
  `;

  return {
    candidate: candidate?.row,
    mask: mask?.row,
    scorecard: scorecard?.row,
    scorecardCriteria: scorecardCriteria.map((row) => row.row),
    scorecardEntries: scorecardEntries.map((row) => row.row),
    scorecardHistory: scorecardHistory.map((row) => row.row),
    auditEvents: auditEvents.map((row) => row.row),
    receipts: receipts.map((row) => row.row),
  };
}

async function invokeCandidateAdd(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  correlationId: string,
  idempotencyKey: string,
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: Record<string, unknown> }[]>`
      SELECT public.mmhr_add_evaluation_candidate(
        ${JSON.stringify(payload)}::jsonb,
        ${correlationId}::uuid,
        ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  });
}

describe("R3 candidate vendor scope migration rehearsal", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let ids: CandidateIds;
  let before: PopulatedSnapshot;

  beforeAll(async () => {
    context = await startRehearsal("r3-candidate-vendor-backfill");
    await applyMigrationsThrough110(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));

    const seed = await context.client.begin(async (sql) => {
      const intakeId = randomUUID();
      const productId = randomUUID();
      const scorecardId = randomUUID();
      const scoreId = randomUUID();
      const addCorrelationId = randomUUID();
      const addIdempotencyKey = randomUUID();
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (
          organization_id, status, created_by_identity_id, updated_by_identity_id
        ) VALUES (
          ${fixture.organizationId}::uuid, 'active',
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        ) RETURNING id
      `;
      await sql`
        INSERT INTO public.intakes (
          id, organization_id, status, created_by_identity_id, updated_by_identity_id
        ) VALUES (
          ${intakeId}::uuid, ${fixture.organizationId}::uuid, 'in_progress',
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        )
      `;
      await sql`
        INSERT INTO public.products (
          id, organization_id, vendor_profile_id, stable_key, name, status,
          created_by_identity_id, updated_by_identity_id
        ) VALUES (
          ${productId}::uuid, ${fixture.organizationId}::uuid, ${vendor!.id}::uuid,
          'backfill_product', 'Backfill Product', 'active',
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        )
      `;
      const addPayload = {
        organizationId: fixture.organizationId,
        intakeId,
        productId,
        source: "initial",
        actorIdentityId: fixture.pair[0].identityId,
      };
      const added = await invokeCandidateAdd(
        sql,
        fixture.pair[0],
        addPayload,
        addCorrelationId,
        addIdempotencyKey,
      );
      expect(added).toMatchObject({ outcomeCode: "created" });
      const candidateId = String(added.candidateId);
      expect(candidateId).toMatch(/^[0-9a-f-]{36}$/i);

      const transitionPayload = {
        candidateId,
        organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId,
        expectedRevision: 1,
        fromState: "proposed",
        toState: "active",
      };
      await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        await probe`
          SELECT public.mmhr_transition_evaluation_candidate(
            ${JSON.stringify(transitionPayload)}::jsonb,
            ${randomUUID()}::uuid,
            ${randomUUID()}::uuid
          )
        `;
      });

      const maskResult = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_mask_evaluation_candidate(
            ${JSON.stringify({
              candidateId,
              organizationId: fixture.organizationId,
              actorIdentityId: fixture.pair[0].identityId,
            })}::jsonb,
            ${randomUUID()}::uuid,
            ${randomUUID()}::uuid
          ) AS result
        `;
        return row!.result;
      });
      const [mask] = await sql<{ id: string }[]>`
        SELECT id FROM public.evaluation_candidate_masks
        WHERE candidate_id = ${candidateId}::uuid
          AND organization_id = ${fixture.organizationId}::uuid
      `;
      expect(maskResult).toMatchObject({ candidateId, state: "masked" });

      const scorecardPayload = {
        scorecardId,
        organizationId: fixture.organizationId,
        intakeId,
        candidateId,
        configurationId: randomUUID(),
        configurationVersion: 1,
        criteria: [{ criterionKey: "fit", weight: 1 }],
        actorIdentityId: fixture.pair[0].identityId,
      };
      await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        await probe`
          SELECT public.mmhr_create_scorecard(
            ${JSON.stringify(scorecardPayload)}::jsonb,
            ${randomUUID()}::uuid,
            ${randomUUID()}::uuid
          )
        `;
      });
      const enteredAt = new Date(Date.now() + 1_000).toISOString();
      const scoreEntryPayload = {
        scorecardId,
        organizationId: fixture.organizationId,
        expectedRevision: 1,
        actorIdentityId: fixture.pair[0].identityId,
        entry: {
          scoreId,
          criterionKey: "fit",
          scorerIdentityId: fixture.pair[0].identityId,
          value: 88,
          comment: "Preserved score",
          evidenceReferences: ["evidence:backfill"],
          enteredAt,
        },
      };
      await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        await probe`
          SELECT public.mmhr_record_scorecard_entry(
            ${JSON.stringify(scoreEntryPayload)}::jsonb,
            ${randomUUID()}::uuid,
            ${randomUUID()}::uuid
          )
        `;
      });

      const candidateIds: CandidateIds = {
        organizationId: fixture.organizationId,
        intakeId,
        productId,
        candidateId,
        maskId: mask!.id,
        scorecardId,
        scoreId,
        actorIdentityId: fixture.pair[0].identityId,
        addCorrelationId,
        addIdempotencyKey,
      };
      return {
        ids: candidateIds,
        before: await snapshotPopulatedCandidate(sql, candidateIds),
      };
    });
    ids = seed.ids;
    before = seed.before;
    expect(before.candidate).toBeTruthy();
    expect(before.mask).toBeTruthy();
    expect(before.scorecard).toBeTruthy();
    expect(before.scorecardCriteria).toHaveLength(1);
    expect(before.scorecardEntries).toHaveLength(1);
    expect(before.scorecardHistory).toHaveLength(1);
    expect(before.auditEvents).toHaveLength(5);
    expect(before.receipts).toHaveLength(5);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("backfills populated candidates and preserves legacy replay", async () => {
    await applyAllMigrations(context!);

    const after = await context!.client.begin((sql) => snapshotPopulatedCandidate(sql, ids));
    expect(after).toEqual(before);

    const [candidate] = await context!.client<{ vendor_organization_id: string; organization_id: string }[]>`
      SELECT vendor_organization_id, organization_id
      FROM public.evaluation_candidates
      WHERE id = ${ids.candidateId}::uuid
    `;
    expect(candidate).toMatchObject({
      vendor_organization_id: ids.organizationId,
      organization_id: ids.organizationId,
    });

    const replayPayload = {
      organizationId: ids.organizationId,
      intakeId: ids.intakeId,
      productId: ids.productId,
      source: "initial",
      actorIdentityId: ids.actorIdentityId,
    };
    await context!.client.begin(async (sql) => {
      await expect(
        invokeCandidateAdd(
          sql,
          fixture.pair[0],
          replayPayload,
          ids.addCorrelationId,
          ids.addIdempotencyKey,
        ),
      ).resolves.toMatchObject({
        candidateId: ids.candidateId,
        outcomeCode: "replayed",
      });
    });

    const newProductId = randomUUID();
    const newCandidateCorrelationId = randomUUID();
    const newCandidateIdempotencyKey = randomUUID();
    await context!.client.begin(async (sql) => {
      const [vendor] = await sql<{ id: string }[]>`
        SELECT id
        FROM public.vendor_profiles
        WHERE organization_id = ${ids.organizationId}::uuid
        ORDER BY id
        LIMIT 1
      `;
      expect(vendor).toBeTruthy();
      await sql`
        INSERT INTO public.products (
          id, organization_id, vendor_profile_id, stable_key, name, status,
          created_by_identity_id, updated_by_identity_id
        ) VALUES (
          ${newProductId}::uuid, ${ids.organizationId}::uuid, ${vendor!.id}::uuid,
          'post_migration_product', 'Post Migration Product', 'active',
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        )
      `;
      const payload = {
        organizationId: ids.organizationId,
        intakeId: ids.intakeId,
        productId: newProductId,
        source: "initial",
        actorIdentityId: fixture.pair[0].identityId,
      };
      await expect(
        invokeCandidateAdd(
          sql,
          fixture.pair[0],
          payload,
          newCandidateCorrelationId,
          newCandidateIdempotencyKey,
        ),
      ).resolves.toMatchObject({ outcomeCode: "created" });
      const replay = await invokeCandidateAdd(
        sql,
        fixture.pair[0],
        payload,
        newCandidateCorrelationId,
        newCandidateIdempotencyKey,
      );
      expect(replay).toMatchObject({ outcomeCode: "replayed" });
      const [stored] = await sql<{ vendor_organization_id: string }[]>`
        SELECT vendor_organization_id
        FROM public.evaluation_candidates
        WHERE organization_id = ${ids.organizationId}::uuid
          AND intake_id = ${ids.intakeId}::uuid
          AND product_id = ${newProductId}::uuid
      `;
      expect(stored!.vendor_organization_id).toBe(ids.organizationId);
    });
  }, 240_000);
});
