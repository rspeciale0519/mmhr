import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RfpNotificationControls } from "./rfp-notification-controls";

const state = vi.hoisted(() => ({ contacts: {} as Record<string, unknown>, status: {} as Record<string, unknown>,
  queue: vi.fn(), retry: vi.fn(), refreshContacts: vi.fn(), refreshStatus: vi.fn(), routerRefresh: vi.fn(), reads: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.routerRefresh }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { name: string }) => options.name === "contacts" ? state.contacts : state.status,
  useMutation: (options: { name: string }) => ({ mutateAsync: options.name === "queue" ? state.queue : state.retry }),
}));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ rfps: {
  notificationRecipients: { queryOptions: (input: unknown) => { state.reads(input); return { name: "contacts" }; } },
  notificationStatus: { queryOptions: (input: unknown) => { state.reads(input); return { name: "status" }; } },
  queueNotification: { mutationOptions: () => ({ name: "queue" }) },
  retryNotification: { mutationOptions: () => ({ name: "retry" }) },
} }) }));
const ids = { organizationId: "7db1a7ef-00b8-481e-96cf-5c504e117b0b", rfpId: "dd3bd331-c956-4914-b1ec-1366270281fc", version: 2 };
const contact = { recipientId: "ec8a7b6a-fc1b-42a7-91fb-e8eb39384543", membershipId: "ea77343b-274d-45d7-b76d-e02b41d7f939",
  recipientEmail: "dev-0003@agentmail.to", sourceDigest: "a".repeat(64) };
const notification = { notificationId: "9f4ef26b-cdfd-44c0-9849-4ce87af223a9", ...contact,
  state: "queued", revision: 1, attemptCount: 0, canRetry: false };
beforeEach(() => {
  vi.clearAllMocks();
  state.queue.mockResolvedValue({ outcomeCode: "recorded" }); state.retry.mockResolvedValue({ outcomeCode: "recorded" });
  state.refreshContacts.mockResolvedValue({}); state.refreshStatus.mockResolvedValue({});
  state.contacts = { isPending: false, isError: false, isFetching: false, data: { items: [contact] }, refetch: state.refreshContacts };
  state.status = { isPending: false, isError: false, isFetching: false, data: { items: [] }, refetch: state.refreshStatus };
});
afterEach(cleanup);
function mount() { return render(<RfpNotificationControls {...ids}/>); }
function submit(label: string) { fireEvent.submit(screen.getByRole("button", { name: label }).closest("form")!); }

test("loads contacts and state with the exact scope, RFP and stable correlation", () => {
  const view = mount(); view.rerender(<RfpNotificationControls {...ids}/>);
  expect(state.reads).toHaveBeenCalledTimes(4);
  const calls = state.reads.mock.calls.map(([input]) => input);
  expect(calls[0]).toEqual({ ...ids, correlationId: expect.any(String) });
  expect(calls.every(input => JSON.stringify(input) === JSON.stringify(calls[0]))).toBe(true);
  expect(screen.getByRole("checkbox")).toBeRequired();
  expect(screen.getByText(/Queueing does not confirm sending or delivery/)).toBeInTheDocument();
});

test("queues the exact immutable source and reports queueing only", async () => {
  mount(); submit("Queue email notification");
  await waitFor(() => expect(state.queue).toHaveBeenCalledOnce());
  expect(state.queue).toHaveBeenCalledWith({ ...ids, recipientId: contact.recipientId, membershipId: contact.membershipId,
    expectedSourceDigest: contact.sourceDigest, notificationId: expect.any(String), correlationId: expect.any(String), idempotencyKey: expect.any(String) });
  expect(state.queue.mock.calls[0][0]).not.toHaveProperty("recipientEmail");
  await screen.findByText("Email notification queued. Sending and delivery remain unconfirmed.");
  expect(state.refreshContacts).toHaveBeenCalledOnce(); expect(state.refreshStatus).toHaveBeenCalledOnce();
});

test("replays the exact request after an uncertain queue response", async () => {
  state.queue.mockRejectedValueOnce(new Error("private provider detail")); mount(); submit("Queue email notification");
  const button = await screen.findByRole("button", { name: "Retry same request" }); fireEvent.click(button);
  await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(2));
  expect(state.queue.mock.calls[1][0]).toEqual(state.queue.mock.calls[0][0]);
  expect(screen.queryByText(/private provider detail/)).not.toBeInTheDocument();
});

test.each(["queued", "leased", "accepted", "needs_attention"])("does not offer another send for %s", value => {
  state.status.data = { items: [{ ...notification, state: value, attemptCount: 1 }] }; mount();
  expect(screen.queryByRole("button", { name: "Queue email notification" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry failed notification" })).not.toBeInTheDocument();
  if (value === "accepted") expect(screen.getByText(/Mailbox delivery remains unconfirmed/)).toBeInTheDocument();
  if (value === "needs_attention") expect(screen.getByText(/Staff must review this record/)).toBeInTheDocument();
});

test("retries only the server-authorized failed attempt revision", async () => {
  state.status.data = { items: [{ ...notification, state: "failed", revision: 3, attemptCount: 1, canRetry: true }] };
  mount(); submit("Retry failed notification");
  await waitFor(() => expect(state.retry).toHaveBeenCalledOnce());
  expect(state.retry).toHaveBeenCalledWith({ ...ids, notificationId: notification.notificationId, expectedRevision: 3,
    correlationId: expect.any(String), idempotencyKey: expect.any(String) });
  expect(state.queue).not.toHaveBeenCalled();
  await screen.findByText("Failed notification queued again. Sending and delivery remain unconfirmed.");
});

test("does not retry failed state when server denies retry", () => {
  state.status.data = { items: [{ ...notification, state: "failed" }] }; mount();
  expect(screen.getByText(/Failed before sending/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry failed notification" })).not.toBeInTheDocument();
});

test.each(["contacts", "status"])("hides stale recipient data when %s fails", target => {
  state[target as "contacts" | "status"].isError = true; mount();
  expect(screen.getByRole("alert")).toHaveTextContent("Notification records could not be loaded");
  expect(screen.queryByText(contact.recipientEmail)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Queue email notification" })).not.toBeInTheDocument();
});

test("shows loading without queue controls", () => {
  state.contacts.isPending = true; state.contacts.data = undefined; mount();
  expect(screen.getByRole("status")).toHaveTextContent("Loading notification contacts and status");
  expect(screen.queryByRole("button", { name: "Queue email notification" })).not.toBeInTheDocument();
});

test("shows empty contacts without claiming notification completion", () => {
  state.contacts.data = { items: [] }; mount();
  expect(screen.getByText(/No current verified vendor contacts/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Queue email notification" })).not.toBeInTheDocument();
});

test("retains ineligible contact history without retry or private address", () => {
  state.contacts.data = { items: [] };
  state.status.data = { items: [{ ...notification, state: "failed", canRetry: true }] }; mount();
  expect(screen.getByText(/Contact unavailable/)).toBeInTheDocument();
  expect(screen.queryByText(contact.recipientEmail)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry failed notification" })).not.toBeInTheDocument();
});

test("refreshes both queries explicitly", async () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Refresh notification status" }));
  await waitFor(() => expect(state.refreshStatus).toHaveBeenCalledOnce());
  expect(state.refreshContacts).toHaveBeenCalledOnce();
});

test("disables queue and refresh during a background check", () => {
  state.status.isFetching = true; mount();
  expect(screen.getByRole("button", { name: "Queue email notification" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh notification status" })).toBeDisabled();
});
