import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AuthorizationError } from "@/server/auth/authorization";
import {
  createStaffVendor, enableStaffVendorPortal, inviteStaffVendorAdmin, StaffVendorError,
} from "@/server/commands/staff-vendors";
import { createVendorAction, enableVendorPortalAction, inviteVendorAdminAction } from "./actions";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("FORBIDDEN"); } }));
vi.mock("@/server/commands/staff-vendors", async (original) => ({
  ...(await original<typeof import("@/server/commands/staff-vendors")>()),
  createStaffVendor: vi.fn(), enableStaffVendorPortal: vi.fn(), inviteStaffVendorAdmin: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const organizationId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const invitationId = "33333333-3333-4333-8333-333333333333";
const expiresAt = "2026-11-17T10:00:00.000000Z";
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
