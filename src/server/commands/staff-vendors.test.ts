import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import {
  createStaffVendor, enableStaffVendorPortal, getStaffVendorDirectory, inviteStaffVendorAdmin, listStaffVendor,
  openStaffVendorWorkspace, StaffVendorError,
} from "./staff-vendors";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/authorization", async (original) => ({
  ...(await original<typeof import("@/server/auth/authorization")>()), requirePermission: vi.fn(),
}));

const organizationId = "22222222-2222-4222-8222-222222222222";
const correlationId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const invitationId = "77777777-7777-4777-8777-777777777777";
const expiresAt = "2026-11-17T10:00:00.000000Z";
const rpc = vi.fn();
const vendor = {
  organizationId, name: "Northwind Payroll", status: "pending", profileStatus: "prospect", portalOn: false,
  activeMembers: 0, callerHasAccess: false,
  pendingInvitations: [{ invitationId, email: "admin@northwind.example", expiresAt, expired: false }],
};

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requirePermission).mockReset().mockResolvedValue({
    supabase: { rpc }, identityId: "66666666-6666-4666-8666-666666666666",
    scope: { kind: "platform" }, assurance: "aal2", correlationId,
  } as never);
});

describe("staff vendor directory", () => {
  test("requires platform staff access and returns the checked list", async () => {
    rpc.mockResolvedValue({ data: { version: 1, items: [vendor], truncated: false, callerCanList: true }, error: null });
    await expect(getStaffVendorDirectory()).resolves.toEqual({ items: [vendor], truncated: false, callerCanList: true });
    expect(requirePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" }, {});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_staff_vendor_directory", { payload: {} });
  });

  test("denies AAL1 staff and organization scope before any database call", async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce({ supabase: { rpc }, scope: { kind: "platform" }, assurance: "aal1" } as never);
    await expect(getStaffVendorDirectory()).rejects.toBeInstanceOf(AuthorizationError);
    vi.mocked(requirePermission).mockResolvedValueOnce({
      supabase: { rpc }, scope: { kind: "organization", organizationId }, assurance: "aal2",
    } as never);
    await expect(getStaffVendorDirectory()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    [{ ...vendor, extra: true }], [{ ...vendor, status: "archived" }],
    [{ ...vendor, pendingInvitations: [{ invitationId, email: "a@b.c", expiresAt: "tomorrow", expired: false }] }],
  ])("rejects an unexpected row %#", async (row) => {
    rpc.mockResolvedValue({ data: { version: 1, items: [row], truncated: false, callerCanList: false }, error: null });
    await expect(getStaffVendorDirectory()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([
    ["42501", AuthorizationError], ["22023", StaffVendorError], ["XX000", StaffVendorError],
  ] as const)("maps database error %s", async (code, type) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    await expect(getStaffVendorDirectory()).rejects.toBeInstanceOf(type);
  });
});

describe("add vendor", () => {
  test("sends only the trimmed name with the command keys", async () => {
    rpc.mockResolvedValue({ data: { organizationId, profileId: invitationId, outcomeCode: "created", correlationId }, error: null });
    await expect(createStaffVendor({ name: "  Northwind Payroll ", correlationId, idempotencyKey }))
      .resolves.toMatchObject({ outcomeCode: "created", organizationId });
    expect(requirePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" }, { correlationId });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_create_staff_vendor", {
      payload: { name: "Northwind Payroll" }, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });

  test.each([[""], ["   "], ["x".repeat(201)], ["Bad\u0007name"]])("rejects the name %j before authorization", async (name) => {
    await expect(createStaffVendor({ name, correlationId, idempotencyKey })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("maps a duplicate name to a conflict", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    await expect(createStaffVendor({ name: "Northwind", correlationId, idempotencyKey })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("vendor portal", () => {
  test("enables the portal for one organization and checks the binding", async () => {
    rpc.mockResolvedValue({ data: { organizationId, grantId: invitationId, outcomeCode: "existing", correlationId }, error: null });
    await expect(enableStaffVendorPortal({ organizationId: organizationId.toUpperCase(), correlationId, idempotencyKey }))
      .resolves.toMatchObject({ outcomeCode: "existing" });
    expect(rpc).toHaveBeenCalledWith("mmhr_enable_staff_vendor_portal", {
      payload: { organizationId }, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    rpc.mockResolvedValue({ data: { organizationId: invitationId, grantId: invitationId, outcomeCode: "enabled", correlationId }, error: null });
    await expect(enableStaffVendorPortal({ organizationId, correlationId, idempotencyKey })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("vendor invitation", () => {
  test("normalizes the email and returns the checked invitation", async () => {
    rpc.mockResolvedValue({ data: { organizationId, invitationId, email: "admin@northwind.example", expiresAt,
      outcomeCode: "invited", correlationId }, error: null });
    await expect(inviteStaffVendorAdmin({ organizationId, email: " Admin@Northwind.Example ", correlationId, idempotencyKey }))
      .resolves.toMatchObject({ invitationId, outcomeCode: "invited" });
    expect(rpc).toHaveBeenCalledWith("mmhr_invite_staff_vendor_admin", {
      payload: { organizationId, email: "admin@northwind.example" }, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });

  test("rejects a response for another email", async () => {
    rpc.mockResolvedValue({ data: { organizationId, invitationId, email: "other@northwind.example", expiresAt,
      outcomeCode: "invited", correlationId }, error: null });
    await expect(inviteStaffVendorAdmin({ organizationId, email: "admin@northwind.example", correlationId, idempotencyKey }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([["not-an-email"], ["a@b"], [""]])("rejects %j before authorization", async (email) => {
    await expect(inviteStaffVendorAdmin({ organizationId, email, correlationId, idempotencyKey })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("denies callers without staff access", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(inviteStaffVendorAdmin({ organizationId, email: "admin@northwind.example", correlationId, idempotencyKey }))
      .rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("list vendor", () => {
  const activatedAt = "2026-11-16T10:00:00.000000Z";

  test("sends the trimmed reason and checks the binding", async () => {
    rpc.mockResolvedValue({ data: { organizationId, activatedAt, outcomeCode: "listed", correlationId }, error: null });
    await expect(listStaffVendor({ organizationId, reason: "  Checked the public vendor site ", correlationId, idempotencyKey }))
      .resolves.toMatchObject({ outcomeCode: "listed", activatedAt });
    expect(requirePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" }, { correlationId });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_list_staff_vendor", {
      payload: { organizationId, reason: "Checked the public vendor site" }, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    rpc.mockResolvedValue({ data: { organizationId: invitationId, activatedAt, outcomeCode: "listed", correlationId }, error: null });
    await expect(listStaffVendor({ organizationId, reason: "Checked", correlationId, idempotencyKey }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([[""], ["   "], ["x".repeat(501)], ["Bad\u0007reason"]])("rejects the reason %j before authorization", async (reason) => {
    await expect(listStaffVendor({ organizationId, reason, correlationId, idempotencyKey })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("maps a refusal to an authorization error and rejects AAL1 staff before any call", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(listStaffVendor({ organizationId, reason: "Checked", correlationId, idempotencyKey })).rejects.toBeInstanceOf(AuthorizationError);
    rpc.mockReset();
    vi.mocked(requirePermission).mockResolvedValueOnce({ supabase: { rpc }, scope: { kind: "platform" }, assurance: "aal1" } as never);
    await expect(listStaffVendor({ organizationId, reason: "Checked", correlationId, idempotencyKey })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("open vendor workspace", () => {
  test("opens one vendor workspace and accepts an existing grant without an id", async () => {
    rpc.mockResolvedValue({ data: { organizationId, grantId: invitationId, outcomeCode: "opened", correlationId }, error: null });
    await expect(openStaffVendorWorkspace({ organizationId, correlationId, idempotencyKey })).resolves.toMatchObject({ outcomeCode: "opened" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_open_staff_vendor_workspace", {
      payload: { organizationId }, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    rpc.mockResolvedValue({ data: { organizationId, grantId: null, outcomeCode: "existing", correlationId }, error: null });
    await expect(openStaffVendorWorkspace({ organizationId, correlationId, idempotencyKey })).resolves.toMatchObject({ grantId: null });
  });

  test("rejects another organization in the response and bad input", async () => {
    rpc.mockResolvedValue({ data: { organizationId: invitationId, grantId: null, outcomeCode: "opened", correlationId }, error: null });
    await expect(openStaffVendorWorkspace({ organizationId, correlationId, idempotencyKey })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(openStaffVendorWorkspace({ organizationId: "not-a-uuid", correlationId, idempotencyKey }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
