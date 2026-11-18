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
vi.mock("./actions", () => ({ createVendorAction: vi.fn(), enableVendorPortalAction: vi.fn(), inviteVendorAdminAction: vi.fn(),
  listVendorAction: vi.fn(), openVendorWorkspaceAction: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("forbidden"); } }));

const supabase = { rpc: vi.fn() };
const pending: StaffVendor = {
  organizationId: "22222222-2222-4222-8222-222222222222", name: "Northwind Payroll", status: "pending",
  profileStatus: "prospect", portalOn: false, activeMembers: 0, callerHasAccess: false,
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
  vi.mocked(getStaffVendorDirectory).mockReset().mockResolvedValue({ items: [pending, active, suspended], truncated: false, callerCanList: true });
});
afterEach(cleanup);

test("requires platform staff access and lists each vendor with its setup state", async () => {
  render(await VendorsPage());
  expect(requirePagePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  expect(getStaffVendorDirectory).toHaveBeenCalledWith({ supabase });
  const rows = within(screen.getByRole("list", { name: "Vendor organizations" })).getAllByRole("listitem")
    .filter((row) => row.parentElement?.getAttribute("aria-label") === "Vendor organizations");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("StatusNot listed");
  expect(rows[0]).toHaveTextContent("Vendor portalOff");
  expect(rows[0]).toHaveTextContent("Vendor usersNot joined");
  expect(within(rows[0]!).getAllByText("Not joined")).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("To do:Vendor listed for customer comparisons");
  expect(rows[0]).toHaveTextContent("To do:Vendor user invited, not joined yet");
  expect(rows[0]).toHaveTextContent("admin@northwind.example");
  expect(rows[0]).toHaveTextContent("Open /invitations/accept");
  expect(within(rows[0]!).getByRole("button", { name: "List Northwind Payroll" })).toBeInTheDocument();
  expect(within(rows[0]!).queryByRole("button", { name: /vendor workspace/ })).not.toBeInTheDocument();
  expect(within(rows[0]!).getByRole("button", { name: "Turn on vendor portal for Northwind Payroll" })).toBeInTheDocument();
  expect(rows[1]).toHaveTextContent("StatusListed");
  expect(rows[1]).toHaveTextContent("3 vendor users");
  expect(rows[1]).toHaveTextContent("Done:First vendor user joined");
  expect(within(rows[1]!).queryByText("Not joined")).not.toBeInTheDocument();
  expect(rows[1]).toHaveTextContent("expired. Invite the same email again");
  expect(within(rows[1]!).queryByRole("button", { name: /^List / })).not.toBeInTheDocument();
  expect(within(rows[1]!).getByRole("button", { name: "Open vendor workspace for Local Phase1 catalog · BambooHR" })).toBeInTheDocument();
  expect(within(rows[1]!).queryByRole("button", { name: /Turn on vendor portal/ })).not.toBeInTheDocument();
  expect(within(rows[1]!).getByRole("button", { name: "Invite vendor user for Local Phase1 catalog · BambooHR" })).toBeInTheDocument();
  expect(rows[2]).toHaveTextContent("Setup changes are unavailable here.");
  expect(within(rows[2]!).queryByRole("button")).not.toBeInTheDocument();
});

test("a listed vendor with no vendor users shows Not joined and the caller's workspace access", async () => {
  vi.mocked(getStaffVendorDirectory).mockResolvedValue({ items: [{ ...active, activeMembers: 0, callerHasAccess: true }],
    truncated: false, callerCanList: true });
  render(await VendorsPage());
  const row = screen.getByRole("heading", { name: "Local Phase1 catalog · BambooHR" }).closest("li")!;
  expect(row).toHaveTextContent("Vendor usersNot joined");
  expect(within(row).getByRole("button", { name: "Continue in vendor workspace for Local Phase1 catalog · BambooHR" }))
    .toBeInTheDocument();
  expect(row).toHaveTextContent("You have access to this vendor workspace.");
});

test("staff who cannot list see why, and a denied workspace shows a notice", async () => {
  vi.mocked(getStaffVendorDirectory).mockResolvedValue({ items: [pending], truncated: false, callerCanList: false });
  render(await VendorsPage({ searchParams: Promise.resolve({ notice: "denied" }) }));
  expect(screen.queryByRole("button", { name: "List Northwind Payroll" })).not.toBeInTheDocument();
  expect(screen.getByText("Only a Super Admin can list this vendor.")).toBeInTheDocument();
  expect(screen.getByText(/^The vendor workspace could not be opened./)).toHaveAttribute("role", "alert");
});

test("every input has a visible label and each form posts a fresh key", async () => {
  const { container } = render(await VendorsPage());
  expect(screen.getByLabelText("Vendor name")).toHaveAttribute("name", "name");
  expect(screen.getAllByLabelText("Email of the vendor administrator")).toHaveLength(2);
  expect(screen.getByLabelText("Reason for listing")).toHaveAttribute("name", "reason");
  const keys = [...container.querySelectorAll<HTMLInputElement>("input[name=idempotencyKey]")].map((input) => input.value);
  expect(keys).toHaveLength(6);
  expect(new Set(keys).size).toBe(6);
  const portalForm = screen.getByRole("button", { name: /Turn on vendor portal/ }).closest("form")!;
  expect([...portalForm.querySelectorAll("input")].map((input) => input.name)).toEqual(["organizationId", "idempotencyKey"]);
  const workspaceForm = screen.getByRole("button", { name: /Open vendor workspace/ }).closest("form")!;
  expect([...workspaceForm.querySelectorAll("input")].map((input) => input.name)).toEqual(["organizationId", "idempotencyKey"]);
});

test("shows an empty state", async () => {
  vi.mocked(getStaffVendorDirectory).mockResolvedValue({ items: [], truncated: false, callerCanList: true });
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
