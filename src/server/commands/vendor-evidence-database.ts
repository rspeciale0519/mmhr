import "server-only";

import { z } from "zod";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationOptions,
} from "@/server/auth/authorization";
import {
  parseVendorEvidence,
  parseVendorEvidenceApproval,
  parseVendorFact,
  parseVendorSource,
  type VendorEvidence,
  type VendorFact,
  type VendorEvidenceApproval,
  type VendorSource,
} from "@/server/crm/vendor-evidence-contract";

const resultSchema = z.strictObject({
  sourceId: z.string().uuid().nullable(),
  factId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  approvalId: z.string().uuid().nullable(),
  organizationId: z.string().uuid(),
  outcomeCode: z.enum(["recorded", "decided", "replayed"]),
  correlationId: z.string().uuid(),
});

export type VendorEvidenceCommandResult = z.infer<typeof resultSchema>;
export type VendorEvidenceCommandOptions = AuthorizationOptions;
export class VendorEvidenceCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Vendor evidence command could not be completed");
    this.name = "VendorEvidenceCommandError";
  }
}

type RecordInput = { source: VendorSource; fact: VendorFact; evidence: VendorEvidence };
type ApprovalInput = VendorEvidenceApproval;

function scope(context: Awaited<ReturnType<typeof requirePermission>>, organizationId: string) {
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId) throw new AuthorizationError();
}

export async function recordVendorEvidence(input: unknown, options: VendorEvidenceCommandOptions = {}): Promise<VendorEvidenceCommandResult> {
  let parsed: RecordInput;
  try {
    if (!input || typeof input !== "object" || !("source" in input) || !("fact" in input) || !("evidence" in input)) throw new Error();
    const source = parseVendorSource(input.source);
    const fact = parseVendorFact(input.fact);
    const evidence = parseVendorEvidence(input.evidence);
    if (source.organizationId !== fact.organizationId || source.organizationId !== evidence.organizationId || source.vendorProfileId !== fact.vendorProfileId || fact.status !== "draft") throw new Error();
    parsed = { source, fact, evidence };
  } catch { throw new VendorEvidenceCommandError("INVALID_INPUT"); }
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.source.organizationId }, options);
    scope(context, parsed.source.organizationId);
    const response = await context.supabase.rpc("mmhr_record_vendor_evidence", { payload: parsed, correlation_id: parsed.evidence.evidenceId, idempotency_key: parsed.evidence.evidenceId });
    if (response.error) throw new VendorEvidenceCommandError("UNAVAILABLE");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.source.organizationId || result.data.factId !== parsed.fact.factId || result.data.evidenceId !== parsed.evidence.evidenceId || result.data.outcomeCode === "decided") throw new VendorEvidenceCommandError("INVALID_RESPONSE");
    return result.data;
  } catch (error) { if (error instanceof AuthorizationError || error instanceof VendorEvidenceCommandError) throw error; throw new VendorEvidenceCommandError("UNAVAILABLE"); }
}

export async function approveVendorEvidence(input: unknown, options: VendorEvidenceCommandOptions = {}): Promise<VendorEvidenceCommandResult> {
  let approval: ApprovalInput;
  try { approval = parseVendorEvidenceApproval(input); } catch { throw new VendorEvidenceCommandError("INVALID_INPUT"); }
  try {
    const context = await requirePermission("audit.export", { kind: "organization", organizationId: approval.organizationId }, options);
    scope(context, approval.organizationId);
    if (context.identityId !== approval.reviewerIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_approve_vendor_evidence", { payload: approval, correlation_id: approval.approvalId, idempotency_key: approval.approvalId });
    if (response.error) throw new VendorEvidenceCommandError("UNAVAILABLE");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== approval.organizationId || result.data.evidenceId !== approval.evidenceId || result.data.approvalId !== approval.approvalId || result.data.outcomeCode === "recorded") throw new VendorEvidenceCommandError("INVALID_RESPONSE");
    return result.data;
  } catch (error) { if (error instanceof AuthorizationError || error instanceof VendorEvidenceCommandError) throw error; throw new VendorEvidenceCommandError("UNAVAILABLE"); }
}
