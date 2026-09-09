import "server-only";
import { z } from "zod";
import { requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { securityUuidSchema as uuid } from "@/server/audit/security-values";
import { intakeReadDataSchema } from "@/server/matching/intake-data";

export class IntakeReadError extends Error {
  constructor(readonly code: "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Intakes could not be loaded");
    this.name = "IntakeReadError";
  }
}
export const intakePageInputSchema = z.strictObject({
  organizationId: uuid, afterId: uuid.optional(),
  pageSize: z.number().int().min(1).max(50).default(25),
});
export const intakeReadInputSchema = z.strictObject({ organizationId: uuid, intakeId: uuid });
const status = z.enum(["draft", "in_progress", "submitted", "under_review", "completed", "archived"]);
const revision = z.number().int().min(1).max(2_147_483_647);
const timestamp = z.iso.datetime({ offset: true });
const rowSchema = z.strictObject({
  intake_id: uuid, organization_id: uuid, status, revision,
  created_at: timestamp, updated_at: timestamp,
});
const detailSchema = z.strictObject({
  intakeId: uuid, organizationId: uuid, status, revision,
  createdAt: timestamp, updatedAt: timestamp, submittedAt: timestamp.nullable(), data: intakeReadDataSchema,
});

async function readRpc(organizationId: string, name: string, args: Record<string, unknown>, options: AuthorizationOptions) {
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId }, options);
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId) {
    throw new IntakeReadError("REJECTED");
  }
  let response;
  try { response = await context.supabase.rpc(name, args); }
  catch { throw new IntakeReadError("UNAVAILABLE"); }
  if (!response || response.error) throw new IntakeReadError("REJECTED");
  return response.data as unknown;
}

export async function getIntakesPage(input: z.input<typeof intakePageInputSchema>, options: AuthorizationOptions = {}) {
  const parsed = intakePageInputSchema.safeParse(input);
  if (!parsed.success) throw new IntakeReadError("REJECTED");
  const value = parsed.data;
  const data = await readRpc(value.organizationId, "mmhr_get_intakes_page", {
    requested_organization_id: value.organizationId, after_id: value.afterId ?? null, page_size: value.pageSize,
  }, options);
  const result = z.array(rowSchema).max(value.pageSize + 1).safeParse(data);
  if (!result.success) throw new IntakeReadError("INVALID_RESPONSE");
  let previous = value.afterId;
  for (const row of result.data) {
    if (row.organization_id !== value.organizationId || (previous !== undefined && row.intake_id <= previous)) {
      throw new IntakeReadError("INVALID_RESPONSE");
    }
    previous = row.intake_id;
  }
  const intakes = result.data.slice(0, value.pageSize).map((row) => ({
    intakeId: row.intake_id, organizationId: row.organization_id, status: row.status,
    revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  return { intakes, nextCursor: result.data.length > value.pageSize ? intakes[intakes.length - 1]!.intakeId : null };
}

export async function getIntake(input: z.input<typeof intakeReadInputSchema>, options: AuthorizationOptions = {}) {
  const parsed = intakeReadInputSchema.safeParse(input);
  if (!parsed.success) throw new IntakeReadError("REJECTED");
  const value = parsed.data;
  const data = await readRpc(value.organizationId, "mmhr_get_intake", {
    requested_organization_id: value.organizationId, requested_intake_id: value.intakeId,
  }, options);
  const result = detailSchema.safeParse(data);
  if (!result.success || result.data.organizationId !== value.organizationId || result.data.intakeId !== value.intakeId) {
    throw new IntakeReadError("INVALID_RESPONSE");
  }
  return result.data;
}
