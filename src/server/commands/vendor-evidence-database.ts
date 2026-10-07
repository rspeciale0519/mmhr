import "server-only";

import { z } from "zod";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationOptions,
} from "@/server/auth/authorization";
import {
  parseVendorEvidenceApproval,
  vendorEvidenceRecordSchema,
  vendorEvidenceReadInputSchema,
  vendorEvidencePageSchema,
  type VendorEvidencePage,
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
    parsed = vendorEvidenceRecordSchema.parse(input);
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

export async function getVendorEvidence(input: unknown, options: VendorEvidenceCommandOptions = {}): Promise<VendorEvidencePage> {
  const parsed = vendorEvidenceReadInputSchema.safeParse(input);
  if (!parsed.success) throw new VendorEvidenceCommandError("INVALID_INPUT");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.data.organizationId }, options);
    scope(context, parsed.data.organizationId);
    const staff = await requirePermission("admin.access", { kind: "platform" }, { supabase: context.supabase });
    if (staff.identityId !== context.identityId || staff.scope.kind !== "platform") throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_get_vendor_evidence", { payload: parsed.data });
    if (response.error) throw new VendorEvidenceCommandError("UNAVAILABLE");
    const result = vendorEvidencePageSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId || result.data.items.length > parsed.data.limit ||
      (result.data.nextCursor !== null && result.data.items.length !== parsed.data.limit) ||
      (parsed.data.afterId && result.data.items.some((item) => item.evidence.evidenceId <= parsed.data.afterId!))) {
      throw new VendorEvidenceCommandError("INVALID_RESPONSE");
    }
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof VendorEvidenceCommandError) throw error;
    throw new VendorEvidenceCommandError("UNAVAILABLE");
  }
}
