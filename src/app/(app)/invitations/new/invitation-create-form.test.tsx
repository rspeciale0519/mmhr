import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InvitationCreateForm } from "./invitation-create-form";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ invitations: { create: {
  mutationOptions: () => ({ mutationFn: mutate, retry: false }),
} } }) }));
const organizationId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => { mutate.mockReset(); });
afterEach(cleanup);

function setup() {
  render(<QueryClientProvider client={new QueryClient()}>
    <InvitationCreateForm organizationId={organizationId} />
  </QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "MEMBER@example.test" } });
  fireEvent.change(screen.getByLabelText("Reason for access"), { target: { value: "Review project records" } });
}
function submit() { fireEvent.submit(screen.getByRole("form", { name: "Invite a member" })); }

test("submits a scoped viewer invitation without a caller-supplied actor", async () => {
  mutate.mockResolvedValue({ status: "pending" });
  setup(); submit();
  await screen.findByRole("status");
  expect(mutate.mock.calls[0]![0]).toEqual({ organizationId, email: "member@example.test",
    roleKey: "viewer", reason: "Review project records", idempotencyKey: expect.any(String), correlationId: expect.any(String) });
  expect(screen.getByText(/does not confirm email delivery/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Invite another member" }));
  expect(screen.getByLabelText("Email address")).toHaveValue("");
  expect(screen.getByLabelText("Organization role")).toHaveValue("viewer");
});

test("retains the receipt key after a failed response and hides error details", async () => {
  mutate.mockRejectedValue(new Error("private database detail"));
  setup(); submit();
  await screen.findByRole("alert");
  expect(screen.queryByText(/private database detail/)).not.toBeInTheDocument();
  const first = mutate.mock.calls[0]![0];
  submit();
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[1]![0]).toEqual(first);
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("Reason for access"), { target: { value: "Support project review" } });
  submit();
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(3));
  expect(mutate.mock.calls[2]![0].idempotencyKey).not.toBe(first.idempotencyKey);
});

test("blocks duplicate submissions while a request is pending", async () => {
  let finish!: (value: unknown) => void;
  mutate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  setup(); submit(); submit();
  await screen.findByRole("button", { name: "Creating invitation…" });
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Email address")).toBeDisabled();
  finish({ status: "pending" });
  await screen.findByRole("status");
});
