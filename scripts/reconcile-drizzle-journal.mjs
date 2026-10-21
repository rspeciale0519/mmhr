import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = path.join(projectRoot, "drizzle");
const metaRoot = path.join(migrationsRoot, "meta");
const journalPath = path.join(metaRoot, "_journal.json");

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const migrationTags = readdirSync(migrationsRoot)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .map((name) => name.slice(0, -4))
  .sort();
const migrationTagSet = new Set(migrationTags);
const existingEntries = journal.entries.filter((entry) => migrationTagSet.has(entry.tag));
const existingTags = new Set(existingEntries.map((entry) => entry.tag));
const missingTags = migrationTags.filter((tag) => !existingTags.has(tag));
const lastWhen = existingEntries.reduce(
  (latest, entry) => Math.max(latest, Number(entry.when) || 0),
  0,
);

const entries = [...existingEntries, ...missingTags.map((tag, index) => ({
  idx: existingEntries.length + index,
  version: journal.version,
  when: lastWhen + index + 1,
  tag,
  breakpoints: true,
}))].map((entry, index) => ({ ...entry, idx: index }));

writeFileSync(journalPath, `${JSON.stringify({ ...journal, entries }, null, 2)}\n`, "utf8");
console.log(`Reconciled ${entries.length} migration journal entries from ${migrationTags.length} SQL files.`);
