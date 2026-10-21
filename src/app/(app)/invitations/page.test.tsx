import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { authorizePermission, AuthorizationError } from "@/server/auth/authorization";
import { getOrganizationInvitations } from "@/server/commands/organization-invitation-read";
import InvitationsPage from "./page";

vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({ authorizePermission: vi.fn(), AuthorizationError: class extends Error {} }));
vi.mock("@/server/commands/organization-invitation-read", () => ({ getOrganizationInvitations: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));
vi.mock("./invitation-controls", () => ({ InvitationControls: (props: { canResend: boolean; canRevoke: boolean }) =>
  <div data-testid="controls">{JSON.stringify(props)}</div> }));
const organizationId = "22222222-2222-4222-8222-222222222222";
const invitationId = "11111111-1111-4111-8111-111111111111";
const supabase = {};
const row = { invitation_id: invitationId, organization_id: organizationId, invited_email: "invited@example.invalid",
  role_key: null, status: "pending" as const, created_at: "2026-09-05T12:00:00Z", expires_at: "2026-09-08T12:00:00Z" };
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue({ authorization: {
    scope: { kind: "organization", organizationId }, supabase,
  } } as never);
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(getOrganizationInvitations).mockReset().mockResolvedValue({ invitations: [row], nextCursor: null });
});
const page = (after?: string | string[]) => InvitationsPage({ searchParams: Promise.resolve({ after }) });

test("reads only the selected organization and renders redacted fields", async () => {
  render(await page());
  expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("org.members.view");
  expect(getOrganizationInvitations).toHaveBeenCalledWith({ organizationId, afterId: undefined, pageSize: 25 }, { supabase });
  expect(screen.getByText("Restricted")).toBeInTheDocument();
  expect(screen.queryByTestId("controls")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Invite a member" })).not.toBeInTheDocument();
});
test.each(["org.members.invite", "org.members.revoke"])("separates control permission %s", async (permission) => {
  vi.mocked(authorizePermission).mockImplementation(async (key) => key === permission ? {} as never : null);
  render(await page());
  expect(screen.getByTestId("controls")).toHaveTextContent(JSON.stringify({ organizationId, invitationId,
    canResend: permission === "org.members.invite", canRevoke: permission === "org.members.revoke" }));
});
test.each(["accepted", "expired", "revoked"] as const)("does not offer changes for %s rows", async (status) => {
  vi.mocked(authorizePermission).mockResolvedValue({} as never);
  vi.mocked(getOrganizationInvitations).mockResolvedValue({ invitations: [{ ...row, status }], nextCursor: null });
  render(await page());
  expect(screen.queryByTestId("controls")).not.toBeInTheDocument();
});
test("renders empty state and bounded page navigation", async () => {
  vi.mocked(getOrganizationInvitations).mockResolvedValueOnce({ invitations: [], nextCursor: null });
  render(await page());
  expect(screen.getByRole("status")).toHaveTextContent("no invitations");
  cleanup();
  vi.mocked(getOrganizationInvitations).mockResolvedValueOnce({ invitations: [row], nextCursor: invitationId });
  render(await page(invitationId));
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", `/invitations?after=${invitationId}`);
  expect(screen.getByRole("link", { name: "Return to first page" })).toHaveAttribute("href", "/invitations");
});
test.each(["bad", [invitationId, invitationId]])("rejects invalid cursor %# before reading", async (after) => {
  render(await page(after));
  expect(screen.getByRole("alert")).toHaveTextContent("invalid");
  expect(getOrganizationInvitations).not.toHaveBeenCalled();
});
test("hides read failure details and does not report an empty list", async () => {
  vi.mocked(getOrganizationInvitations).mockRejectedValue(new Error("private details"));
  render(await page());
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument();
});
test("honors permission loss between page guard and read", async () => {
  vi.mocked(getOrganizationInvitations).mockRejectedValue(new AuthorizationError());
  await expect(page()).rejects.toThrow("Forbidden");
});
test("denies entry before reading data", async () => {
  vi.mocked(requireSelectedOrganizationPermission).mockRejectedValue(new Error("Forbidden"));
  await expect(page()).rejects.toThrow("Forbidden");
  expect(getOrganizationInvitations).not.toHaveBeenCalled();
});
