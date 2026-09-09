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
const input = { organizationId, intakeId, expectedRevision: 3, correlationId, idempotencyKey };
const result = { intakeId, organizationId, status: "submitted", revision: 4, outcomeCode: "updated", correlationId };

function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({
    user: { id: subject },
    supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin },
    ...overrides,
  }).intakes;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  rpc.mockReset().mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: result, error: null });
});

afterEach(() => vi.unstubAllEnvs());

test("submits through the same-origin, permission-aware caller with exact payload and revision", async () => {
  await expect(caller().submit(input)).resolves.toEqual(result);
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, args]) => args)).toEqual([
    { permission_key: "intake.submit", organization_id: organizationId },
    { permission_key: "intake.submit", organization_id: organizationId },
    { permission_key: "portal.customer.access", organization_id: organizationId },
  ]);
  expect(rpc).toHaveBeenLastCalledWith("mmhr_submit_customer_intake", {
    payload: { organizationId, intakeId, expectedRevision: 3 },
    correlation_id: correlationId,
    idempotency_key: idempotencyKey,
  });
});

test.each([
  undefined,
  { method: "GET", origin },
  { method: "POST", origin: null },
  { method: "POST", origin: "https://untrusted.example" },
  { method: "POST", origin: `${origin}/path` },
])("denies untrusted mutation transport before any database call %#", async (transport) => {
  await expect(caller({ transport }).submit(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc).not.toHaveBeenCalled();
});

test("denies anonymous submission", async () => {
  await expect(caller({ user: null }).submit(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { data: {} },
  { status: "submitted" },
  { actorIdentityId: identityId },
  { ownerIdentityId: identityId },
  { expectedRevision: 0 },
  { expectedRevision: 2_147_483_647 },
  { intakeId: null },
  { organizationId: "bad" },
])("rejects schema extras, authority fields, and invalid revisions %#", async (patch) => {
  await expect(caller().submit({ ...input, ...patch } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});

test.each([1, 2, 3])("denies access lost at permission check %i before the writer", async (check) => {
  rpc.mockReset();
  rpc.mockImplementation(async (name) => {
    if (name !== "mmhr_authorize") return { data: result, error: null };
    const authorizationCall = rpc.mock.calls.filter(([calledName]) => calledName === "mmhr_authorize").length;
    return authorizationCall === check ? { data: [], error: null } : authorization;
  });
  await expect(caller().submit(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalledWith("mmhr_submit_customer_intake", expect.anything());
});

test("maps SQL rejection to a safe not-found response", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize"
    ? authorization
    : { data: null, error: { code: "42501", message: "private scope detail" } });
  await expect(caller().submit(input)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "Intake submission not available",
  });
});

test("maps unknown provider failures to a safe internal response", async () => {
  rpc.mockImplementation(async (name) => {
    if (name === "mmhr_authorize") return authorization;
    throw new Error("private connection detail");
  });
  await expect(caller().submit(input)).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Intake could not be submitted",
  });
});

test.each([
  { data: { ...result, organizationId: subject }, error: null },
  { data: { ...result, revision: 3 }, error: null },
  { data: undefined, error: null },
])("rejects malformed submit responses without exposing details %#", async (response) => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : response);
  await expect(caller().submit(input)).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Intake could not be submitted",
  });
});
