import "server-only";

import { z } from "zod";
import { factScopeMapSchema } from "@/server/matching/fact-scope";
import { deliveryBooleanMapSchema } from "@/server/matching/delivery-evidence";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const httpsUri = z.url().refine((value) => value.startsWith("https://"), {
  message: "Vendor sources must use HTTPS",
});

export const vendorSourceTypes = ["vendor_owned", "licensed", "manual"] as const;
export type VendorSourceType = (typeof vendorSourceTypes)[number];

const vendorSourceSchema = z
  .object({
    sourceId: uuid,
    organizationId: uuid,
    vendorProfileId: uuid,
    uri: httpsUri,
    sourceType: z.enum(vendorSourceTypes),
    licenseNote: z.string().trim().max(500).nullable(),
    capturedAt: timestamp,
    active: z.boolean(),
    captureMethod: z.enum(["api", "web", "document", "email", "manual", "other"]).optional(),
    cadenceDays: z.number().int().min(1).max(3650).optional(),
  })
  .strict();

const vendorFactSchema = z
  .object({
    factId: uuid,
    organizationId: uuid,
    vendorProfileId: uuid,
    productId: uuid.nullable(),
    fieldKey: z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/),
    value: z.string().trim().min(1).max(2_000),
    observedAt: timestamp,
    status: z.enum(["draft", "published", "archived"]),
  })
  .strict();

const vendorEvidenceSchema = z
  .object({
    evidenceId: uuid,
    organizationId: uuid,
    factId: uuid,
    sourceId: uuid,
    version: z.number().int().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    capturedAt: timestamp,
    freshUntil: timestamp,
    citation: z.string().trim().min(1).max(1_000),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (Date.parse(evidence.freshUntil) < Date.parse(evidence.capturedAt)) {
      context.addIssue({
        code: "custom",
        path: ["freshUntil"],
        message: "Evidence expiry must not precede capture",
      });
    }
  });

const vendorEvidenceApprovalSchema = z
  .object({
    approvalId: uuid,
    organizationId: uuid,
    evidenceId: uuid,
    reviewerIdentityId: uuid,
    decision: z.enum(["approved", "rejected"]),
    decidedAt: timestamp,
    reason: z.string().trim().max(500).nullable(),
  })
  .strict();

const vendorFactOverrideSchema = z
  .object({
    overrideId: uuid,
    organizationId: uuid,
    factId: uuid,
    value: z.string().trim().min(1).max(2_000),
    approvedByIdentityId: uuid,
    approvedAt: timestamp,
    expiresAt: timestamp,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((override, context) => {
    if (Date.parse(override.expiresAt) < Date.parse(override.approvedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Override expiry must not precede approval",
      });
    }
  });

export type VendorSource = z.infer<typeof vendorSourceSchema>;
export type VendorFact = z.infer<typeof vendorFactSchema>;
export type VendorEvidence = z.infer<typeof vendorEvidenceSchema>;
export type VendorEvidenceApproval = z.infer<typeof vendorEvidenceApprovalSchema>;
export type VendorFactOverride = z.infer<typeof vendorFactOverrideSchema>;

export const vendorEvidenceRecordSchema = z.strictObject({
  source: vendorSourceSchema,
  fact: vendorFactSchema,
  evidence: vendorEvidenceSchema,
  expectedEvidenceVersion: z.number().int().min(1).max(2_147_483_646).optional(),
}).superRefine(({ source, fact, evidence, expectedEvidenceVersion }, context) => {
  if (expectedEvidenceVersion !== undefined && evidence.version !== expectedEvidenceVersion + 1) {
    context.addIssue({ code: "custom", path: ["evidence", "version"], message: "Renewal must use the next evidence version" });
  }
  if (fact.fieldKey === "comparison_fact_scopes") {
    let valid = false;
    try { valid = factScopeMapSchema.safeParse(JSON.parse(fact.value)).success; } catch { /* Invalid JSON is rejected below. */ }
    if (!valid || fact.productId === null) context.addIssue({ code: "custom", path: ["fact", "value"],
      message: "Scope evidence requires a product and valid conditions" });
  }
  if (fact.fieldKey === "comparison_addon_inclusions" || fact.fieldKey === "comparison_limitation_reviews") {
    let valid = false;
    try { valid = deliveryBooleanMapSchema.safeParse(JSON.parse(fact.value)).success; } catch { /* Invalid JSON is rejected below. */ }
    if (!valid || fact.productId === null) context.addIssue({ code: "custom", path: ["fact", "value"],
      message: "Delivery evidence requires a product and valid boolean values" });
  }
  if (source.organizationId !== fact.organizationId || source.organizationId !== evidence.organizationId ||
    source.vendorProfileId !== fact.vendorProfileId || fact.status !== "draft" ||
    evidence.factId !== fact.factId || evidence.sourceId !== source.sourceId) {
    context.addIssue({ code: "custom", message: "Evidence must identify the submitted draft fact and source" });
  }
});

export const vendorEvidenceReadInputSchema = z.strictObject({
  organizationId: uuid.transform((value) => value.toLowerCase()),
  afterId: uuid.transform((value) => value.toLowerCase()).optional(),
  limit: z.number().int().min(1).max(50).default(25),
  registryVersion: z.literal(1).optional(),
});
export const vendorEvidencePageSchema = z.strictObject({
  organizationId: uuid,
  readAt: timestamp,
  items: z.array(z.strictObject({
    productName: z.string().min(1).max(200).nullable(),
    source: vendorSourceSchema, fact: vendorFactSchema, evidence: vendorEvidenceSchema,
    review: vendorEvidenceApprovalSchema.nullable(),
    registry: z.strictObject({
      ownerIdentityId: uuid.nullable(),
      captureMethod: z.enum(["api", "web", "document", "email", "manual", "other"]),
      cadenceDays: z.number().int().min(1).max(3650),
      reviewRequired: z.boolean(),
    }).optional(),
  })).max(50),
  nextCursor: uuid.nullable(),
}).superRefine((page, context) => {
  let previous = "";
  for (const { source, fact, evidence, review } of page.items) {
    if (source.organizationId !== page.organizationId || fact.organizationId !== page.organizationId ||
      evidence.organizationId !== page.organizationId || source.vendorProfileId !== fact.vendorProfileId ||
      evidence.sourceId !== source.sourceId || evidence.factId !== fact.factId || evidence.evidenceId <= previous ||
      (review && (review.organizationId !== page.organizationId || review.evidenceId !== evidence.evidenceId))) {
      context.addIssue({ code: "custom", message: "Evidence page scope or order mismatch" });
    }
    previous = evidence.evidenceId;
  }
  if (page.nextCursor !== null && page.nextCursor !== previous) {
    context.addIssue({ code: "custom", message: "Evidence page cursor mismatch" });
  }
});
export type VendorEvidencePage = z.infer<typeof vendorEvidencePageSchema>;

export type PublishedVendorFact = Readonly<{
  factId: string;
  organizationId: string;
  vendorProfileId: string;
  productId: string | null;
  fieldKey: string;
  value: string;
  provenance: "evidence" | "override";
  evidenceId?: string;
  sourceId?: string;
  validUntil: string;
}>;

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message);
  return result.data;
}

