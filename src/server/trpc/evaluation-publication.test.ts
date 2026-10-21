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
const publicationId = "77777777-7777-4777-8777-777777777777";
const origin = "https://mmhr.example";
const getClaims = vi.fn();
const rpc = vi.fn();
const input = {
  organizationId, intakeId, correlationId, idempotencyKey, expectedRevision: 2,
  configuration: { version: 1 as const, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: [] }] },
};
const summary = {
  publicationId, organizationId, intakeId, correlationId, sequence: 1, configurationVersion: 1,
  inputDigest: "a".repeat(64), optionCount: 0,
};
const prepared = { ...summary, state: "prepared", outcomeCode: "prepared" };
const read = { organizationId, intakeId, publicationId, correlationId };
const page = { ...summary, state: "published", options: [], nextOrdinal: null };

function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({
    user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...overrides,
  }).evaluations;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === "mmhr_authorize") return {
      data: [{ identity_id: identityId, authorized_organization_id: args.organization_id, assurance: "aal2" }], error: null,
    };
    return { data: name === "mmhr_prepare_evaluation_publication" ? prepared : page, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

test("prepares through the current caller, internal action and platform authority", async () => {
  await expect(caller().prepare(input)).resolves.toEqual(prepared);
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, args]) => args)).toEqual([
    { permission_key: "evaluation.publish", organization_id: organizationId },
    { permission_key: "evaluation.publish", organization_id: organizationId },
    { permission_key: "admin.access", organization_id: null },
  ]);
  const { correlationId: correlation, idempotencyKey: key, ...payload } = input;
  expect(rpc).toHaveBeenLastCalledWith("mmhr_prepare_evaluation_publication", {
    payload, correlation_id: correlation, idempotency_key: key,
  });
});

test.each([undefined, { method: "GET", origin }, { method: "POST", origin: null }, { method: "POST", origin: "https://wrong.example" }])(
  "denies unsafe mutation transport %#", async (transport) => {
    await expect(caller({ transport }).prepare(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  },
);
test("denies anonymous and AAL1 publication", async () => {
  await expect(caller({ user: null }).prepare(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  await expect(caller().prepare(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each([{ actorIdentityId: identityId }, { expectedRevision: 0 }, { configuration: {} }])(
  "rejects invalid inputs before a database call %#", async (patch) => {
    await expect(caller().prepare({ ...input, ...patch } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rpc).not.toHaveBeenCalled();
  },
);
test.each([1, 2, 3])("denies lost authority at check %i", async (check) => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    if (name === "mmhr_authorize" && rpc.mock.calls.filter(([called]) => called === name).length === check) {
      return { data: [], error: null };
    }
    return original(name, args);
  });
  await expect(caller().prepare(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalledWith("mmhr_prepare_evaluation_publication", expect.anything());
});
test("reads the masked page through the customer portal permission", async () => {
  await expect(caller({ transport: { method: "GET", origin: null } }).get(read)).resolves.toEqual(page);
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").every(([, args]) => args.permission_key === "portal.customer.access")).toBe(true);
});
test("does not expose database rejection details", async () => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => name === "mmhr_prepare_evaluation_publication"
    ? { data: null, error: { code: "42501", message: "private details" } } : original(name, args));
  await expect(caller().prepare(input)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Evaluation is not available" });
});
