import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const section = z.strictObject({ sectionKey: z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/), title: z.string().trim().min(1).max(200), questionCount: z.number().int().min(1).max(500) });
export const rfpCreateSchema = z.strictObject({ rfpId: uuid, intakeId: uuid, organizationId: uuid, actorIdentityId: uuid, version: z.number().int().min(1).max(10_000), sourceRevision: z.number().int().positive(), title: z.string().trim().min(1).max(200), sections: z.array(section).min(1).max(100), correlationId: uuid, idempotencyKey: uuid }).superRefine((value, context) => { if (new Set(value.sections.map((item) => item.sectionKey)).size !== value.sections.length) context.addIssue({ code: "custom", path: ["sections"], message: "RFP section keys must be unique" }); });
const resultSchema = z.strictObject({ rfpId: uuid, organizationId: uuid, sourceIntakeId: uuid, version: z.number().int().positive(), status: z.literal("draft"), title: z.string().min(1).max(200), sections: z.array(section).min(1).max(100), createdAt: z.iso.datetime({ offset: true }), outcomeCode: z.enum(["created", "replayed"]), correlationId: uuid });
export type RfpCreateResult = z.infer<typeof resultSchema>;

export async function createRfpVersion(input: unknown, options: AuthorizationOptions = {}): Promise<RfpCreateResult> {
  const parsed = rfpCreateSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP version input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_create_rfp_version", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP version unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.rfpId !== command.rfpId || result.data.organizationId !== command.organizationId || result.data.sourceIntakeId !== command.intakeId || result.data.version !== command.version || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP version response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP version unavailable" || error.message === "Invalid RFP version response")) throw error;
    throw new Error("RFP version unavailable");
  }
}
