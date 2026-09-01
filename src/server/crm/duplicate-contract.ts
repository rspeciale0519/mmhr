import "server-only";

import { z } from "zod";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());

export const duplicateResources = [
  "customer",
  "vendor",
  "product",
  "contact",
  "deal",
] as const;
export type DuplicateResource = (typeof duplicateResources)[number];

const duplicateInputSchema = z.strictObject({
  recordId: uuid,
  organizationId: uuid,
  resource: z.enum(duplicateResources),
  /** A caller-provided normalized fingerprint. Never store raw personal data. */
  dedupeKey: z.string().trim().min(1).max(256),
});
export type DuplicateInput = z.input<typeof duplicateInputSchema>;

export const duplicateCandidateSchema = z.strictObject({
  candidateKey: z.string().regex(/^[a-z][a-z0-9_.:-]{1,700}$/),
  organizationId: uuid,
  resource: z.enum(duplicateResources),
  leftRecordId: uuid,
  rightRecordId: uuid,
  signal: z.literal("normalized_key"),
  state: z.literal("open"),
});
export type DuplicateCandidate = z.output<typeof duplicateCandidateSchema>;

export class DuplicateDetectionError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "CROSS_ORGANIZATION") {
    super(code === "INVALID_INPUT"
      ? "Duplicate detection input is invalid"
      : "Duplicate detection scope is invalid");
    this.name = "DuplicateDetectionError";
  }
}

/**
 * Produces review candidates only. It never merges, rewrites, or deletes a
 * record, and it accepts only normalized fingerprints from the data layer.
 */
export function detectDuplicateCandidates(
  rows: readonly unknown[],
): readonly DuplicateCandidate[] {
  const parsed = rows.map((row) => {
    const result = duplicateInputSchema.safeParse(row);
    if (!result.success) throw new DuplicateDetectionError("INVALID_INPUT");
    return result.data;
  });
  const seenRecords = new Set<string>();
  for (const row of parsed) {
    const recordKey = `${row.organizationId}:${row.resource}:${row.recordId}`;
    if (seenRecords.has(recordKey)) throw new DuplicateDetectionError("INVALID_INPUT");
    seenRecords.add(recordKey);
  }
  const groups = new Map<string, typeof parsed>();

  for (const row of parsed) {
    const groupKey = `${row.organizationId}:${row.resource}:${row.dedupeKey}`;
    const group = groups.get(groupKey) ?? [];
    group.push(row);
    groups.set(groupKey, group);
  }

  const candidates: DuplicateCandidate[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.recordId.localeCompare(right.recordId));
    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
        const left = ordered[leftIndex];
        const right = ordered[rightIndex];
        const candidate = duplicateCandidateSchema.parse({
          candidateKey: `duplicate:${left.resource}:${left.recordId}:${right.recordId}`,
          organizationId: left.organizationId,
          resource: left.resource,
          leftRecordId: left.recordId,
          rightRecordId: right.recordId,
          signal: "normalized_key",
          state: "open",
        });
        candidates.push(candidate);
      }
    }
  }

  return candidates.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
}
