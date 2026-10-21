import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import NewInvitationPage from "./page";

vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("Forbidden"); } }));
vi.mock("./invitation-create-form", () => ({ InvitationCreateForm: ({ organizationId }: { organizationId: string }) =>
  <form aria-label={`Invitation for ${organizationId}`} /> }));
const organizationId = "22222222-2222-4222-8222-222222222222";
afterEach(cleanup);

beforeEach(() => {
  vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue({
    authorization: { scope: { kind: "organization", organizationId } },
  } as never);
});

test("renders only after checking invitation permission for the selected organization", async () => {
  const page = await NewInvitationPage();
  expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("org.members.invite");
  render(page);
  expect(screen.getByRole("form", { name: `Invitation for ${organizationId}` })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Invite a member" })).toBeInTheDocument();
});

test("propagates permission denial without rendering the form", async () => {
  vi.mocked(requireSelectedOrganizationPermission).mockRejectedValue(new Error("Forbidden"));
  await expect(NewInvitationPage()).rejects.toThrow("Forbidden");
});

test("rejects an unexpected platform scope", async () => {
  vi.mocked(requireSelectedOrganizationPermission).mockResolvedValue({
    authorization: { scope: { kind: "platform" } },
  } as never);
  await expect(NewInvitationPage()).rejects.toThrow("Forbidden");
});
