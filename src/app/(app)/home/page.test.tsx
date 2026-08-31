import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import WorkspaceHome from "@/app/(app)/home/page";
import { requireHomeAccess } from "@/server/auth/page-guards";

vi.mock("@/server/auth/page-guards", () => ({
  requireHomeAccess: vi.fn(),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOut: vi.fn(),
}));

beforeEach(() => {
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
  expect(screen.getByRole("link", { name: "Customer portal" })).toHaveAttribute("href", "/customer");
  expect(screen.queryByTestId("signed-in-email")).not.toBeInTheDocument();
});
