import { createHash } from "node:crypto";
import { selectTaskRequestMigration } from "./r8-task-request-migration-selection";

// This pin is the complete reviewed correction, not a match on its function name.
const reviewedCorrection = {
  tagSuffix: "_rfp_receipt_authorization_time",
  sha256: "99b1aff0da6ac64ddbc8142e8557c5e5a2fe0dad2e55dac2a5fb79cb5d22ce81",
} as const;
const originalExpansionSha256 = "277f2e4c960e0e431577834f2580408f30d2f0fc47b771cc9ced7d5137993a47";

export function selectRfpReceiptMigration(journalText: string, sqlByTag: ReadonlyMap<string, string>) {
  const original = selectTaskRequestMigration(journalText, sqlByTag);
  const candidates = original.journal.entries.flatMap((entry, index) => {
    const text = sqlByTag.get(entry.tag)!;
    const count = (text.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.mmhr_confirm_rfp_receipt\s*\(/gi) ?? []).length;
    if (count > 1) throw new Error("Ambiguous RFP receipt migration");
    return count === 1 ? [{ index, tag: entry.tag, text }] : [];
  });
  const expansions = candidates.filter(candidate => candidate.text.includes('CREATE TABLE "mmhr_private"."rfp_receipt_confirmations"'));
  if (expansions.length !== 1 || expansions[0]!.index <= original.boundary) {
    throw new Error("One additive RFP receipt migration is required");
  }
  const expansion = expansions[0]!;
  if (createHash("sha256").update(expansion.text).digest("hex") !== originalExpansionSha256
    || !expansion.text.includes("CREATE CONSTRAINT TRIGGER r4_receipt_projection_commit")
    || !expansion.text.includes("CREATE TRIGGER r4_receipt_evidence_insert")
    || !expansion.text.includes("REVOKE ALL ON TABLE mmhr_private.rfp_receipt_confirmations")) {
    throw new Error("RFP receipt migration requires review");
  }
  const corrections = candidates.filter(candidate => candidate.index !== expansion.index);
  if (corrections.length !== 1 || corrections[0]!.index <= expansion.index
    || !corrections[0]!.tag.endsWith(reviewedCorrection.tagSuffix)
    || createHash("sha256").update(corrections[0]!.text).digest("hex") !== reviewedCorrection.sha256) {
    throw new Error("The exact reviewed RFP receipt authorization correction is required");
  }
  const helperStages = original.journal.entries.filter(entry =>
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+mmhr_private\.r4_receipt_context_at\s*\(/i.test(sqlByTag.get(entry.tag)!));
  if (helperStages.length !== 1 || helperStages[0]!.tag !== corrections[0]!.tag) {
    throw new Error("Ambiguous RFP receipt authorization helper");
  }
  for (const entry of original.journal.entries) {
    if (entry.tag === expansion.tag || entry.tag === corrections[0]!.tag) continue;
    if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\."?mmhr_(?:confirm_rfp_receipt|get_rfp_receipt_status)"?|"?mmhr_private"?\."?r4_receipt_(?:actor|context_at|evidence_guard|timestamp_guard|projection_guard)"?)\s*\(/i.test(sqlByTag.get(entry.tag)!)) {
      throw new Error("Unreviewed RFP receipt function stage");
    }
  }
  return { journal: original.journal, boundary: expansion.index, boundaryTag: expansion.tag,
    correctionTag: corrections[0]!.tag, correctionSha256: reviewedCorrection.sha256 };
}
