import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import WorkspaceHome from "@/app/(app)/home/page";
import { requireHomeAccess } from "@/server/auth/page-guards";
import { authorizePermission } from "@/server/auth/authorization";

vi.mock("@/server/auth/authorization", () => ({ authorizePermission: vi.fn() }));
afterEach(cleanup);

vi.mock("@/server/auth/page-guards", () => ({
  requireHomeAccess: vi.fn(),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOut: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(requireHomeAccess).mockReset();
  vi.mocked(requireHomeAccess).mockResolvedValue({
    identity: { id: "user-123" },
    authorization: {
      scope: { kind: "organization", organizationId: "00000000-0000-4000-8000-000000000000" },
    },
  } as never);
});

test("returns workspace content after permission verification", async () => {
  render(await WorkspaceHome());

  expect(requireHomeAccess).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("heading", { name: "Workspace" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Customer portal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Vendor portal" })).not.toBeInTheDocument();
  // Owner decision D2 hides private document storage at launch.
  expect(screen.queryByRole("link", { name: "Workspace documents" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("signed-in-email")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Invite a member" })).not.toBeInTheDocument();
});

test("shows invitation navigation only with current invitation permission", async () => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permission === "org.members.invite" ? { identityId: "user-123" } as never : null);
  render(await WorkspaceHome());
  expect(authorizePermission).toHaveBeenCalledWith("org.members.invite", {
    kind: "organization", organizationId: "00000000-0000-4000-8000-000000000000",
  });
  expect(screen.getByRole("link", { name: "Invite a member" })).toHaveAttribute("href", "/invitations/new");
  expect(screen.queryByRole("link", { name: "Customer portal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Vendor portal" })).not.toBeInTheDocument();
});

test.each([
  ["portal.customer.access", "Customer portal", "/customer", "Vendor portal"],
  ["portal.vendor.access", "Vendor portal", "/vendor", "Customer portal"],
] as const)("shows only the portal allowed by %s", async (allowed, label, href, deniedLabel) => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permission === allowed ? { identityId: "user-123" } as never : null);
  render(await WorkspaceHome());
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  expect(screen.queryByRole("link", { name: deniedLabel })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Invite a member" })).not.toBeInTheDocument();
  expect(authorizePermission).toHaveBeenCalledWith(allowed, {
    kind: "organization", organizationId: "00000000-0000-4000-8000-000000000000",
  });
});

test("shows invitation administration separately from creation", async () => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permission === "org.members.view" ? {} as never : null);
  render(await WorkspaceHome());
  expect(screen.getByRole("link", { name: "Manage invitations" })).toHaveAttribute("href", "/invitations");
  expect(screen.getByRole("link", { name: "Manage members" })).toHaveAttribute("href", "/members");
  expect(screen.queryByRole("link", { name: "Invite a member" })).not.toBeInTheDocument();
});

test("shows staff administration when a customer workspace is selected", async () => {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permission === "admin.access" ? {} as never : null);
  render(await WorkspaceHome());
  expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
  expect(screen.queryByRole("link", { name: "Customer portal" })).not.toBeInTheDocument();
});

test("keeps platform navigation separate from organization permissions", async () => {
  vi.mocked(requireHomeAccess).mockResolvedValue({
    identity: { id: "user-123" }, authorization: { scope: { kind: "platform" } },
  } as never);
  render(await WorkspaceHome());
  expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
  expect(authorizePermission).not.toHaveBeenCalled();
  expect(screen.queryByRole("navigation", { name: "Workspace areas" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Workspace documents" })).not.toBeInTheDocument();
});

test("does not return navigation when a permission read fails", async () => {
  vi.mocked(authorizePermission).mockRejectedValue(new Error("Permission service unavailable"));
  await expect(WorkspaceHome()).rejects.toThrow("Permission service unavailable");
});

test("requires home access before resolving navigation", async () => {
  vi.mocked(requireHomeAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(WorkspaceHome()).rejects.toThrow("NEXT_REDIRECT");
  expect(authorizePermission).not.toHaveBeenCalled();
});
