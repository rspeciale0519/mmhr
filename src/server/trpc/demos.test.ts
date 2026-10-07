import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";
import type { DemoCoordinationCommand } from "@/lib/demo-coordination";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject = randomUUID(), identityId = randomUUID(), organizationId = randomUUID(), demoId = randomUUID(), correlationId = randomUUID();
const origin = "https://mmhr.example", rpc = vi.fn(), getClaims = vi.fn();
const plan: Extract<DemoCoordinationCommand, { action: "create" }>["plan"] = { round: 1, audience: "Synthetic payroll team", purpose: "Verify export", format: "remote",
  participants: [{ name: "Synthetic attendee", role: "Payroll lead", organization: "customer" }], requiredTopics: ["Export"] };
const input = { action: "create" as const, organizationId, correlationId, idempotencyKey: randomUUID(), candidateId: randomUUID(), recipientId: randomUUID(), plan };
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...overrides }).demos;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === "mmhr_authorize") return { data: [{ identity_id: identityId, authorized_organization_id: args.organization_id, assurance: "aal2" }], error: null };
    if (name === "mmhr_get_demo_coordination_history") return { data: { organizationId, correlationId, demoId, items: [], nextRevision: null }, error: null };
    if (name === "mmhr_get_demo_coordination") return { data: { organizationId, correlationId, choices: [], items: [], nextCursor: null, nextChoiceCursor: null }, error: null };
    return { data: { organizationId, correlationId, demoId, revision: 1, status: "requested", outcomeCode: "recorded" }, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());
test("creates a demo through two verified staff checks without a client actor", async () => {
  await expect(caller().create(input)).resolves.toMatchObject({ demoId });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, args]) => args.permission_key)).toEqual(["rfp.approve", "rfp.approve"]);
  const args = rpc.mock.calls.find(([name]) => name === "mmhr_record_demo_coordination")![1];
  expect(args.payload).not.toHaveProperty("actorIdentityId"); expect(args.payload).toMatchObject({ candidateId: input.candidateId, recipientId: input.recipientId });
});
test.each([undefined, { method: "GET", origin }, { method: "POST", origin: null }, { method: "POST", origin: "https://wrong.example" }])(
  "denies unsafe mutation transport %#", async (transport) => {
    await expect(caller({ transport }).create(input)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(rpc).not.toHaveBeenCalled();
  });
test("denies anonymous users, injected actors, and staff AAL1", async () => {
  await expect(caller({ user: null }).create(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(caller().create({ ...input, actorIdentityId: identityId } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  await expect(caller().create(input)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(rpc).not.toHaveBeenCalled();
});
test.each(["customer", "vendor", "staff"] as const)("binds %s reads and history to a fixed view", async (view) => {
  const reads = caller({ transport: { method: "GET", origin: null } }), read = { organizationId, correlationId };
  const result = view === "customer" ? reads.customer({ ...read, view: "customer" })
    : view === "vendor" ? reads.vendor({ ...read, view: "vendor" }) : reads.staff({ ...read, view: "staff" });
  await expect(result).resolves.toMatchObject({ items: [] });
  const history = view === "customer" ? reads.customerHistory({ ...read, demoId, view: "customer" })
    : view === "vendor" ? reads.vendorHistory({ ...read, demoId, view: "vendor" }) : reads.staffHistory({ ...read, demoId, view: "staff" });
  await expect(history).resolves.toMatchObject({ demoId, items: [] });
  const permission = view === "staff" ? "rfp.approve" : `portal.${view}.access`;
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").every(([, args]) => args.permission_key === permission)).toBe(true);
  await expect(caller()[view]({ organizationId, correlationId, view: view === "staff" ? "vendor" : "staff" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
test("conceals raw database failures and rejects forged response scope", async () => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => name === "mmhr_authorize" ? original(name, args) : { data: null, error: { code: "42501", message: "private row" } });
  await expect(caller().create(input)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Demo request failed" });
  rpc.mockImplementation(async (name, args) => name === "mmhr_authorize" ? original(name, args)
    : { data: { organizationId: randomUUID(), correlationId, demoId, revision: 1, status: "requested", outcomeCode: "recorded" }, error: null });
  await expect(caller().create(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Demo request failed" });
});
