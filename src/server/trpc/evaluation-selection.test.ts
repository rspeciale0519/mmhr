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
const optionId = "88888888-8888-4888-8888-888888888888";
const candidateId = "99999999-9999-4999-8999-999999999999";
const selectionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const origin = "https://mmhr.example";
const getClaims = vi.fn();
const rpc = vi.fn();
const input = { organizationId, intakeId, publicationId, correlationId, idempotencyKey,
  expectedDigest: "a".repeat(64), optionIds: [optionId] };
const selected = { selectionId, organizationId, intakeId, publicationId, correlationId,
  inputDigest: input.expectedDigest, selectedCount: 1, initialCandidateCount: 1,
  items: [{ optionId, candidateId, ordinal: 6, maskedLabel: "Option 6" }], outcomeCode: "created" };
const read = { organizationId, intakeId, correlationId };
const history = { ...read, initialCandidateCount: 3, remainingInitialChoices: 2, items: [] };

function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({
    user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...overrides,
  }).evaluations;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === "mmhr_authorize") return {
      data: [{ identity_id: identityId, authorized_organization_id: args.organization_id, assurance: "aal1" }], error: null,
    };
    return { data: name === "mmhr_select_initial_evaluation_options" ? selected : history, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

test("selects a later publication option with customer AAL1 authority", async () => {
  await expect(caller().select(input)).resolves.toEqual(selected);
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, args]) => args)).toEqual([
    { permission_key: "evaluation.select", organization_id: organizationId },
    { permission_key: "evaluation.select", organization_id: organizationId },
  ]);
  const { correlationId: correlation, idempotencyKey: key, ...payload } = input;
  expect(rpc).toHaveBeenLastCalledWith("mmhr_select_initial_evaluation_options", {
    payload, correlation_id: correlation, idempotency_key: key,
  });
});

test.each([undefined, { method: "GET", origin }, { method: "POST", origin: null }, { method: "POST", origin: "https://wrong.example" }])(
  "denies unsafe selection transport %#", async (transport) => {
    await expect(caller({ transport }).select(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  },
);

test("denies anonymous selection", async () => {
  await expect(caller({ user: null }).select(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(rpc).not.toHaveBeenCalled();
});

test.each([{ actorIdentityId: identityId }, { optionIds: [] }, { optionIds: [optionId, optionId] },
  { optionIds: Array.from({ length: 6 }, () => optionId) }, { expectedDigest: "bad" }])(
  "rejects invalid selection before database calls %#", async (patch) => {
    await expect(caller().select({ ...input, ...patch } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rpc).not.toHaveBeenCalled();
  },
);

test.each([1, 2])("denies lost selection authority at check %i", async (check) => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    if (name === "mmhr_authorize" && rpc.mock.calls.filter(([called]) => called === name).length === check) {
      return { data: [], error: null };
    }
    return original(name, args);
  });
  await expect(caller().select(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalledWith("mmhr_select_initial_evaluation_options", expect.anything());
});

test("reads masked history and counts legacy candidates without selection authority", async () => {
  await expect(caller({ transport: { method: "GET", origin: null } }).selections(read)).resolves.toEqual(history);
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").every(([, args]) => args.permission_key === "portal.customer.access")).toBe(true);
});

test.each(["select", "selections"] as const)("conceals private database denials for %s", async (method) => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => name === "mmhr_authorize" ? original(name, args)
    : { data: null, error: { code: "42501", message: "private database details" } });
  const operation = method === "select" ? caller().select(input) : caller().selections(read);
  await expect(operation).rejects.toMatchObject({ code: "NOT_FOUND", message: "Evaluation is not available" });
});

test("denies malformed successful responses without leaking data", async () => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => name === "mmhr_authorize" ? original(name, args)
    : { data: { ...selected, providerName: "private provider" }, error: null });
  await expect(caller().select(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Evaluation request failed" });
});

test("discovers the current comparison through the customer permission without a publication identifier", async () => {
  const current = { ...read, publication: null };
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => name === "mmhr_authorize" ? original(name, args) : { data: current, error: null });
  await expect(caller({ transport: { method: "GET", origin: null } }).current(read)).resolves.toEqual(current);
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").every(([, args]) => args.permission_key === "portal.customer.access")).toBe(true);
  expect(rpc).toHaveBeenLastCalledWith("mmhr_get_current_evaluation_publication", {
    payload: { organizationId, intakeId, limit: 25, detailsVersion: 1 }, correlation_id: correlationId,
  });
});
