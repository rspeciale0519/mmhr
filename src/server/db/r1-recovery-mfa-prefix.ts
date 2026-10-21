import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect } from "vitest";
import { z } from "zod";

import type { RehearsalContext } from "./r1-migration-rehearsal";

const tags = [
  "0000_light_vanisher", "0001_heavy_kulan_gath", "0002_r1_request_scoped_access",
  "0003_r1_permission_evaluation", "0004_r1_security_commands", "0005_r1_identity_recovery",
  "0006_r1_role_authority", "0007_r1_recovery_commands", "0008_r1_assignment_deny_authority",
  "0009_r1_recovery_mfa",
] as const;

const journalSchema = z.object({ version: z.literal("7"), dialect: z.literal("postgresql"),
  entries: z.array(z.object({ idx: z.number().int(), version: z.literal("7"), when: z.number().int(),
    tag: z.string(), breakpoints: z.boolean() })),
});

export async function readRecoveryMfaPrefix() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const journal = journalSchema.parse(JSON.parse(await readFile(path.join(root, "drizzle/meta/_journal.json"), "utf8")));
  if (tags.some((tag, index) => journal.entries[index]?.tag !== tag || journal.entries[index]?.idx !== index)) {
    throw new Error("Recovery MFA requires the reviewed 0000–0009 migration prefix");
  }
  const files = await Promise.all(tags.map(async (tag) => ({ tag,
    source: await readFile(path.join(root, "drizzle", `${tag}.sql`), "utf8"),
  })));
  return { journal: { ...journal, entries: journal.entries.slice(0, tags.length) }, files };
}

export type RecoveryMfaPrefix = Awaited<ReturnType<typeof readRecoveryMfaPrefix>>;

export async function writeRecoveryMfaPrefix(context: RehearsalContext, prefix: RecoveryMfaPrefix, count: 9 | 10 = 10) {
  const folder = path.join(context.scratchRoot, `recovery-mfa-prefix-${count}`);
  await mkdir(path.join(folder, "meta"), { recursive: true });
  for (const file of prefix.files.slice(0, count)) await writeFile(path.join(folder, `${file.tag}.sql`), file.source, "utf8");
  await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({
    ...prefix.journal, entries: prefix.journal.entries.slice(0, count),
  }), "utf8");
  expect((await readdir(folder)).sort()).toEqual([...tags.slice(0, count).map((tag) => `${tag}.sql`), "meta"].sort());
  console.info("Recovery MFA immutable prefix copied:", context.projectId, count,
    createHash("sha256").update(prefix.files.slice(0, count).map((file) => file.source).join("\n")).digest("hex"));
  return folder;
}

export async function applyRecoveryMfaPrefix(context: RehearsalContext, prefix: RecoveryMfaPrefix, count: 9 | 10 = 10) {
  const folder = await writeRecoveryMfaPrefix(context, prefix, count);
  await migrate(context.db, { migrationsFolder: folder });
  const [row] = await context.client<{ count: number }[]>`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
  expect(row!.count).toBe(count);
  return folder;
}
