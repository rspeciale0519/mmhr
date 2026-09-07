import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemberControls } from "./member-controls";
const { role, state, revoke, refresh } = vi.hoisted(() => ({ role: vi.fn(), state: vi.fn(), revoke: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ memberships: {
  changeRole: { mutationOptions: () => ({ mutationFn: role }) }, changeStatus: { mutationOptions: () => ({ mutationFn: state }) },
  revoke: { mutationOptions: () => ({ mutationFn: revoke }) },
} }) }));
const organizationId = "22222222-2222-4222-8222-222222222222";
const membershipId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { role.mockReset(); state.mockReset(); revoke.mockReset(); refresh.mockReset(); });
afterEach(cleanup);
function setup(overrides: Partial<React.ComponentProps<typeof MemberControls>> = {}) {
  render(<QueryClientProvider client={new QueryClient()}><MemberControls organizationId={organizationId} membershipId={membershipId}
    roleKey="viewer" status="active" canChangeRole canChangeStatus canRevoke {...overrides} /></QueryClientProvider>);
}
function prepare(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.change(screen.getByLabelText("Reason for change"), { target: { value: "Access review complete" } });
}
function submit(label: string) { fireEvent.submit(screen.getByRole("form", { name: label })); }
test.each([
  ["Suspend membership", "active", "suspended"], ["Restore membership", "suspended", "active"],
] as const)("confirms %s with exact scoped input", async (label, status, expected) => {
  state.mockResolvedValue({}); setup({ status }); prepare(label); expect(state).not.toHaveBeenCalled(); submit(label);
  await screen.findByRole("status");
  expect(state.mock.calls[0]![0]).toEqual({ organizationId, membershipId, reason: "Access review complete",
    idempotencyKey: expect.any(String), status: expected });
  fireEvent.click(screen.getByRole("button", { name: "Refresh members" })); expect(refresh).toHaveBeenCalledOnce();
});
test("changes only an organization role after selection", async () => {
  role.mockResolvedValue({}); setup(); prepare("Change role");
  expect(screen.getByRole("button", { name: "Confirm: change role" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("New organization role"), { target: { value: "contributor" } });
  submit("Change role"); await screen.findByRole("status");
  expect(role.mock.calls[0]![0]).toMatchObject({ organizationId, membershipId, roleKey: "contributor" });
  expect(screen.queryByRole("option", { name: "Super Admin" })).not.toBeInTheDocument();
});
test("uses the separate revocation endpoint without a status field", async () => {
  revoke.mockResolvedValue({}); setup(); prepare("Revoke membership"); submit("Revoke membership");
  await screen.findByRole("status"); expect(revoke.mock.calls[0]![0]).toEqual({ organizationId, membershipId,
    reason: "Access review complete", idempotencyKey: expect.any(String) }); expect(state).not.toHaveBeenCalled();
});
test("retains the key on unchanged retry and changes it for a changed request", async () => {
  revoke.mockRejectedValue(new Error("private details")); setup(); prepare("Revoke membership"); submit("Revoke membership");
  await screen.findByRole("alert"); const first = revoke.mock.calls[0]![0];
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument();
  submit("Revoke membership"); await waitFor(() => expect(revoke).toHaveBeenCalledTimes(2));
  expect(revoke.mock.calls[1]![0]).toEqual(first);
  await screen.findByRole("alert"); fireEvent.change(screen.getByLabelText("Reason for change"), { target: { value: "New access review" } });
  submit("Revoke membership"); await waitFor(() => expect(revoke).toHaveBeenCalledTimes(3));
  expect(revoke.mock.calls[2]![0].idempotencyKey).not.toBe(first.idempotencyKey);
});
test("blocks duplicate submissions while pending", async () => {
  let finish!: (value: unknown) => void; revoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  setup(); prepare("Revoke membership"); submit("Revoke membership"); submit("Revoke membership");
  await screen.findByRole("button", { name: "Saving change…" }); expect(revoke).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Reason for change")).toBeDisabled(); finish({}); await screen.findByRole("status");
});
test("hides unavailable and redacted role controls", () => {
  setup({ canChangeStatus: false, canRevoke: false, roleKey: null });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
test("offers restoration instead of a role change for suspended members", () => {
  setup({ status: "suspended" });
  expect(screen.queryByRole("button", { name: "Change role" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Restore membership" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Revoke membership" })).toBeInTheDocument();
});
test("cancels without sending a command", () => {
  setup(); prepare("Revoke membership"); fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(revoke).not.toHaveBeenCalled(); expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
