import { createClient } from "@supabase/supabase-js";
import type { AuthorizationContext } from "@/server/auth/authorization";
import type { PermissionScope } from "@/server/auth/permission-registry";
import type { StaffAuditPage, StaffAuditRow } from "@/lib/staff-audit";

export const auditId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const auditCorrelation = auditId(999);
export const auditRow = (n = 1, occurredAt = "2026-10-04T12:00:00.123456Z"): StaffAuditRow => ({
  id: auditId(n), action: "role_version.activate", entityType: "role_definition", entityId: "r1.4-evaluation", occurredAt,
});
export const auditPage = (organizationId: string | null = null, rows = [auditRow()]): StaffAuditPage => ({
  version: 1, organizationId, rows, nextCursor: null,
});
export function auditClient(reply: () => { body: unknown; status?: number }) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const client = createClient("https://audit-fixture.invalid", "public-synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ url: String(input), method: init?.method ?? "GET", body });
      const response = reply();
      return new Response(JSON.stringify(response.body), { status: response.status ?? 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, calls };
}
export function auditAuthorization(supabase: AuthorizationContext["supabase"], scope: PermissionScope,
  overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return { supabase, scope, identityId: auditId(900), assurance: "aal2", correlationId: auditCorrelation, ...overrides };
}
