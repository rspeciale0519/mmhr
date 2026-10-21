import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { signInWithAgentId } from "./agentid-actions";
vi.mock("./agentid-actions", () => ({ signInWithAgentId: vi.fn() }));
import { AgentIdButton } from "./agentid-button";
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
test("keeps unconfigured sign-in disabled", () => {
  render(<AgentIdButton enabled={false} />);
  expect(screen.getByRole("button", { name: "Sign in with AgentID" })).toBeDisabled();
  expect(screen.getByText("AgentID sign-in is not available yet.")).toBeVisible();
  fireEvent.click(screen.getByRole("button"));
  expect(signInWithAgentId).not.toHaveBeenCalled();
});
test("renders the provider failure as an accessible alert", async () => {
  vi.mocked(signInWithAgentId).mockResolvedValue({ error: "We could not sign you in with AgentID. Please try again." });
  render(<AgentIdButton enabled />);
  fireEvent.click(screen.getByRole("button", { name: "Sign in with AgentID" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We could not sign you in"));
});
