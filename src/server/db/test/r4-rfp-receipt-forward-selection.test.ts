import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { selectRfpReceiptMigration } from "./r4-rfp-receipt-migration-selection";

function inputs() {
  const directory = path.join(process.cwd(), "drizzle");
  const journal = JSON.parse(readFileSync(path.join(directory, "meta/_journal.json"), "utf8")) as {
    version: string; dialect: string;
    entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
  };
  const sql = new Map(journal.entries.map(entry => [entry.tag, readFileSync(path.join(directory, entry.tag + ".sql"), "utf8")]));
  return { journal, sql };
}

describe("Pinned RFP receipt forward migration", () => {
  test("retains the original expansion and identifies the exact later correction", () => {
    const { journal, sql } = inputs(), selected = selectRfpReceiptMigration(JSON.stringify(journal), sql);
    expect(selected.correctionTag).not.toBe(selected.boundaryTag);
    expect(journal.entries.findIndex(entry => entry.tag === selected.correctionTag)).toBeGreaterThan(selected.boundary);
    expect(selected.correctionSha256).toBe("99b1aff0da6ac64ddbc8142e8557c5e5a2fe0dad2e55dac2a5fb79cb5d22ce81");
  });

  test.each(["original_bytes", "correction_bytes", "missing_sql", "missing_stage", "unregistered_stage", "wrong_order"] as const)(
    "rejects %s without ignoring a required stage", kind => {
      const { journal, sql } = inputs(), selected = selectRfpReceiptMigration(JSON.stringify(journal), sql);
      if (kind === "original_bytes") sql.set(selected.boundaryTag, sql.get(selected.boundaryTag)! + "\n");
      if (kind === "correction_bytes") sql.set(selected.correctionTag, sql.get(selected.correctionTag)! + "\n");
      if (kind === "missing_sql") sql.delete(selected.correctionTag);
      if (kind === "missing_stage") {
        journal.entries = journal.entries.filter(entry => entry.tag !== selected.correctionTag);
        journal.entries.forEach((entry, index) => { entry.idx = index; });
      }
      if (kind === "unregistered_stage") {
        const entry = journal.entries.find(item => item.tag === selected.correctionTag)!;
        const text = sql.get(entry.tag)!;
        sql.delete(entry.tag); entry.tag = entry.tag.replace("rfp_receipt_authorization_time", "unreviewed_receipt_time");
        sql.set(entry.tag, text);
      }
      if (kind === "wrong_order") {
        const index = journal.entries.findIndex(entry => entry.tag === selected.correctionTag);
        const [entry] = journal.entries.splice(index, 1);
        journal.entries.splice(selected.boundary, 0, entry!);
        const baseTime = journal.entries[0]!.when;
        journal.entries.forEach((item, position) => { item.idx = position; item.when = baseTime + position; });
      }
      expect(() => selectRfpReceiptMigration(JSON.stringify(journal), sql)).toThrow();
    },
  );

  test.each(["duplicate_correction", "status_replacement", "actor_replacement", "helper_replacement"] as const)(
    "rejects the unreviewed later %s", kind => {
      const { journal, sql } = inputs(), selected = selectRfpReceiptMigration(JSON.stringify(journal), sql);
      const previous = journal.entries.at(-1)!;
      const tag = `${String(previous.idx + 1).padStart(4, "0")}_unreviewed_receipt_stage`;
      journal.entries.push({ ...previous, idx: previous.idx + 1, when: previous.when + 1, tag });
      const text = kind === "duplicate_correction" ? sql.get(selected.correctionTag)!
        : kind === "status_replacement" ? "CREATE OR REPLACE FUNCTION public.mmhr_get_rfp_receipt_status("
        : kind === "actor_replacement" ? "CREATE OR REPLACE FUNCTION mmhr_private.r4_receipt_actor("
        : "CREATE OR REPLACE FUNCTION mmhr_private.r4_receipt_context_at(";
      sql.set(tag, text);
      expect(() => selectRfpReceiptMigration(JSON.stringify(journal), sql)).toThrow();
    },
  );
});
