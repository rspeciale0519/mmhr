import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { auditRouter } from "./routers/audit";
import { router, type Context } from "./trpc";
import { authorizePermission } from "@/server/auth/authorization";
import { searchStaffAudit, StaffAuditInputError, StaffAuditReadError } from "@/server/audit/staff-audit-read";
import { auditAuthorization, auditClient, auditId, auditPage } from "@/server/audit/staff-audit-test-fixture";

vi.mock("@/server/auth/authorization", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/auth/authorization")>(), authorizePermission: vi.fn(),
}));
vi.mock("@/server/audit/staff-audit-read", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/audit/staff-audit-read")>(), searchStaffAudit: vi.fn(),
}));
const root = router({ audit: auditRouter });
const supabase = auditClient(() => ({ body: {} })).client;
const origin = "https://audit-fixture.invalid";
const context = (changes: Partial<Context> = {}): Context => ({ user: { id: auditId(9) }, supabase,
  transport: { method: "POST", origin }, ...changes });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.mocked(authorizePermission).mockReset().mockImplementation(async (permission, scope) =>
    permission === "audit.view" ? auditAuthorization(supabase, scope) : null);
  vi.mocked(searchStaffAudit).mockReset().mockResolvedValue(auditPage());
});
afterEach(() => vi.unstubAllEnvs());
test("uses typed current audit authority and passes only the request client", async () => {
  expect(await root.createCaller(context()).audit.search({ organizationId: null })).toEqual(auditPage());
  expect(authorizePermission).toHaveBeenCalledWith("audit.view", { kind: "platform" }, { supabase });
  expect(searchStaffAudit).toHaveBeenCalledWith({ organizationId: null, limit: 25 }, { supabase });
});
test.each([undefined, { method: "GET", origin }, { method: "POST", origin: null }, { method: "POST", origin: "https://wrong.invalid" }])(
  "denies unsafe read transport %# before data access", async transport => {
    await expect(root.createCaller(context({ transport })).audit.search({ organizationId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(searchStaffAudit).not.toHaveBeenCalled(); expect(authorizePermission).not.toHaveBeenCalled();
  });
test("denies anonymous or unauthorized requests", async () => {
  await expect(root.createCaller(context({ user: null })).audit.search({ organizationId: null })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  vi.mocked(authorizePermission).mockResolvedValue(null);
  await expect(root.createCaller(context()).audit.search({ organizationId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(searchStaffAudit).not.toHaveBeenCalled();
});
test("rejects malformed input before permission evaluation", async () => {
  await expect(root.createCaller(context()).audit.search({ organizationId: null, limit: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(authorizePermission).not.toHaveBeenCalled(); expect(searchStaffAudit).not.toHaveBeenCalled();
});
test.each([new StaffAuditInputError(), new StaffAuditReadError(), new Error("private reference")])(
  "does not disclose an internal failure %#", async failure => {
    vi.mocked(searchStaffAudit).mockRejectedValue(failure);
    await expect(root.createCaller(context()).audit.search({ organizationId: null })).rejects.toMatchObject({
      message: failure instanceof StaffAuditInputError ? "Audit search fields are invalid" : "Audit search is unavailable",
    });
  });
test("installed httpBatchLink sends this read through POST body without actor input in URL", async () => {
  const requests: { url: string; method: string; body: string }[] = [];
  const client = createTRPCClient<typeof root>({ links: [httpBatchLink({ url: `${origin}/api/trpc`, transformer: superjson,
    fetch: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? "GET", body: String(init?.body ?? "") });
      return new Response(JSON.stringify([{ result: { data: superjson.serialize(auditPage()) } }]), { headers: { "Content-Type": "application/json" } });
    },
  })] });
  await expect(client.audit.search.mutate({ organizationId: null, actor: { type: "worker", reference: "known-fixture-reference" } })).resolves.toEqual(auditPage());
  expect(requests).toHaveLength(1); expect(requests[0]?.method).toBe("POST");
  expect(requests[0]?.url).not.toContain("known-fixture-reference"); expect(requests[0]?.url).not.toContain("input=");
  expect(requests[0]?.body).toContain("known-fixture-reference");
});
