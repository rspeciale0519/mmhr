import { beforeEach, describe, expect, test, vi } from "vitest";

import { forbidden, redirect } from "next/navigation";
import { cookies } from "next/headers";

import {
  requireHomeAccess,
  requireMfaPageIdentity,
  requirePageIdentity,
  requirePagePermission,
  requireSelectedOrganizationPermission,
} from "@/server/auth/page-guards";
import { getVerifiedIdentity } from "@/server/auth/verified-identity";
import { authorizePermission } from "@/server/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const validIdentityId = "abcdef01-2345-4678-9abc-def012345678";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  forbidden: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

vi.mock("@/server/auth/verified-identity", () => ({
  getVerifiedIdentity: vi.fn(),
}));

vi.mock("@/server/auth/authorization", () => ({
  authorizePermission: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("page identity guard", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockReset();
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    vi.mocked(forbidden).mockReset();
    vi.mocked(forbidden).mockImplementation(() => {
      throw new Error("NEXT_FORBIDDEN");
    });
    vi.mocked(getVerifiedIdentity).mockReset();
    vi.mocked(authorizePermission).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(cookies).mockReset();
    vi.mocked(cookies).mockResolvedValue({ get: vi.fn() } as never);
  });

  test("redirects when identity verification returns no identity", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue(null);

    await expect(requirePageIdentity()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  test("returns a verified identity", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });

    await expect(requirePageIdentity()).resolves.toEqual({ id: "user-123" });
    expect(redirect).not.toHaveBeenCalled();
  });

  test("requires platform permission with distinct Auth and application identity IDs", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });
    vi.mocked(authorizePermission).mockResolvedValue({
      identityId: validIdentityId,
      scope: { kind: "platform" },
    } as never);

    await expect(requirePagePermission("admin.access", { kind: "platform" })).resolves.toMatchObject({
      identity: { id: "user-123" },
    });
    expect(authorizePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  });

  test("permits pending identities to enroll MFA", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: validIdentityId });
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ id: validIdentityId, status: "pending", email_verified_at: null }],
        error: null,
      }),
    } as never);

    await expect(requireMfaPageIdentity()).resolves.toEqual({ id: validIdentityId });
    expect((await createClient()).rpc).toHaveBeenCalledWith("mmhr_get_my_account_setup");
  });

  test.each([
    ["recovery_pending", "2026-08-30T00:00:00.000Z"],
    ["suspended", "2026-08-30T00:00:00.000Z"],
    ["archived", "2026-08-30T00:00:00.000Z"],
    ["active", null],
  ])("denies %s identities from the general MFA page", async (status, emailVerifiedAt) => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ id: validIdentityId, status, email_verified_at: emailVerifiedAt }],
        error: null,
      }),
    } as never);

    await expect(requireMfaPageIdentity()).rejects.toThrow("NEXT_FORBIDDEN");
  });

  test("denies a missing selected organization before permission evaluation", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });
    await expect(requireSelectedOrganizationPermission("portal.customer.access")).rejects.toThrow("NEXT_FORBIDDEN");
    expect(authorizePermission).not.toHaveBeenCalled();
  });

  test.each(["not-an-organization", "00000000-0000-0000-0000-000000000000"])(
    "denies a malformed or nil selected organization before permission evaluation: %s",
    async (value) => {
      vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value }),
      } as never);

      await expect(requireSelectedOrganizationPermission("portal.customer.access"))
        .rejects.toThrow("NEXT_FORBIDDEN");
      expect(authorizePermission).not.toHaveBeenCalled();
    },
  );

  test("validates selected organization access with distinct Auth and application IDs", async () => {
    const organizationId = "abcdef01-2345-4678-9abc-def012345678";
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: organizationId }),
    } as never);
    vi.mocked(authorizePermission).mockResolvedValue({
      identityId: validIdentityId,
      scope: { kind: "organization", organizationId },
    } as never);

    await expect(requireSelectedOrganizationPermission("portal.customer.access")).resolves.toMatchObject({
      authorization: { scope: { organizationId } },
    });
    expect(authorizePermission).toHaveBeenCalledWith("portal.customer.access", {
      kind: "organization",
      organizationId,
    });
  });

  test("denies a revoked or tampered selected organization", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "abcdef01-2345-4678-9abc-def012345678" }),
    } as never);
    vi.mocked(authorizePermission).mockResolvedValue(null);

    await expect(requireSelectedOrganizationPermission("portal.vendor.access")).rejects.toThrow("NEXT_FORBIDDEN");
  });

  test("uses platform access for an administrator without an organization cookie", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });
    vi.mocked(authorizePermission).mockResolvedValue({
      identityId: validIdentityId,
      scope: { kind: "platform" },
    } as never);

    await expect(requireHomeAccess()).resolves.toMatchObject({
      authorization: { scope: { kind: "platform" } },
    });
    expect(authorizePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  });

  test("uses selected workspace access without comparing distinct identity namespaces", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "provider-subject" });
    vi.mocked(cookies).mockResolvedValue({ get: vi.fn().mockReturnValue({ value: validIdentityId }) } as never);
    vi.mocked(authorizePermission).mockResolvedValue({
      identityId: "22222222-2222-4222-8222-222222222222",
      scope: { kind: "organization", organizationId: validIdentityId },
    } as never);
    await expect(requireHomeAccess()).resolves.toMatchObject({
      identity: { id: "provider-subject" }, authorization: { scope: { kind: "organization" } },
    });
    expect(authorizePermission).toHaveBeenCalledTimes(1);
  });

  test("accepts the real MFA identity response with a distinct application ID", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "provider-subject" });
    vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: [{
      id: validIdentityId, status: "active", normalized_email: "fixture@example.invalid",
      email_verified_at: "2026-09-05T12:00:00.000Z",
    }], error: null }) } as never);
    await expect(requireMfaPageIdentity()).resolves.toEqual({ id: "provider-subject" });
  });

  test("still denies a verified subject when the current permission decision is absent", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "provider-subject" });
    vi.mocked(authorizePermission).mockResolvedValue(null);
    await expect(requirePagePermission("admin.access", { kind: "platform" })).rejects.toThrow("NEXT_FORBIDDEN");
  });

  test("routes a caller without a selected workspace or platform access to workspace selection", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "provider-subject" });
    vi.mocked(authorizePermission).mockResolvedValue(null);
    await expect(requireHomeAccess()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/workspaces");
  });
});