export function parseVendorSource(value: unknown): VendorSource {
  return parse(vendorSourceSchema, value, "Invalid vendor source");
}

export function parseVendorFact(value: unknown): VendorFact {
  return parse(vendorFactSchema, value, "Invalid vendor fact");
}

export function parseVendorEvidence(value: unknown): VendorEvidence {
  return parse(vendorEvidenceSchema, value, "Invalid vendor evidence");
}

export function parseVendorEvidenceApproval(value: unknown): VendorEvidenceApproval {
  return parse(vendorEvidenceApprovalSchema, value, "Invalid vendor evidence approval");
}

export function parseVendorFactOverride(value: unknown): VendorFactOverride {
  return parse(vendorFactOverrideSchema, value, "Invalid vendor fact override");
}

/** Resolves only approved, organization-matched, currently valid vendor facts. */
export function resolvePublishedVendorFact(input: {
  fact: unknown;
  source?: unknown;
  evidence?: unknown;
  approval?: unknown;
  override?: unknown;
  asOf: string | Date;
}): PublishedVendorFact {
  const fact = parseVendorFact(input.fact);
  const asOf = input.asOf instanceof Date ? input.asOf.toISOString() : input.asOf;
  if (!timestamp.safeParse(asOf).success) throw new Error("Invalid vendor fact as-of timestamp");

  if (input.override !== undefined) {
    const override = parseVendorFactOverride(input.override);
    if (override.organizationId !== fact.organizationId || override.factId !== fact.factId) {
      throw new Error("Vendor override scope mismatch");
    }
    if (Date.parse(override.expiresAt) < Date.parse(asOf)) {
      throw new Error("Vendor override is expired");
    }
    return Object.freeze({
      factId: fact.factId,
      organizationId: fact.organizationId,
      vendorProfileId: fact.vendorProfileId,
      productId: fact.productId,
      fieldKey: fact.fieldKey,
      value: override.value,
      provenance: "override",
      validUntil: override.expiresAt,
    });
  }

  if (fact.status !== "published" || input.source === undefined || input.evidence === undefined || input.approval === undefined) {
    throw new Error("Vendor fact lacks approved evidence");
  }
  const source = parseVendorSource(input.source);
  const evidence = parseVendorEvidence(input.evidence);
  const approval = parseVendorEvidenceApproval(input.approval);
  if (
    source.organizationId !== fact.organizationId
    || source.vendorProfileId !== fact.vendorProfileId
    || !source.active
    || evidence.organizationId !== fact.organizationId
    || evidence.factId !== fact.factId
    || evidence.sourceId !== source.sourceId
    || approval.organizationId !== fact.organizationId
    || approval.evidenceId !== evidence.evidenceId
    || approval.decision !== "approved"
  ) {
    throw new Error("Vendor evidence scope or approval mismatch");
  }
  if (Date.parse(evidence.freshUntil) < Date.parse(asOf)) {
    throw new Error("Vendor evidence is stale");
  }
  return Object.freeze({
    factId: fact.factId,
    organizationId: fact.organizationId,
    vendorProfileId: fact.vendorProfileId,
    productId: fact.productId,
    fieldKey: fact.fieldKey,
    value: fact.value,
    provenance: "evidence",
    evidenceId: evidence.evidenceId,
    sourceId: source.sourceId,
    validUntil: evidence.freshUntil,
  });
}

export {
  vendorSourceSchema,
  vendorFactSchema,
  vendorEvidenceSchema,
  vendorEvidenceApprovalSchema,
  vendorFactOverrideSchema,
};
