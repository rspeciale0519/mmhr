import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorizationError } from "@/server/auth/authorization";
import {
  createStaffVendor, enableStaffVendorPortal, inviteStaffVendorAdmin, listStaffVendor, openStaffVendorWorkspace,
  StaffVendorError,
} from "@/server/commands/staff-vendors";
import {
  createVendorAction, enableVendorPortalAction, inviteVendorAdminAction, listVendorAction, openVendorWorkspaceAction,
} from "./actions";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  forbidden: () => { throw new Error("FORBIDDEN"); },
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("@/server/commands/staff-vendors", async (original) => ({
  ...(await original<typeof import("@/server/commands/staff-vendors")>()),
  createStaffVendor: vi.fn(), enableStaffVendorPortal: vi.fn(), inviteStaffVendorAdmin: vi.fn(),
  listStaffVendor: vi.fn(), openStaffVendorWorkspace: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const organizationId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const invitationId = "33333333-3333-4333-8333-333333333333";
const expiresAt = "2026-11-17T10:00:00.000000Z";
const set = vi.fn();
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
  vi.mocked(createStaffVendor).mockReset().mockResolvedValue({
    organizationId, profileId: invitationId, outcomeCode: "created", correlationId: idempotencyKey,
  });
  vi.mocked(enableStaffVendorPortal).mockReset().mockResolvedValue({
    organizationId, grantId: invitationId, outcomeCode: "enabled", correlationId: idempotencyKey,
  });
  vi.mocked(inviteStaffVendorAdmin).mockReset().mockResolvedValue({
    organizationId, invitationId, email: "admin@northwind.example", expiresAt, outcomeCode: "invited", correlationId: idempotencyKey,
  });
  vi.mocked(listStaffVendor).mockReset().mockResolvedValue({
    organizationId, activatedAt: expiresAt, outcomeCode: "listed", correlationId: idempotencyKey,
  });
  vi.mocked(openStaffVendorWorkspace).mockReset().mockResolvedValue({
    organizationId, grantId: invitationId, outcomeCode: "opened", correlationId: idempotencyKey,
  });
  vi.mocked(cookies).mockReset().mockResolvedValue({ set } as never);
  set.mockReset(); vi.mocked(redirect).mockClear();
  vi.mocked(revalidatePath).mockClear();
});
afterEach(() => vi.unstubAllEnvs());

test("adds a vendor with the form key and a fresh correlation ID, then refreshes the list", async () => {
  await expect(createVendorAction(null, form({ name: "Northwind Payroll", idempotencyKey })))
    .resolves.toMatchObject({ status: "success" });
  expect(createStaffVendor).toHaveBeenCalledExactlyOnceWith({
    name: "Northwind Payroll", idempotencyKey, correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(revalidatePath).toHaveBeenCalledWith("/admin/vendors");
});

test("keeps the typed name and explains a duplicate", async () => {
  vi.mocked(createStaffVendor).mockRejectedValue(new StaffVendorError("CONFLICT"));
  await expect(createVendorAction(null, form({ name: "Northwind", idempotencyKey }))).resolves.toEqual({
    status: "error", field: "name", value: "Northwind",
    message: "A vendor with this name already exists. Use the existing vendor in the list.",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("refuses an empty name without a database call", async () => {
  await expect(createVendorAction(null, form({ name: "  ", idempotencyKey }))).resolves.toMatchObject({ status: "error", field: "name" });
  expect(createStaffVendor).not.toHaveBeenCalled();
});

test("reports denial and uncertain results differently", async () => {
  vi.mocked(enableStaffVendorPortal).mockRejectedValueOnce(new AuthorizationError());
  await expect(enableVendorPortalAction(null, form({ organizationId, idempotencyKey })))
    .resolves.toMatchObject({ status: "error", message: expect.stringContaining("refused") });
  vi.mocked(enableStaffVendorPortal).mockRejectedValueOnce(new StaffVendorError("UNAVAILABLE"));
  await expect(enableVendorPortalAction(null, form({ organizationId, idempotencyKey })))
    .resolves.toMatchObject({ status: "error", message: expect.stringContaining("Submit the same form again") });
});

test.each([
  [{ organizationId: "bad", idempotencyKey }],
  [{ organizationId }],
  [{ organizationId, idempotencyKey: "00000000-0000-0000-0000-000000000000" }],
])("refuses invalid portal fields %j without a database call", async (values) => {
  await expect(enableVendorPortalAction(null, form(values))).resolves.toMatchObject({ status: "error" });
  expect(enableStaffVendorPortal).not.toHaveBeenCalled();
});

test("invites a vendor user and returns the next steps data", async () => {
  await expect(inviteVendorAdminAction(null, form({ organizationId, idempotencyKey, email: "Admin@Northwind.Example" })))
    .resolves.toEqual({ status: "success", message: "Invitation saved. No email was sent.", email: "admin@northwind.example", expiresAt });
  expect(inviteStaffVendorAdmin).toHaveBeenCalledWith({
    organizationId, idempotencyKey, email: "Admin@Northwind.Example", correlationId: expect.any(String),
  });
});

test("explains an invalid email and an existing member", async () => {
  vi.mocked(inviteStaffVendorAdmin).mockRejectedValueOnce(new StaffVendorError("INVALID_INPUT"));
  await expect(inviteVendorAdminAction(null, form({ organizationId, idempotencyKey, email: "nope" })))
    .resolves.toMatchObject({ status: "error", field: "email", value: "nope", message: expect.stringContaining("valid email") });
  vi.mocked(inviteStaffVendorAdmin).mockRejectedValueOnce(new StaffVendorError("CONFLICT"));
  await expect(inviteVendorAdminAction(null, form({ organizationId, idempotencyKey, email: "a@b.example" })))
    .resolves.toMatchObject({ message: "This person is already a member of this vendor." });
});

test("rejects a cross-site request", async () => {
  vi.mocked(headers).mockResolvedValue(new Headers({ origin: "https://evil.example" }) as never);
  await expect(createVendorAction(null, form({ name: "Northwind", idempotencyKey }))).rejects.toThrow();
  expect(createStaffVendor).not.toHaveBeenCalled();
});

test("lists a vendor with the typed reason and refreshes the list", async () => {
  await expect(listVendorAction(null, form({ organizationId, idempotencyKey, reason: "Checked the vendor site" })))
    .resolves.toMatchObject({ status: "success", message: expect.stringContaining("listed") });
  expect(listStaffVendor).toHaveBeenCalledExactlyOnceWith({
    organizationId, idempotencyKey, reason: "Checked the vendor site", correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(revalidatePath).toHaveBeenCalledWith("/admin/vendors");
});

test("explains a refused listing with the Super Admin and two-step sign-in rule", async () => {
  vi.mocked(listStaffVendor).mockRejectedValueOnce(new AuthorizationError());
  const state = await listVendorAction(null, form({ organizationId, idempotencyKey, reason: "Checked" }));
  expect(state).toMatchObject({ status: "error", field: "reason", value: "Checked" });
  expect(state?.message).toContain("Only a Super Admin can list a vendor");
  expect(state?.message).toContain("two-step sign-in");
  expect(state?.message).toContain("/mfa");
  expect(revalidatePath).not.toHaveBeenCalled();
});

test.each([
  [{ organizationId, idempotencyKey, reason: "   " }],
  [{ organizationId, idempotencyKey, reason: "x".repeat(501) }],
  [{ organizationId: "bad", idempotencyKey, reason: "Checked" }],
])("refuses invalid listing fields %# without a database call", async (values) => {
  await expect(listVendorAction(null, form(values))).resolves.toMatchObject({ status: "error", field: "reason" });
  expect(listStaffVendor).not.toHaveBeenCalled();
});

test("opens the vendor workspace, selects it, and shows vendor evidence", async () => {
  await expect(openVendorWorkspaceAction(form({ organizationId, idempotencyKey }))).rejects.toThrow("REDIRECT /admin/vendor-evidence");
  expect(openStaffVendorWorkspace).toHaveBeenCalledExactlyOnceWith({
    organizationId, idempotencyKey, correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(set).toHaveBeenCalledWith("mmhr-organization-id", organizationId, expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
});

test("a denied workspace returns to the vendor list without selecting it", async () => {
  vi.mocked(openStaffVendorWorkspace).mockRejectedValueOnce(new AuthorizationError());
  await expect(openVendorWorkspaceAction(form({ organizationId, idempotencyKey }))).rejects.toThrow("REDIRECT /admin/vendors?notice=denied");
  expect(set).not.toHaveBeenCalled();
  await expect(openVendorWorkspaceAction(form({ organizationId: "bad", idempotencyKey }))).rejects.toThrow("FORBIDDEN");
  vi.mocked(headers).mockResolvedValue(new Headers({ origin: "https://evil.example" }) as never);
  await expect(openVendorWorkspaceAction(form({ organizationId, idempotencyKey }))).rejects.toThrow();
  expect(openStaffVendorWorkspace).toHaveBeenCalledTimes(1);
});
