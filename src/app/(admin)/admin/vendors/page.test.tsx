import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import VendorsPage from "./page";
import VendorsLoading from "./loading";
import VendorsError from "./error";
import { requirePagePermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getStaffVendorDirectory, type StaffVendor } from "@/server/commands/staff-vendors";

vi.mock("@/server/auth/page-guards", () => ({ requirePagePermission: vi.fn() }));
vi.mock("@/server/commands/staff-vendors", () => ({ getStaffVendorDirectory: vi.fn() }));
vi.mock("./actions", () => ({ createVendorAction: vi.fn(), enableVendorPortalAction: vi.fn(), inviteVendorAdminAction: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("forbidden"); } }));

const supabase = { rpc: vi.fn() };
const pending: StaffVendor = {
  organizationId: "22222222-2222-4222-8222-222222222222", name: "Northwind Payroll", status: "pending",
  profileStatus: "prospect", portalOn: false, activeMembers: 0,
  pendingInvitations: [{ invitationId: "33333333-3333-4333-8333-333333333333", email: "admin@northwind.example",
    expiresAt: "2026-11-17T10:00:00.000000Z", expired: false }],
};
const active: StaffVendor = {
  ...pending, organizationId: "44444444-4444-4444-8444-444444444444", name: "Local Phase1 catalog · BambooHR",
  status: "active", profileStatus: "active", portalOn: true, activeMembers: 3,
  pendingInvitations: [{ invitationId: "55555555-5555-4555-8555-555555555555", email: "old@bamboo.example",
    expiresAt: "2026-11-01T10:00:00.000000Z", expired: true }],
};
const suspended: StaffVendor = { ...active, organizationId: "66666666-6666-4666-8666-666666666666", name: "Paused vendor",
  status: "suspended", pendingInvitations: [] };

beforeEach(() => {
  vi.mocked(requirePagePermission).mockReset().mockResolvedValue({ identity: {}, authorization: { supabase } } as never);
  vi.mocked(getStaffVendorDirectory).mockReset().mockResolvedValue({ items: [pending, active, suspended], truncated: false });
});
afterEach(cleanup);

test("requires platform staff access and lists each vendor with its setup state", async () => {
  render(await VendorsPage());
  expect(requirePagePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  expect(getStaffVendorDirectory).toHaveBeenCalledWith({ supabase });
  const rows = within(screen.getByRole("list", { name: "Vendor organizations" })).getAllByRole("listitem")
    .filter((row) => row.parentElement?.getAttribute("aria-label") === "Vendor organizations");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Waiting for its first administrator");
  expect(rows[0]).toHaveTextContent("Vendor portalOff");
  expect(rows[0]).toHaveTextContent("No active members");
  expect(rows[0]).toHaveTextContent("To do:First administrator invited, not accepted yet");
  expect(rows[0]).toHaveTextContent("admin@northwind.example");
  expect(rows[0]).toHaveTextContent("Open /invitations/accept");
  expect(within(rows[0]!).getByRole("button", { name: "Turn on vendor portal for Northwind Payroll" })).toBeInTheDocument();
  expect(rows[1]).toHaveTextContent("3 active members");
  expect(rows[1]).toHaveTextContent("expired. Invite the same email again");
  expect(within(rows[1]!).queryByRole("button", { name: /Turn on vendor portal/ })).not.toBeInTheDocument();
  expect(within(rows[1]!).getByRole("button", { name: "Invite vendor user for Local Phase1 catalog · BambooHR" })).toBeInTheDocument();
  expect(rows[2]).toHaveTextContent("Setup changes are unavailable here.");
  expect(within(rows[2]!).queryByRole("button")).not.toBeInTheDocument();
});

test("every input has a visible label and each form posts a fresh key", async () => {
  const { container } = render(await VendorsPage());
  expect(screen.getByLabelText("Vendor name")).toHaveAttribute("name", "name");
  expect(screen.getAllByLabelText("Email of the vendor administrator")).toHaveLength(2);
  const keys = [...container.querySelectorAll<HTMLInputElement>("input[name=idempotencyKey]")].map((input) => input.value);
  expect(keys).toHaveLength(4);
  expect(new Set(keys).size).toBe(4);
  const portalForm = screen.getByRole("button", { name: /Turn on vendor portal/ }).closest("form")!;
  expect([...portalForm.querySelectorAll("input")].map((input) => input.name)).toEqual(["organizationId", "idempotencyKey"]);
});

test("shows an empty state", async () => {
  vi.mocked(getStaffVendorDirectory).mockResolvedValue({ items: [], truncated: false });
  render(await VendorsPage());
  expect(screen.getByText(/^No vendors yet./)).toHaveAttribute("role", "status");
});

test("hides the page from callers without staff access", async () => {
  vi.mocked(getStaffVendorDirectory).mockRejectedValue(new AuthorizationError());
  await expect(VendorsPage()).rejects.toThrow("forbidden");
});

test("renders loading and retry states", () => {
  render(<VendorsLoading/>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading vendor organizations.");
  cleanup();
  const retry = vi.fn();
  render(<VendorsError retry={retry}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("check the list before you repeat it");
  fireEvent.click(screen.getByRole("button", { name: "Reload vendors" }));
  expect(retry).toHaveBeenCalledOnce();
});
