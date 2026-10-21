import "server-only";

import { z } from "zod";

const recordSchema = z.strictObject({
  factId: z.string().uuid(),
  status: z.literal("published"),
  freshUntil: z.iso.datetime({ offset: true }),
});

export type PublishedVendorFreshnessRecord = z.infer<typeof recordSchema>;

export type VendorFreshnessReport = Readonly<{
  totalPublished: number;
  freshPublished: number;
  freshnessRate: number;
  compliant: boolean;
}>;

/** Measures the PRD freshness target without exposing vendor values. */
export function assessVendorFreshness(records: readonly unknown[], asOf: Date = new Date()): VendorFreshnessReport {
  const parsed = records.map((record) => recordSchema.parse(record));
  const freshPublished = parsed.filter((record) => Date.parse(record.freshUntil) >= asOf.getTime()).length;
  const totalPublished = parsed.length;
  const freshnessRate = totalPublished === 0 ? 0 : freshPublished / totalPublished;
  return Object.freeze({ totalPublished, freshPublished, freshnessRate, compliant: totalPublished > 0 && freshnessRate >= 0.95 });
}
