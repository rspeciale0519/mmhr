import "server-only";

import { z } from "zod";

export const aiCapabilities = [
  "draft",
  "summarize",
  "extract_vendor_evidence",
  "normalize_response",
  "suggest_follow_up",
  "identify_risk",
] as const;

export type AiCapability = (typeof aiCapabilities)[number];

export const aiDataClasses = ["public", "internal", "confidential", "restricted"] as const;
export type AiDataClass = (typeof aiDataClasses)[number];

export const aiRunStatuses = [
  "queued",
  "running",
  "validating",
  "review_required",
  "approved",
  "rejected",
  "failed",
] as const;
export type AiRunStatus = (typeof aiRunStatuses)[number];

export const vendorEvidenceSchema = z.strictObject({
  vendorName: z.string().trim().min(1).max(200),
  productName: z.string().trim().min(1).max(200),
  sourceReference: z.string().trim().min(1).max(500),
  claims: z.array(z.strictObject({
    field: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(2_000),
    confidence: z.number().min(0).max(1),
  })).max(100),
});

export type VendorEvidence = z.infer<typeof vendorEvidenceSchema>;

export type AiRequest<TOutput> = {
  capability: AiCapability;
  dataClass: AiDataClass;
  input: unknown;
  schema: z.ZodType<TOutput>;
  templateVersion: string;
  sourceReferences: readonly string[];
  maxCostCents: number;
};

export type AiRun<TOutput> = {
  runId: string;
  status: AiRunStatus;
  capability: AiCapability;
  adapterId: string;
  modelId: string;
  templateVersion: string;
  sourceReferences: readonly string[];
  output?: TOutput;
  failureCode?: "provider_timeout" | "provider_error" | "validation_failed" | "policy_denied";
  costCents: number;
  startedAt: string;
  completedAt: string;
  reviewRequired: true;
};

export type AiAdapter = {
  adapterId: string;
  modelId: string;
  run: (request: { capability: AiCapability; input: unknown; maxCostCents: number }) => Promise<unknown>;
};

export type AiRunIdFactory = () => string;

const restrictedCapabilities = new Set<AiCapability>(["extract_vendor_evidence", "normalize_response", "identify_risk"]);
const prohibitedInputMarkers = /(?:ignore|disregard)\s+(?:all|any|the)\s+(?:previous|prior|system)\s+instructions/i;

export class AiService {
  constructor(
    private readonly adapter: AiAdapter,
    private readonly createRunId: AiRunIdFactory = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run<TOutput>(request: AiRequest<TOutput>): Promise<AiRun<TOutput>> {
    const startedAt = this.now().toISOString();
    const base = {
      runId: this.createRunId(),
      capability: request.capability,
      adapterId: this.adapter.adapterId,
      modelId: this.adapter.modelId,
      templateVersion: request.templateVersion,
      sourceReferences: [...request.sourceReferences],
      costCents: 0,
      startedAt,
      completedAt: startedAt,
      reviewRequired: true as const,
    };

    if (request.maxCostCents < 0 || (request.dataClass === "restricted" && restrictedCapabilities.has(request.capability))) {
      return { ...base, status: "failed", failureCode: "policy_denied" };
    }
    if (containsPromptInjection(request.input)) {
      return { ...base, status: "failed", failureCode: "policy_denied" };
    }

    let raw: unknown;
    try {
      raw = await this.adapter.run({ capability: request.capability, input: request.input, maxCostCents: request.maxCostCents });
    } catch (error) {
      const failureCode = error instanceof Error && /timeout/i.test(error.message) ? "provider_timeout" : "provider_error";
      return { ...base, status: "failed", failureCode };
    }

    const parsed = request.schema.safeParse(raw);
    const completedAt = this.now().toISOString();
    if (!parsed.success) {
      return { ...base, status: "failed", failureCode: "validation_failed", completedAt };
    }
    return { ...base, status: "review_required", output: parsed.data, completedAt };
  }
}

function containsPromptInjection(value: unknown): boolean {
  if (typeof value === "string") return prohibitedInputMarkers.test(value);
  if (Array.isArray(value)) return value.some(containsPromptInjection);
  if (value && typeof value === "object") return Object.values(value).some(containsPromptInjection);
  return false;
}
