import { beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const subject = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const intakeId = "44444444-4444-4444-8444-444444444444";
const requirementId = "55555555-5555-4555-8555-555555555555";
const correlationId = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "77777777-7777-4777-8777-777777777777";
const origin = "https://mmhr.example";
const getClaims = vi.fn();
const rpc = vi.fn();
const authorization = { data: [{ identity_id: identityId, authorized_organization_id: organizationId, assurance: "aal1" }], error: null };
const input = {
  requirementId, organizationId, intakeId, expectedRevision: 0,
  stableKey: "payroll", label: "Payroll", importance: "must" as const,
  weight: 1, response: { answer: "yes" }, requirementType: "structured" as const,
  correlationId, idempotencyKey,
};
const result = { requirementId, organizationId, intakeId, revision: 1, correlationId, outcomeCode: "created" };

function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({
    user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...overrides,
  }).intakes;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  rpc.mockReset().mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: result, error: null });
});

test("saves a customer requirement through the same-origin mutation", async () => {
  await expect(caller().saveRequirement(input)).resolves.toEqual(result);
  expect(rpc).toHaveBeenLastCalledWith("mmhr_save_customer_intake_requirement", {
    payload: {
      requirementId, organizationId, intakeId, expectedRevision: 0, stableKey: "payroll",
      label: "Payroll", importance: "must", weight: 1, response: { answer: "yes" }, requirementType: "structured",
    },
    correlation_id: correlationId, idempotency_key: idempotencyKey,
  });
});

test.each([
  undefined, { method: "GET", origin }, { method: "POST", origin: null },
  { method: "POST", origin: "https://untrusted.example" },
])("rejects an untrusted mutation transport before authorization %#", async (transport) => {
  await expect(caller({ transport }).saveRequirement(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc).not.toHaveBeenCalled();
});

test("rejects anonymous and invalid callers without writing", async () => {
  await expect(caller({ user: null }).saveRequirement(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(caller().saveRequirement({ ...input, ownerIdentityId: identityId } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});

test("redacts database rejection and transport details", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: null, error: { code: "42501", message: "private scope" } });
  await expect(caller().saveRequirement(input)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Requirement not available" });
  rpc.mockImplementation(async (name) => { if (name === "mmhr_authorize") return authorization; throw new Error("private connection details"); });
  await expect(caller().saveRequirement(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Requirement could not be saved" });
});
