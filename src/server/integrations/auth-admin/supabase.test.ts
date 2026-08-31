// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSupabaseIdentityService } from "./supabase";
import { IdentityAdapterConfigurationError, PROVIDER_REQUEST_TIMEOUT_MS } from "./transport";

const subjectId = "c80e9dca-fdf9-4d1e-bce1-281f0e9f188a";
const correlationId = "95284599-c545-46a8-8b02-2f8e6f3fda26";
const context = {
  operation: "invitation_delivery" as const,
  intentId: "50988d32-2943-4ef9-9db4-c8bef2817b90",
  correlationId,
  idempotencyKey: "95b4b381-d03a-4d05-98aa-68a52e5936fb",
};
const options = {
  supabaseUrl: "https://identity.example.test",
  applicationOrigin: "https://app.example.test",
  adminKey: "synthetic-admin-key-never-real",
};
const user = {
  id: subjectId,
  email: "Person@Example.test",
  email_confirmed_at: "2026-08-30T10:00:00Z",
  is_anonymous: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup() {
  const fetchImplementation = vi.fn<typeof fetch>();
  const service = createSupabaseIdentityService({ ...options, fetchImplementation });
  return { service, fetchImplementation };
}

afterEach(() => vi.restoreAllMocks());

describe("Supabase identity verification facts", () => {
  test("returns narrow provider facts without user metadata, tokens, or factor secrets", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json({
      ...user, user_metadata: { admin: true, secret: "private-marker" },
      app_metadata: { role: "super_admin" }, access_token: "private-marker",
      factors: [{ secret: "private-marker" }], phone: "+15555550100",
    }));
    const result = await service.getVerificationFacts({ subjectId, correlationId });
    expect(result).toEqual({ outcome: "succeeded", value: {
      subjectId, verifiedEmail: "person@example.test", emailVerifiedAt: user.email_confirmed_at,
      isAnonymous: false, isBanned: false, isDeleted: false, observedAt: expect.any(String),
    } });
    expect(JSON.stringify(result)).not.toContain("private-marker");
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe(`${options.supabaseUrl}/auth/v1/admin/users/${subjectId}`);
    expect(new Headers(init?.headers).get("x-correlation-id")).toBe(correlationId);
    expect(init).toEqual(expect.objectContaining({ credentials: "omit", redirect: "error", method: "GET" }));
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  });

  test("does not treat metadata or phone confirmation as verified email", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json({
      ...user, email_confirmed_at: null, confirmed_at: user.email_confirmed_at,
      user_metadata: { email_confirmed_at: user.email_confirmed_at, email_verified: true },
    }));
    expect(await service.getVerificationFacts({ subjectId, correlationId })).toEqual({
      outcome: "succeeded", value: expect.objectContaining({ verifiedEmail: null, emailVerifiedAt: null }),
    });
  });

  test("keeps current provider bans and deletion visible without granting application access", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json({
      ...user, banned_until: "2999-01-01T00:00:00Z", deleted_at: "2026-01-01T00:00:00Z", is_anonymous: true,
    }));
    expect(await service.getVerificationFacts({ subjectId, correlationId })).toEqual({
      outcome: "succeeded", value: expect.objectContaining({ isBanned: true, isDeleted: true, isAnonymous: true }),
    });
  });

  test.each([
    { ...user, id: context.intentId }, { ...user, email_confirmed_at: "invalid-time" },
    { ...user, is_anonymous: undefined }, { ...user, email: "invalid-email" },
  ])("fails closed for a mismatched or invalid provider user", async (body) => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json(body));
    expect(await service.getVerificationFacts({ subjectId, correlationId })).toEqual({
      outcome: "failed", code: "provider_response_invalid", retry: "never",
    });
  });

  test("requires an opaque correlation ID before making a provider call", async () => {
    const { service, fetchImplementation } = setup();
    expect(await service.getVerificationFacts({ subjectId, correlationId: "person@example.test" })).toEqual({
      outcome: "failed", code: "invalid_request", retry: "never",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test("isolates correlations across concurrent requests", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockImplementation(async () => json(user));
    await Promise.all([
      service.getVerificationFacts({ subjectId, correlationId }),
      service.getVerificationFacts({ subjectId, correlationId: context.intentId }),
    ]);
    expect(fetchImplementation.mock.calls.map(([, init]) => new Headers(init?.headers).get("x-correlation-id")))
      .toEqual([correlationId, context.intentId]);
  });
});

describe("safe provider failures", () => {
  test.each([
    [400, "provider_rejected", "never"], [404, "provider_rejected", "never"],
    [429, "provider_rejected", "safe"], [503, "provider_unavailable", "safe"],
  ])("maps status %s without returning provider details", async (status, code, retry) => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json({ message: "private-person-marker", token: "private-token" }, status));
    const result = await service.getVerificationFacts({ subjectId, correlationId });
    expect(result).toEqual({ outcome: "failed", code, retry });
    expect(JSON.stringify(result)).not.toContain("private-");
  });

  test("prevents raw transport errors from reaching the SDK logger", async () => {
    const { service, fetchImplementation } = setup();
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchImplementation.mockRejectedValue(new Error(`private-token ${options.adminKey}`));
    expect(await service.getVerificationFacts({ subjectId, correlationId })).toEqual({
      outcome: "failed", code: "provider_unavailable", retry: "safe",
    });
    expect(logger).not.toHaveBeenCalled();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  test("returns a safe configuration error without echoing credentials or URLs", () => {
    let caught: unknown;
    try {
      createSupabaseIdentityService({ ...options, supabaseUrl: "https://user:private-token@identity.example.test" });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(IdentityAdapterConfigurationError);
    expect(String(caught)).toBe("IdentityAdapterConfigurationError: Identity adapter configuration is invalid");
  });

  test("bounds a provider request and treats an email timeout as unknown", async () => {
    const { service, fetchImplementation } = setup();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
    fetchImplementation.mockImplementation(async (_input, init) => {
      init?.signal?.throwIfAborted();
      return json(user);
    });
    expect(await service.deliverInvitation({ email: "person@example.test", context })).toEqual({
      outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "manual_review",
    });
    expect(timeout).toHaveBeenCalledWith(PROVIDER_REQUEST_TIMEOUT_MS);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});

describe("fixed invitation delivery", () => {
  test("uses one fixed acceptance URL, no metadata, and no false provider idempotency promise", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json(user));
    expect(await service.deliverInvitation({ email: "  Person@Example.test  ", context })).toEqual({
      outcome: "succeeded", value: { acknowledgement: "provider_accepted" },
    });
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/auth/v1/invite");
    expect(new URL(String(url)).searchParams.get("redirect_to")).toBe("https://app.example.test/invitations/accept");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "person@example.test" });
    expect(new Headers(init?.headers).has("idempotency-key")).toBe(false);
    expect(new Headers(init?.headers).get("x-correlation-id")).toBe(correlationId);
    expect(service.providerWriteIdempotency).toBe("unsupported");
    expect(JSON.stringify(service)).not.toContain(options.adminKey);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  test("rejects an injected redirect before any write", async () => {
    const { service, fetchImplementation } = setup();
    const input = { email: "person@example.test", context, redirectTo: "https://attacker.example.test" };
    expect(await service.deliverInvitation(input)).toEqual({ outcome: "failed", code: "invalid_request", retry: "never" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test.each([408, 500, 503])("does not retry an ambiguous email write with status %s", async (status) => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json({ message: "private-message" }, status));
    expect(await service.deliverInvitation({ email: "person@example.test", context })).toEqual({
      outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "manual_review",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  test("does not expose account existence through a provider error code", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json({ code: "email_exists", message: "private-account" }, 422));
    expect(await service.deliverInvitation({ email: "person@example.test", context })).toEqual({
      outcome: "failed", code: "provider_rejected", retry: "never",
    });
  });

  test.each([{}, { ...user, email: "other@example.test" }])("does not report a malformed email receipt as success", async (body) => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json(body));
    expect(await service.deliverInvitation({ email: "person@example.test", context })).toEqual({
      outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "manual_review",
    });
  });

  test("uses manual reconciliation without assuming account existence proves delivery", async () => {
    const { service, fetchImplementation } = setup();
    expect(await service.reconcileInvitation({ email: "person@example.test", context })).toEqual({
      outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "manual_review",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
