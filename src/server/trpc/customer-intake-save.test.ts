import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const intakeId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const origin = "https://mmhr.example";
const getClaims = vi.fn();
const rpc = vi.fn();
const authorization = { data: [{ identity_id: identityId, authorized_organization_id: organizationId, assurance: "aal1" }], error: null };
const input = { intakeId: null, organizationId, expectedRevision: 0, status: "draft" as const, data: {}, correlationId, idempotencyKey };
const result = { intakeId, organizationId, revision: 1, status: "draft", outcomeCode: "created", correlationId };
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...overrides }).intakes;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  rpc.mockReset().mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: result, error: null });
});
afterEach(() => vi.unstubAllEnvs());

test("saves a draft through the same-origin, permission-aware caller at AAL1", async () => {
  await expect(caller().saveDraft(input)).resolves.toEqual(result);
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, args]) => args)).toEqual([
    { permission_key: "intake.draft.save", organization_id: organizationId },
    { permission_key: "intake.draft.save", organization_id: organizationId },
    { permission_key: "portal.customer.access", organization_id: organizationId },
  ]);
  expect(rpc).toHaveBeenLastCalledWith("mmhr_save_customer_intake", {
    payload: { intakeId: null, organizationId, expectedRevision: 0, status: "draft", data: {} },
    correlation_id: correlationId, idempotency_key: idempotencyKey,
  });
});

test.each([
  undefined, { method: "GET", origin }, { method: "POST", origin: null },
  { method: "POST", origin: "https://untrusted.example" },
  { method: "POST", origin: `${origin}/path` },
])("denies untrusted mutation transport before any database call %#", async (transport) => {
  await expect(caller({ transport }).saveDraft(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc).not.toHaveBeenCalled();
});

test("denies anonymous saving", async () => {
  await expect(caller({ user: null }).saveDraft(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { actorIdentityId: identityId }, { status: "submitted" }, { organizationId: "bad" },
  { data: { ranking: {} } }, { role: "contributor" }, { expectedRevision: 1 },
])("rejects invalid or authority-bearing input %#", async (patch) => {
  await expect(caller().saveDraft({ ...input, ...patch } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});

test.each([1, 2, 3])("denies access lost at permission check %i before the writer", async (check) => {
  for (let i = 1; i < check; i++) rpc.mockResolvedValueOnce(authorization);
  rpc.mockResolvedValueOnce({ data: [], error: null });
  await expect(caller().saveDraft(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});

test("denies an authorization response for another organization", async () => {
  rpc.mockResolvedValue({ data: [{ ...authorization.data[0], authorized_organization_id: subject }], error: null });
  await expect(caller().saveDraft(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalledWith("mmhr_save_customer_intake", expect.anything());
});

test("redacts SQL rejection and transport errors", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: null, error: { code: "42501", message: "private scope" } });
  await expect(caller().saveDraft(input)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Intake not available" });
  rpc.mockImplementation(async (name) => { if (name === "mmhr_authorize") return authorization; throw new Error("private connection details"); });
  await expect(caller().saveDraft(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Intake could not be saved" });
});

test("does not return a malformed save response", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: { ...result, organizationId: subject }, error: null });
  await expect(caller().saveDraft(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Intake could not be saved" });
});
