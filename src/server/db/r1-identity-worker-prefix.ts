import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect } from "vitest";
import { z } from "zod";

import type { RehearsalContext } from "./r1-migration-rehearsal";

const tags = [
  "0000_light_vanisher", "0001_heavy_kulan_gath", "0002_r1_request_scoped_access",
  "0003_r1_permission_evaluation", "0004_r1_security_commands", "0005_r1_identity_recovery",
  "0006_r1_role_authority", "0007_r1_recovery_commands", "0008_r1_assignment_deny_authority",
  "0009_r1_recovery_mfa", "0010_r1_identity_worker_dispatch",
] as const;

const journalSchema = z.object({ version: z.literal("7"), dialect: z.literal("postgresql"),
  entries: z.array(z.object({ idx: z.number().int(), version: z.literal("7"), when: z.number().int(),
    tag: z.string(), breakpoints: z.boolean() }).strict()),
}).strict();

export async function readIdentityWorkerPrefix() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const journal = journalSchema.parse(JSON.parse(await readFile(path.join(root, "drizzle/meta/_journal.json"), "utf8")));
  if (tags.some((tag, index) => journal.entries[index]?.tag !== tag || journal.entries[index]?.idx !== index)) {
    throw new Error("Identity worker tests require the reviewed 0000–0010 migration prefix");
  }
  const files = await Promise.all(tags.map(async (tag) => ({ tag,
    source: await readFile(path.join(root, "drizzle", `${tag}.sql`), "utf8"),
  })));
  if (!files[10]!.source.includes("CREATE FUNCTION mmhr_private.mmhr_list_identity_intent_candidates()")) {
    throw new Error("Identity worker discovery SQL is not ready for rehearsal");
  }
  return { journal: { ...journal, entries: journal.entries.slice(0, tags.length) }, files };
}

export type IdentityWorkerPrefix = Awaited<ReturnType<typeof readIdentityWorkerPrefix>>;

export async function writeIdentityWorkerPrefix(
  context: RehearsalContext, prefix: IdentityWorkerPrefix, count: 10 | 11 = 11,
) {
  const folder = path.join(context.scratchRoot, `identity-worker-prefix-${count}`);
  await mkdir(path.join(folder, "meta"), { recursive: true });
  for (const file of prefix.files.slice(0, count)) {
    const destination = path.join(folder, `${file.tag}.sql`);
    await writeFile(destination, file.source, "utf8");
    expect(await readFile(destination, "utf8")).toBe(file.source);
  }
  await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({
    ...prefix.journal, entries: prefix.journal.entries.slice(0, count),
  }), "utf8");
  expect((await readdir(folder)).sort()).toEqual([...tags.slice(0, count).map((tag) => `${tag}.sql`), "meta"].sort());
  console.info("Identity worker immutable prefix copied:", context.projectId, count,
    createHash("sha256").update(prefix.files.slice(0, count).map((file) => file.source).join("\n")).digest("hex"));
  return folder;
}

export async function applyIdentityWorkerPrefix(
  context: RehearsalContext, prefix: IdentityWorkerPrefix, count: 10 | 11 = 11,
) {
  const folder = await writeIdentityWorkerPrefix(context, prefix, count);
  await migrate(context.db, { migrationsFolder: folder });
  const [row] = await context.client<{ count: number }[]>`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
  expect(row!.count).toBe(count);
  return folder;
}
