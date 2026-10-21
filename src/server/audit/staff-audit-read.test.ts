import { beforeEach, expect, test, vi } from "vitest";
import { requirePermission, AuthorizationError } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { searchStaffAudit, StaffAuditInputError, StaffAuditReadError } from "./staff-audit-read";
import { auditAuthorization, auditClient, auditCorrelation, auditId, auditPage } from "./staff-audit-test-fixture";

vi.mock("@/server/auth/authorization", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/auth/authorization")>(), requirePermission: vi.fn(),
}));
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: vi.fn() }));
let reply: { body: unknown; status?: number }, fixture: ReturnType<typeof auditClient>;
beforeEach(() => {
  reply = { body: auditPage() }; fixture = auditClient(() => reply);
  vi.mocked(readSelectedOrganizationId).mockReset().mockResolvedValue(auditId(10));
  vi.mocked(requirePermission).mockReset().mockImplementation(async (permission, scope, options) => {
    if (!["admin.access", "audit.view"].includes(permission)) throw new Error("Unexpected permission");
    return auditAuthorization(fixture.client, scope, { correlationId: options?.correlationId ?? auditCorrelation });
  });
});
const search = (input: unknown = { organizationId: null }) => searchStaffAudit(input, { supabase: fixture.client, correlationId: auditCorrelation });
test("reauthorizes both permissions and uses the fixed POST RPC", async () => {
  const input = { organizationId: null, actor: { type: "worker", reference: "known-fixture-reference" } };
  expect(await search(input)).toEqual(auditPage());
  expect(vi.mocked(requirePermission).mock.calls.map(([permission]) => permission)).toEqual(["admin.access", "audit.view"]);
  expect(fixture.calls).toEqual([{ url: "https://audit-fixture.invalid/rest/v1/rpc/mmhr_search_staff_audit_events_v1",
    method: "POST", body: { payload: { ...input, limit: 25 } } }]);
});
test("rejects invalid input before authority or provider access", async () => {
  await expect(search({ organizationId: null, limit: 101 })).rejects.toBeInstanceOf(StaffAuditInputError);
  expect(requirePermission).not.toHaveBeenCalled(); expect(fixture.calls).toEqual([]);
});
test("rejects an organization outside the selected workspace", async () => {
  await expect(search({ organizationId: auditId(11) })).rejects.toBeInstanceOf(AuthorizationError);
  expect(requirePermission).not.toHaveBeenCalled(); expect(fixture.calls).toEqual([]);
});
test("preserves exact selected organization scope", async () => {
  reply.body = auditPage(auditId(10));
  expect(await search({ organizationId: auditId(10) })).toEqual(auditPage(auditId(10)));
  expect(vi.mocked(requirePermission).mock.calls[1]?.[1]).toEqual({ kind: "organization", organizationId: auditId(10) });
});
test("denies low assurance or changed actor between decisions", async () => {
  for (const change of [{ assurance: "aal1" as const }, { identityId: auditId(901) }]) {
    vi.mocked(requirePermission).mockResolvedValueOnce(auditAuthorization(fixture.client, { kind: "platform" }))
      .mockResolvedValueOnce(auditAuthorization(fixture.client, { kind: "platform" }, change));
    await expect(search()).rejects.toBeInstanceOf(AuthorizationError);
  }
  expect(fixture.calls).toEqual([]);
});
test.each([["42501", AuthorizationError], ["22023", StaffAuditInputError], ["XX000", StaffAuditReadError]])(
  "sanitizes provider code %s", async (code, errorType) => {
    reply = { body: { code, message: "private provider payload", details: "private reason", hint: "private reference" }, status: 400 };
    const failure = await search().catch(error => error);
    expect(failure).toBeInstanceOf(errorType); expect(String(failure)).not.toContain("private");
  });
test("rejects a response with private fields or mismatched scope", async () => {
  for (const body of [{ ...auditPage(), reason: "private" }, auditPage(auditId(11))]) {
    reply.body = body; await expect(search()).rejects.toBeInstanceOf(StaffAuditReadError);
  }
});
