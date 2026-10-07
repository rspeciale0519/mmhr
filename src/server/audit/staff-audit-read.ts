import "server-only";
import { randomUUID } from "node:crypto";
import { staffAuditSearchSchema, verifyStaffAuditPage } from "@/lib/staff-audit";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";

export class StaffAuditInputError extends Error {
  constructor() { super("Audit search fields are invalid"); }
}
export class StaffAuditReadError extends Error {
  constructor() { super("Audit search is unavailable"); }
}
export async function searchStaffAudit(value: unknown, options: AuthorizationOptions = {}) {
  const parsed = staffAuditSearchSchema.safeParse(value);
  if (!parsed.success) throw new StaffAuditInputError();
  const input = parsed.data, correlationId = options.correlationId ?? randomUUID();
  if (input.organizationId !== null && await readSelectedOrganizationId() !== input.organizationId) {
    throw new AuthorizationError();
  }
  const staff = await requirePermission("admin.access", { kind: "platform" }, { ...options, correlationId });
  const scope = input.organizationId === null ? { kind: "platform" as const }
    : { kind: "organization" as const, organizationId: input.organizationId };
  const audit = await requirePermission("audit.view", scope, { supabase: staff.supabase, correlationId });
  if (staff.scope.kind !== "platform" || staff.assurance !== "aal2" || audit.assurance !== "aal2"
    || staff.identityId !== audit.identityId || staff.supabase !== audit.supabase
    || staff.correlationId !== correlationId || audit.correlationId !== correlationId
    || audit.scope.kind !== scope.kind || audit.scope.kind === "organization" && audit.scope.organizationId !== input.organizationId) {
    throw new AuthorizationError();
  }
  let response;
  try { response = await audit.supabase.rpc("mmhr_search_staff_audit_events_v1", { payload: input }); }
  catch { throw new StaffAuditReadError(); }
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (["22023", "22007", "22008"].includes(response.error?.code ?? "")) throw new StaffAuditInputError();
  if (response.error) throw new StaffAuditReadError();
  try { return verifyStaffAuditPage(response.data, input); }
  catch { throw new StaffAuditReadError(); }
}
