import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requirePageIdentity } from "@/server/auth/page-guards";
import WorkspacesPage from "./page";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ requirePageIdentity: vi.fn() }));
vi.mock("./actions", () => ({ selectOrganizationAction: vi.fn() }));
const rpc = vi.fn();
const membership = { organization_id: "11111111-1111-4111-8111-111111111111", organization_name: "Example team",
  organization_type: "customer", organization_status: "active", role_key: "viewer" };
beforeEach(() => {
  vi.mocked(requirePageIdentity).mockReset().mockResolvedValue({ id: "provider-subject" });
  vi.mocked(createClient).mockReset().mockResolvedValue({ rpc } as never);
  rpc.mockReset().mockResolvedValue({ data: [membership], error: null });
});
afterEach(cleanup);

test("renders caller-scoped workspaces and submits only the selected organization", async () => {
  const { container } = render(await WorkspacesPage());
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_my_memberships");
  expect(screen.getByRole("heading", { name: "Example team" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Example team" })).toBeInTheDocument();
  expect(container.querySelector('input[name="organizationId"]')).toHaveValue(membership.organization_id);
  expect(container.querySelector('input[name="identityId"]')).toBeNull();
});

test("preserves field redaction instead of inventing a name or role", async () => {
  rpc.mockResolvedValue({ data: [{ ...membership, organization_name: null, role_key: null }], error: null });
  render(await WorkspacesPage());
  expect(screen.getByRole("heading", { name: "Organization name restricted" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Open ${membership.organization_id}` })).toBeInTheDocument();
});

test("directs callers with no workspaces to their invitations", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  render(await WorkspacesPage());
  expect(screen.getByRole("status")).toHaveTextContent("No workspaces are available");
  expect(screen.getByRole("link", { name: "Review pending invitations" })).toHaveAttribute("href", "/invitations/accept");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test.each([
  { data: [membership], error: new Error("private provider detail") },
  { data: [{ ...membership, organization_status: "suspended" }], error: null },
  { data: [{ ...membership, organization_id: "invalid" }], error: null },
  { data: [membership, membership], error: null },
])("shows no organization rows when the read fails validation: %j", async (response) => {
  rpc.mockResolvedValue(response); render(await WorkspacesPage());
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText(/private provider detail/)).not.toBeInTheDocument();
});

test("denies anonymous access before reading organization data", async () => {
  vi.mocked(requirePageIdentity).mockRejectedValue(new Error("Sign in required"));
  await expect(WorkspacesPage()).rejects.toThrow("Sign in required");
  expect(createClient).not.toHaveBeenCalled();
});
