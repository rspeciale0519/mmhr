import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { authorizePermission, AuthorizationError } from "@/server/auth/authorization";
import { getOrganizationMembers } from "@/server/commands/organization-member-read";
import MembersPage from "./page";

vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({ authorizePermission: vi.fn(), AuthorizationError: class extends Error {} }));
vi.mock("@/server/commands/organization-member-read", () => ({ getOrganizationMembers: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));
vi.mock("./member-controls", () => ({ MemberControls: (props: unknown) => <div data-testid="controls">{JSON.stringify(props)}</div> }));
const organizationId = "22222222-2222-4222-8222-222222222222";
const membershipId = "11111111-1111-4111-8111-111111111111";
const identityId = "33333333-3333-4333-8333-333333333333";
const supabase = {};
const row = { membership_id: membershipId, organization_id: organizationId, identity_id: identityId,
  role_key: "viewer" as const, status: "active" as const };
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue({ authorization: {
    scope: { kind: "organization", organizationId }, identityId: organizationId, supabase,
  } } as never);
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(getOrganizationMembers).mockReset().mockResolvedValue({ members: [row], nextCursor: null });
});
const page = (after?: string | string[]) => MembersPage({ searchParams: Promise.resolve({ after }) });
test("uses the selected organization and renders only allowed member data", async () => {
  render(await page());
  expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("org.members.view");
  expect(getOrganizationMembers).toHaveBeenCalledWith({ organizationId, afterId: undefined, pageSize: 25 }, { supabase });
  expect(screen.getByText(identityId)).toBeInTheDocument();
  expect(screen.getByText("Viewer")).toBeInTheDocument();
  expect(screen.getByTestId("controls")).toHaveTextContent('"canChangeRole":false');
});
test("requires both role action and field update access", async () => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) => permission === "org.members.change_role" ? {} as never : null);
  render(await page()); expect(screen.getByTestId("controls")).toHaveTextContent('"canChangeRole":false'); cleanup();
  vi.mocked(authorizePermission).mockResolvedValue({} as never);
  render(await page()); expect(screen.getByTestId("controls")).toHaveTextContent('"canChangeRole":true');
});
test("redacts hidden roles and disables their change controls", async () => {
  vi.mocked(authorizePermission).mockResolvedValue({} as never);
  vi.mocked(getOrganizationMembers).mockResolvedValue({ members: [{ ...row, role_key: null }], nextCursor: null });
  render(await page()); expect(screen.getByText("Restricted")).toBeInTheDocument();
  expect(screen.getByTestId("controls")).toHaveTextContent('"canChangeRole":false');
});
test("requires restoration before a suspended membership can change role", async () => {
  vi.mocked(authorizePermission).mockResolvedValue({} as never);
  vi.mocked(getOrganizationMembers).mockResolvedValue({ members: [{ ...row, status: "suspended" }], nextCursor: null });
  render(await page());
  expect(screen.getByTestId("controls")).toHaveTextContent('"canChangeRole":false');
  expect(screen.getByTestId("controls")).toHaveTextContent('"canChangeStatus":true');
});
test.each(["org.members.status.change", "org.members.revoke"])("separates %s controls", async (permission) => {
  vi.mocked(authorizePermission).mockImplementation(async (key) => key === permission ? {} as never : null);
  render(await page());
  expect(screen.getByTestId("controls")).toHaveTextContent(`"canChangeStatus":${permission === "org.members.status.change"}`);
  expect(screen.getByTestId("controls")).toHaveTextContent(`"canRevoke":${permission === "org.members.revoke"}`);
});
test("identifies self by application identity and removes self-change controls", async () => {
  vi.mocked(requireSelectedOrganizationPermission).mockResolvedValue({ authorization: {
    scope: { kind: "organization", organizationId }, identityId, supabase,
  } } as never);
  render(await page()); expect(screen.getByText("Member reference · You")).toBeInTheDocument();
  expect(screen.queryByTestId("controls")).not.toBeInTheDocument();
});
test("renders empty state and cursor navigation", async () => {
  vi.mocked(getOrganizationMembers).mockResolvedValueOnce({ members: [], nextCursor: null });
  render(await page()); expect(screen.getByRole("status")).toHaveTextContent("No reviewed members"); cleanup();
  vi.mocked(getOrganizationMembers).mockResolvedValueOnce({ members: [row], nextCursor: membershipId });
  render(await page(membershipId));
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", `/members?after=${membershipId}`);
  expect(screen.getByRole("link", { name: "Return to first page" })).toBeInTheDocument();
});
test.each(["bad", [membershipId, membershipId]])("rejects invalid cursors %#", async (after) => {
  render(await page(after)); expect(screen.getByRole("alert")).toHaveTextContent("invalid");
  expect(getOrganizationMembers).not.toHaveBeenCalled();
});
test("hides read errors instead of showing an empty list", async () => {
  vi.mocked(getOrganizationMembers).mockRejectedValue(new Error("private detail"));
  render(await page()); expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.queryByText(/private detail/)).not.toBeInTheDocument();
});
test("denies entry and permission loss before rendering members", async () => {
  vi.mocked(requireSelectedOrganizationPermission).mockRejectedValueOnce(new Error("Forbidden"));
  await expect(page()).rejects.toThrow("Forbidden"); expect(getOrganizationMembers).not.toHaveBeenCalled();
  vi.mocked(getOrganizationMembers).mockRejectedValue(new AuthorizationError());
  await expect(page()).rejects.toThrow("Forbidden");
});
