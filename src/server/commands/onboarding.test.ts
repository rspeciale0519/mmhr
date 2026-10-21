import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import { recordOnboarding, onboardingCommandSchema } from "./onboarding";

vi.mock("@/server/auth/authorization", () => ({
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor() {
      super("Request is not authorized");
    }
  },
}));

const id = (value: number) => `abcdefab-2222-4222-8222-${value.toString(16).padStart(12, "0")}`;
const organizationId = id(1);
const actorIdentityId = id(2);
const correlationId = id(3);
const idempotencyKey = id(4);
const onboardingId = id(5);
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const options = { supabase, correlationId };
const context: AuthorizationContext = {
  supabase,
  correlationId,
  identityId: actorIdentityId,
  scope: { kind: "organization", organizationId },
  assurance: "aal2",
};
const milestone = {
  milestoneId: id(6),
  title: "Configure SSO",
  ownerIdentityId: actorIdentityId,
  dueAt: "2026-09-10T00:00:00Z",
  status: "pending" as const,
  completedAt: null,
};
const createInput = {
  organizationId,
  actorIdentityId,
  correlationId,
  idempotencyKey,
  onboardingId,
  action: "create" as const,
  dealId: id(7),
  ownerIdentityId: actorIdentityId,
  targetGoLiveAt: "2026-09-30T00:00:00Z",
  milestones: [milestone],
  checkIns: [],
  risks: [],
};
const result = {
  onboardingId,
  organizationId,
  status: "planned",
  revision: 1,
  outcomeCode: "recorded" as const,
  correlationId,
};

describe("onboarding command", () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockReset().mockResolvedValue({ data: result, error: null });
  });

  test("accepts a planned onboarding", () => {
    expect(onboardingCommandSchema.parse(createInput).action).toBe("create");
  });

  test("requires approval to be represented on reactivation", () => {
    expect(onboardingCommandSchema.safeParse({
      organizationId,
      actorIdentityId,
      correlationId,
      idempotencyKey,
      onboardingId,
      action: "transition",
      fromStatus: "failed",
      toStatus: "reactivated",
      expectedRevision: 2,
      occurredAt: "2026-09-03T00:00:00Z",
      reason: "Restart",
      failureReason: null,
      approvalReference: id(8),
    }).success).toBe(true);
  });

  test("uses exact organization scope and the authorized client", async () => {
    await expect(recordOnboarding(createInput, options)).resolves.toEqual(result);
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "workspace.access",
      { kind: "organization", organizationId },
      options,
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_record_onboarding", {
      payload: createInput,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    });
  });

  test("rejects an actor or scope mismatch before the RPC", async () => {
    vi.mocked(requirePermission).mockResolvedValue({
      ...context,
      identityId: id(9),
    });
    await expect(recordOnboarding(createInput, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();

    vi.mocked(requirePermission).mockResolvedValue({
      ...context,
      scope: { kind: "organization", organizationId: id(10) },
    });
    await expect(recordOnboarding(createInput, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects malformed responses without exposing returned data", async () => {
    rpc.mockResolvedValue({
      data: { ...result, organizationId: id(10), privateDetail: "secret" },
      error: null,
    });
    const response = recordOnboarding(createInput, options);
    await expect(response).rejects.toThrow("Invalid onboarding result");
    await expect(response).rejects.not.toHaveProperty("cause");
  });
});
