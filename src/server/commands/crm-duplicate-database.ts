import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationOptions,
} from "@/server/auth/authorization";
import { detectDuplicateCandidates } from "@/server/crm/duplicate-contract";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const rowSchema = z.strictObject({
  recordId: uuid,
  organizationId: uuid,
  resource: z.enum(["customer", "vendor", "product", "contact", "deal"]),
  dedupeKey: z.string().trim().min(1).max(256),
});
const inputSchema = z.strictObject({
  organizationId: uuid,
  rows: z.array(rowSchema).max(500),
});
const resultSchema = z.strictObject({
  batchId: uuid,
  organizationId: uuid,
  insertedCount: z.int().min(0).max(500),
  outcomeCode: z.enum(["recorded", "replayed"]),
  correlationId: uuid,
});

export type CrmDuplicateInput = z.input<typeof inputSchema>;
export type CrmDuplicateResult = z.infer<typeof resultSchema>;
export type CrmDuplicateOptions = AuthorizationOptions;

export class CrmDuplicateCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("CRM duplicate command could not be completed");
    this.name = "CrmDuplicateCommandError";
  }
}

export async function recordCrmDuplicateCandidates(
  input: unknown,
  options: CrmDuplicateOptions = {},
): Promise<CrmDuplicateResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new CrmDuplicateCommandError("INVALID_INPUT");
  if (parsed.data.rows.some((row) => row.organizationId !== parsed.data.organizationId)) {
    throw new CrmDuplicateCommandError("INVALID_INPUT");
  }
  let candidates;
  try {
    candidates = detectDuplicateCandidates(parsed.data.rows);
  } catch {
    throw new CrmDuplicateCommandError("INVALID_INPUT");
  }
  let context;
  try {
    context = await requirePermission(
      "workspace.access",
      { kind: "organization", organizationId: parsed.data.organizationId },
      options,
    );
    if (context.scope.kind !== "organization" || context.scope.organizationId !== parsed.data.organizationId) {
      throw new AuthorizationError();
    }
    const batchId = randomUUID();
    const response = await context.supabase.rpc("mmhr_record_crm_duplicate_candidates", {
      payload: { batchId, organizationId: parsed.data.organizationId, candidates },
      correlation_id: batchId,
      idempotency_key: batchId,
    });
    if (response.error) throw new CrmDuplicateCommandError("UNAVAILABLE");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId) {
      throw new CrmDuplicateCommandError("INVALID_RESPONSE");
    }
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CrmDuplicateCommandError) throw error;
    throw new CrmDuplicateCommandError("UNAVAILABLE");
  }
}
