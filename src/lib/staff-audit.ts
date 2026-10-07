import { z } from "zod";

const uuid = z.uuid().transform(value => value.toLowerCase());
// Preserve PostgreSQL microseconds. Date.toISOString() must not create cursors.
export const auditInstantSchema = z.iso.datetime({ precision: 6 })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
const text = (max: number) => z.string().min(1).max(max)
  .refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value));
export const auditActorSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("user"), identityId: uuid }),
  z.strictObject({ type: z.literal("worker"), reference: text(500).optional() }),
  z.strictObject({ type: z.literal("system"), reference: text(500).optional() }),
  z.strictObject({ type: z.literal("migration"), reference: text(500).optional() }),
]);
export const auditCursorSchema = z.strictObject({ occurredAt: auditInstantSchema, id: uuid });
export const staffAuditSearchSchema = z.strictObject({
  organizationId: uuid.nullable(),
  actor: auditActorSchema.optional(),
  entityType: text(100).optional(),
  entityId: text(256).optional(),
  action: text(100).optional(),
  occurredFrom: auditInstantSchema.optional(),
  occurredTo: auditInstantSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  after: auditCursorSchema.optional(),
}).superRefine((input, context) => {
  if (input.occurredFrom && input.occurredTo && input.occurredFrom > input.occurredTo) {
    context.addIssue({ code: "custom", path: ["occurredFrom"], message: "The date range is reversed" });
  }
});
export const staffAuditRowSchema = z.strictObject({
  id: uuid, action: text(100), entityType: text(100), entityId: text(256), occurredAt: auditInstantSchema,
});
export const staffAuditPageSchema = z.strictObject({
  version: z.literal(1), organizationId: uuid.nullable(), rows: z.array(staffAuditRowSchema).max(100),
  nextCursor: auditCursorSchema.nullable(),
});
export type StaffAuditSearch = z.output<typeof staffAuditSearchSchema>;
export type StaffAuditSearchInput = z.input<typeof staffAuditSearchSchema>;
export type StaffAuditPage = z.output<typeof staffAuditPageSchema>;
export type StaffAuditRow = z.output<typeof staffAuditRowSchema>;

function follows(row: z.output<typeof auditCursorSchema>, previous: z.output<typeof auditCursorSchema>) {
  return row.occurredAt < previous.occurredAt || row.occurredAt === previous.occurredAt && row.id > previous.id;
}
export function verifyStaffAuditPage(value: unknown, request: StaffAuditSearch): StaffAuditPage {
  const parsed = staffAuditPageSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid audit search response");
  const page = parsed.data;
  if (page.organizationId !== request.organizationId || page.rows.length > request.limit) {
    throw new Error("Invalid audit search response");
  }
  const seen = new Set<string>();
  let previous = request.after;
  for (const row of page.rows) {
    if (seen.has(row.id) || previous && !follows(row, previous)
      || request.action !== undefined && row.action !== request.action
      || request.entityType !== undefined && row.entityType !== request.entityType
      || request.entityId !== undefined && row.entityId !== request.entityId
      || request.occurredFrom !== undefined && row.occurredAt < request.occurredFrom
      || request.occurredTo !== undefined && row.occurredAt > request.occurredTo) {
      throw new Error("Invalid audit search response");
    }
    seen.add(row.id); previous = row;
  }
  const last = page.rows.at(-1);
  if (page.nextCursor && (page.rows.length !== request.limit || !last
    || page.nextCursor.id !== last.id || page.nextCursor.occurredAt !== last.occurredAt)) {
    throw new Error("Invalid audit search response");
  }
  // The actor is deliberately absent. SQL must prove actor-filter membership.
  return page;
}

export function auditFormInstant(value: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/.exec(value);
  if (!match) throw new Error("Invalid audit date");
  return auditInstantSchema.parse(`${match[1]}:${match[2] ?? "00"}.${(match[3] ?? "").padEnd(6, "0")}Z`);
}
export function auditSearchFromForm(form: FormData, organizationId: string | null): StaffAuditSearch {
  const get = (name: string) => {
    const value = form.get(name);
    if (value !== null && typeof value !== "string") throw new Error("Invalid audit field");
    return value?.trim() ?? "";
  };
  const type = get("actorType"), identityId = get("actorIdentityId"), reference = get("actorReference");
  if (!type && (identityId || reference) || type === "user" && reference || type && type !== "user" && identityId) {
    throw new Error("Invalid audit actor");
  }
  const actor = !type ? undefined : type === "user" ? { type, identityId } : { type, ...(reference ? { reference } : {}) };
  const optional = (name: string) => get(name) || undefined;
  return staffAuditSearchSchema.parse({ organizationId, actor, entityType: optional("entityType"),
    entityId: optional("entityId"), action: optional("action"), occurredFrom: auditFormInstant(get("occurredFrom")),
    occurredTo: auditFormInstant(get("occurredTo")), limit: Number(get("limit") || "25") });
}
