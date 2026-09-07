import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const subject = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const invitationId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const origin = "https://mmhr.example";
const getClaims = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc };
const metadata = { organizationId, reason: "Invite project member", correlationId, idempotencyKey };
const createInput = { ...metadata, email: "person@example.invalid", roleKey: "viewer" as const };
const result = { invitationId, status: "pending", outcome: "created", correlationId };

function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: supabase as never,
    transport: { method: "POST", origin }, ...overrides });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, input) => {
    if (name === "mmhr_authorize") return { data: [{ identity_id: identityId,
      authorized_organization_id: input.organization_id, assurance: "aal2" }], error: null };
    if (name === "mmhr_get_my_invitations") return { data: [], error: null };
    return { data: result, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("invitation application router", () => {
  test("registers caller-only reads and denies anonymous reads", async () => {
    await expect(caller().invitations.mine()).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("mmhr_get_my_invitations");
    rpc.mockClear();
    await expect(caller({ user: null }).invitations.mine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("creates through the existing command with request-scoped authorization", async () => {
    await expect(caller().invitations.create(createInput)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("mmhr_create_invitation", {
      organization_id: organizationId, email: createInput.email, role_key: "viewer",
      reason: metadata.reason, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize")).toHaveLength(2);
  });

  test.each(["resend", "revoke"] as const)("connects %s with the exact permission", async (operation) => {
    await caller().invitations[operation]({ ...metadata, invitationId });
    expect(rpc).toHaveBeenCalledWith("mmhr_authorize", {
      permission_key: operation === "revoke" ? "org.members.revoke" : "org.members.invite",
      organization_id: organizationId,
    });
    expect(rpc).toHaveBeenCalledWith(`mmhr_${operation}_invitation`, {
      organization_id: organizationId, invitation_id: invitationId, reason: metadata.reason,
      correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });

  test("rejects a supplied actor before any RPC", async () => {
    await expect(caller().invitations.create({ ...createInput, actorIdentityId: subject } as never))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([undefined, { method: "GET", origin }, { method: "POST", origin: "https://untrusted.example" }])(
    "rejects untrusted mutation transport", async (transport) => {
      await expect(caller({ transport }).invitations.create(createInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  test("denies unauthorized organization scope without invoking the command", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(caller().invitations.create(createInput)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
  });

  test("denies AAL1 before the command", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
    await expect(caller().invitations.create(createInput)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("does not expose database error details", async () => {
    rpc.mockImplementation(async (name, input) => name === "mmhr_authorize"
      ? { data: [{ identity_id: identityId, authorized_organization_id: input.organization_id, assurance: "aal2" }], error: null }
      : { data: null, error: { message: "private database details" } });
    await expect(caller().invitations.create(createInput)).rejects.toMatchObject({
      code: "NOT_FOUND", message: "Invitation unavailable",
    });
  });
});
