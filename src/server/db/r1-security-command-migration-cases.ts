import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect } from "vitest";

import {
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  completeBootstrap,
  createBootstrapPair,
  createSecurityPrincipal,
  denied,
  prepareBootstrap,
  securitySnapshot,
} from "./r1-security-command-fixtures";

async function applyCommandMigrationPrefix(context: RehearsalContext, count: 4 | 5 | 7 | 9) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const expectedPrefix = [
    "0000_light_vanisher", "0001_heavy_kulan_gath",
    "0002_r1_request_scoped_access", "0003_r1_permission_evaluation",
    "0004_r1_security_commands",
    ...(count >= 7 ? ["0005_r1_identity_recovery", "0006_r1_role_authority"] : []),
    ...(count === 9 ? ["0007_r1_recovery_commands", "0008_r1_assignment_deny_authority"] : []),
  ];
  const journal = JSON.parse(await readFile(
    path.join(projectRoot, "drizzle", "meta", "_journal.json"), "utf8",
  )) as { version: string; dialect: string; entries: { tag: string }[] };
  if (expectedPrefix.some((tag, index) => journal.entries[index]?.tag !== tag)) {
    throw new Error("The command rehearsal migration sequence differs from the reviewed prefix");
  }
  const prefixRoot = path.join(context.scratchRoot, count === 4
    ? "pre-security-commands-drizzle"
    : count === 5 ? "security-commands-drizzle"
      : count === 7 ? "role-authority-drizzle" : "role-revocation-authority-drizzle");
  const prefixMeta = path.join(prefixRoot, "meta");
  await mkdir(prefixMeta, { recursive: true });
  for (const tag of expectedPrefix.slice(0, count)) {
    await copyFile(path.join(projectRoot, "drizzle", `${tag}.sql`), path.join(prefixRoot, `${tag}.sql`));
  }
  await writeFile(path.join(prefixMeta, "_journal.json"), `${JSON.stringify({
    ...journal, entries: journal.entries.slice(0, count),
  }, null, 2)}\n`, "utf8");
  await migrate(context.db, { migrationsFolder: prefixRoot });
}

export async function applySecurityCommandMigrations(context: RehearsalContext) {
  await applyCommandMigrationPrefix(context, 5);
}

export async function applyRoleAuthorityMigrations(context: RehearsalContext) {
  await applyCommandMigrationPrefix(context, 7);
}

export async function applyRoleRevocationAuthorityMigrations(context: RehearsalContext) {
  await applyCommandMigrationPrefix(context, 9);
}

export async function verifyLegacyBootstrapMigration(state: "prepared" | "consumed") {
  const context = await startRehearsal(state === "prepared" ? "singleprep" : "singleused");
  try {
    await applyCommandMigrationPrefix(context, 4);
    const target = await createSecurityPrincipal(context.client, state === "prepared" ? "pending" : "active");
    await context.client`
      INSERT INTO public.security_bootstrap_state (
        target_identity_id, product_approval_reference, security_approval_reference,
        state, consumed_at
      ) VALUES (
        ${target.identityId}::uuid, 'legacy-product-reference', 'legacy-security-reference',
        ${state}::public.bootstrap_state,
        CASE WHEN ${state} = 'consumed' THEN clock_timestamp() ELSE NULL END
      )
    `;
    if (state === "consumed") {
      await context.client`
        INSERT INTO public.platform_role_assignments (identity_id, role_key, assignment_reason)
        VALUES (${target.identityId}::uuid, 'super_admin', 'Isolated historical bootstrap assignment')
      `;
    }
    const [before] = await context.client<{ row: Record<string, unknown> }[]>`
      SELECT to_jsonb(bootstrap_record) AS row FROM public.security_bootstrap_state AS bootstrap_record
    `;
    const beforeAssignments = await context.client<{ row: unknown }[]>`
      SELECT to_jsonb(assignment) AS row FROM public.platform_role_assignments AS assignment ORDER BY id
    `;
    const beforeIdentities = await context.client<{ row: unknown }[]>`
      SELECT to_jsonb(identity) AS row FROM public.identities AS identity ORDER BY id
    `;
    await applySecurityCommandMigrations(context);
    const [after] = await context.client<{ row: Record<string, unknown> }[]>`
      SELECT to_jsonb(bootstrap_record) AS row FROM public.security_bootstrap_state AS bootstrap_record
    `;
    expect(after!.row).toEqual({ ...before!.row, second_target_identity_id: null });
    expect(await context.client<{ row: unknown }[]>`
      SELECT to_jsonb(assignment) AS row FROM public.platform_role_assignments AS assignment ORDER BY id
    `).toEqual(beforeAssignments);
    expect(await context.client<{ row: unknown }[]>`
      SELECT to_jsonb(identity) AS row FROM public.identities AS identity ORDER BY id
    `).toEqual(beforeIdentities);

    const proposedSecond = await createSecurityPrincipal(context.client, "pending");
    const pair = [target, proposedSecond] as const;
    const beforeCommands = await securitySnapshot(context.client);
    await expect(context.client.begin((sql) => prepareBootstrap(sql, pair))).rejects.toMatchObject(denied);
    await expect(context.client.begin((sql) => completeBootstrap(sql, pair))).rejects.toMatchObject(denied);
    await expect(context.client`
      SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())
    `).rejects.toMatchObject(denied);
    expect(await securitySnapshot(context.client)).toEqual(beforeCommands);
    await applySecurityCommandMigrations(context);
    expect(await securitySnapshot(context.client)).toEqual(beforeCommands);
  } finally {
    await stopRehearsal(context);
  }
}

export async function verifyConcurrentBootstrapCompletion() {
  const context = await startRehearsal("pairrace");
  try {
    await applySecurityCommandMigrations(context);
    const pair = await context.client.begin(async (sql) => {
      const prepared = await createBootstrapPair(sql);
      await prepareBootstrap(sql, prepared);
      return { prepared };
    });
    const results = await Promise.allSettled([
      context.client.begin((sql) => completeBootstrap(sql, pair.prepared)),
      context.client.begin((sql) => completeBootstrap(sql, pair.prepared)),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failures = results.filter((result) => result.status === "rejected");
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toMatchObject(denied);
    const assignments = await context.client<{ identity_id: string; role_key: string; state: string }[]>`
      SELECT identity_id, role_key, state FROM public.platform_role_assignments ORDER BY identity_id
    `;
    expect(assignments).toEqual(pair.prepared.map((principal) => ({
      identity_id: principal.identityId, role_key: "super_admin", state: "active",
    })).sort((left, right) => left.identity_id.localeCompare(right.identity_id)));
    const identities = await context.client<{ status: string }[]>`SELECT status FROM public.identities`;
    expect(identities.map((identity) => identity.status)).toEqual(["active", "active"]);
    const [bootstrap] = await context.client<{ state: string }[]>`SELECT state FROM public.security_bootstrap_state`;
    expect(bootstrap!.state).toBe("consumed");
    await context.client`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    const beforeReplay = await securitySnapshot(context.client);
    await expect(context.client.begin((sql) => completeBootstrap(sql, pair.prepared))).rejects.toMatchObject(denied);
    expect(await securitySnapshot(context.client)).toEqual(beforeReplay);
  } finally {
    await stopRehearsal(context);
  }
}
