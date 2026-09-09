import "server-only";
import { z } from "zod";

// Validate without normalization: reopening a saved record must preserve its text.
// PostgreSQL btrim removes ASCII spaces, not all JavaScript whitespace.
const trimmedLength = (value: string) => Array.from(value.replace(/^ +| +$/g, "")).length;
const map = z.record(
  z.string().min(1).max(100_000).refine((value) => trimmedLength(value) >= 1 && trimmedLength(value) <= 100),
  z.union([z.string().max(4_000).refine((value) => Array.from(value).length <= 2_000), z.number().finite(), z.boolean()]),
).refine((value) => Object.keys(value).length <= 50);
const label = z.string().min(1).max(100_000).refine((value) => trimmedLength(value) >= 1 && trimmedLength(value) <= 200);
// Existing SQL records have a JSONB-size limit, not the new-write JSON wire limit.
// Per-field and collection bounds keep reads finite without excluding those records.
export const intakeReadDataSchema = z.strictObject({
  companyContext: map.optional(),
  currentSystems: z.array(label).max(50).optional(),
  complianceNeeds: z.array(label).max(50).optional(),
  budget: map.optional(),
  timeline: map.optional(),
  stakeholders: z.array(label).max(100).optional(),
  decisionProcess: map.optional(),
});
