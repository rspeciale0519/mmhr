import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());

const mapValue = z.union([
  z.string().trim().max(2_000),
  z.number().finite(),
  z.boolean(),
]);
const map = z.record(z.string().trim().min(1).max(100), mapValue).refine(
  (value) => Object.keys(value).length <= 50,
  "Intake maps may contain at most 50 fields",
);
const label = z.string().trim().min(1).max(200);
export const intakeDataSchema = z.strictObject({
  companyContext: map.optional(),
  currentSystems: z.array(label).max(50).optional(),
  complianceNeeds: z.array(label).max(50).optional(),
  budget: map.optional(),
  timeline: map.optional(),
  stakeholders: z.array(label).max(100).optional(),
  decisionProcess: map.optional(),
}).superRefine((value, context) => {
  const byteSize = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (byteSize > 90_000) {
    context.addIssue({ code: "custom", message: "Intake data is too large" });
  }
});

export const intakeSaveSchema = z.strictObject({
  intakeId: uuid.nullable(),
  organizationId: uuid,
  actorIdentityId: uuid,
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  status: z.enum(["draft", "in_progress", "submitted"]),
  data: intakeDataSchema,
  correlationId: uuid,
  idempotencyKey: uuid,
}).superRefine((value, context) => {
  if (value.intakeId === null && value.expectedRevision !== 0) {
    context.addIssue({ code: "custom", path: ["expectedRevision"], message: "New intakes require revision 0" });
  }
  if (value.intakeId === null && value.status === "submitted") {
    context.addIssue({ code: "custom", path: ["status"], message: "New intakes require an applicable requirement before submission" });
  }
  if (value.intakeId !== null && value.expectedRevision < 1) {
    context.addIssue({ code: "custom", path: ["expectedRevision"], message: "Updated intakes require a positive revision" });
  }
});

export const intakeSaveResultSchema = z.strictObject({
  intakeId: uuid,
  organizationId: uuid,
  status: z.enum(["draft", "in_progress", "submitted", "under_review", "completed", "archived"]),
  revision: z.number().int().min(1).max(2_147_483_647),
  outcomeCode: z.enum(["created", "updated", "replayed"]),
  correlationId: uuid,
});
export type IntakeSaveResult = z.infer<typeof intakeSaveResultSchema>;

export async function saveIntake(input: unknown, options: AuthorizationOptions = {}): Promise<IntakeSaveResult> {
  const parsed = intakeSaveSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid intake input");
  const command = parsed.data;

  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();

    // Customer draft saves use their separate action. This legacy path includes
    // submission and must not let an external viewer turn read access into writes.
    const administration = await requirePermission("admin.access", { kind: "platform" }, { supabase: context.supabase });
    if (administration.scope.kind !== "platform" || administration.identityId !== context.identityId) throw new AuthorizationError();

    const response = await context.supabase.rpc("mmhr_save_intake", {
      payload: command,
      correlation_id: command.correlationId,
      idempotency_key: command.idempotencyKey,
    });
    if (!response || response.error) throw new Error("Intake unavailable");

    const result = intakeSaveResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== command.organizationId ||
      result.data.correlationId !== command.correlationId ||
      (command.intakeId !== null && result.data.intakeId !== command.intakeId)) {
      throw new Error("Invalid intake response");
    }
    // The SQL replay returns the current row, which can have later revisions.
    // A new write must instead confirm this command's exact revision and status.
    const validOutcome = result.data.outcomeCode === "replayed"
      ? result.data.revision > command.expectedRevision
      : result.data.outcomeCode === (command.intakeId === null ? "created" : "updated") &&
        result.data.revision === command.expectedRevision + 1 && result.data.status === command.status;
    if (!validOutcome) throw new Error("Invalid intake response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Intake unavailable" || error.message === "Invalid intake response")) throw error;
    throw new Error("Intake unavailable");
  }
}
