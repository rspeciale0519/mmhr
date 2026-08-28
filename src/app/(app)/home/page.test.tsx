import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import WorkspaceHome from "@/app/(app)/home/page";
import { requirePageIdentity } from "@/server/auth/page-guards";

vi.mock("@/server/auth/page-guards", () => ({
  requirePageIdentity: vi.fn(),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOut: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(requirePageIdentity).mockReset();
  vi.mocked(requirePageIdentity).mockResolvedValue({ id: "user-123" });
});

test("returns only pending-access content after identity verification", async () => {
  render(await WorkspaceHome());

  expect(requirePageIdentity).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("heading", { name: "Access pending" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
  expect(screen.queryByTestId("signed-in-email")).not.toBeInTheDocument();
});
