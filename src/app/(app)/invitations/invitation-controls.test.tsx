import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InvitationControls } from "./invitation-controls";

const { resend, revoke, refresh } = vi.hoisted(() => ({ resend: vi.fn(), revoke: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ invitations: {
  resend: { mutationOptions: () => ({ mutationFn: resend }) }, revoke: { mutationOptions: () => ({ mutationFn: revoke }) },
} }) }));
const organizationId = "22222222-2222-4222-8222-222222222222";
const invitationId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { resend.mockReset(); revoke.mockReset(); refresh.mockReset(); });
afterEach(cleanup);
function setup(canResend = true, canRevoke = true) {
  render(<QueryClientProvider client={new QueryClient()}><InvitationControls organizationId={organizationId}
    invitationId={invitationId} canResend={canResend} canRevoke={canRevoke} /></QueryClientProvider>);
}
function prepare(operation: "Resend" | "Revoke") {
  fireEvent.click(screen.getByRole("button", { name: `${operation} invitation` }));
  fireEvent.change(screen.getByLabelText("Reason for change"), { target: { value: "Access request changed" } });
}
function submit(operation = "Resend") { fireEvent.submit(screen.getByRole("form", { name: `${operation} invitation` })); }
test.each(["Resend", "Revoke"] as const)("confirms %s with scoped input and no actor", async (operation) => {
  const mutation = operation === "Resend" ? resend : revoke;
  mutation.mockResolvedValue({}); setup(); prepare(operation);
  expect(mutation).not.toHaveBeenCalled();
  submit(operation);
  await screen.findByRole("status");
  expect(mutation.mock.calls[0]![0]).toEqual({ organizationId, invitationId, reason: "Access request changed",
    idempotencyKey: expect.any(String), correlationId: expect.any(String) });
  fireEvent.click(screen.getByRole("button", { name: "Refresh invitations" }));
  expect(refresh).toHaveBeenCalledOnce();
});
test("retains the operation key after failure and hides internal details", async () => {
  resend.mockRejectedValue(new Error("private details")); setup(); prepare("Resend"); submit();
  await screen.findByRole("alert");
  const first = resend.mock.calls[0]![0];
  expect(screen.queryByText(/private details/)).not.toBeInTheDocument();
  submit(); await waitFor(() => expect(resend).toHaveBeenCalledTimes(2));
  expect(resend.mock.calls[1]![0]).toEqual(first);
});
test("blocks duplicate requests while pending", async () => {
  let finish!: (value: unknown) => void;
  resend.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  setup(); prepare("Resend"); submit(); submit();
  await screen.findByRole("button", { name: "Saving change…" });
  expect(resend).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Reason for change")).toBeDisabled();
  finish({}); await screen.findByRole("status");
});
test("hides unavailable actions and cancels without mutation", () => {
  setup(false, true);
  expect(screen.queryByRole("button", { name: "Resend invitation" })).not.toBeInTheDocument();
  prepare("Revoke"); fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(revoke).not.toHaveBeenCalled();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
