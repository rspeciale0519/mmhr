import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { taskItemSchema } from "@/lib/deal-follow-up";
import { TaskForm } from "./task-form";
import { TaskChoice } from "./task-choice";

const { mutation, mutationOptions, choices, refresh, push } = vi.hoisted(() => ({ mutation: vi.fn(), mutationOptions: vi.fn(),
  choices: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ tasks: { record: { mutationOptions },
  choices: { queryOptions: (input: unknown) => ({ queryKey: ["synthetic-task-choices", input], queryFn: () => choices(input) }) } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const item = taskItemSchema.parse({ taskId: id, organizationId: id, dealId: id, title: "Synthetic follow-up", description: "Synthetic scope",
  dealLabel: "Synthetic customer · evaluation", ownerLabel: "Synthetic owner", assigneeLabel: "Synthetic assignee", createdByLabel: "Synthetic owner",
  createdByIdentityId: id, ownerIdentityId: id, assigneeIdentityId: other, ownerAvailable: true, assigneeAvailable: true,
  dueAt: "2026-10-03T15:00:00.000Z", state: "open", priority: "normal", blockerReason: null, revision: 3,
  createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z", canManage: true, canProgress: true });
const people = { items: [{ id, label: "Synthetic owner" }, { id: other, label: "Synthetic assignee" }], nextCursor: null };
function view(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>); }
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }
function submit() { fireEvent.submit(screen.getByLabelText("Record reason").closest("form")!); }
beforeEach(() => {
  mutation.mockReset().mockResolvedValue({ taskId: id, revision: 4 });
  mutationOptions.mockReset().mockImplementation((config: object) => ({ mutationFn: mutation, ...config }));
  choices.mockReset(); refresh.mockReset(); push.mockReset();
});
afterEach(cleanup);

test("submits exact expected revision and explicit description and due date clearing", async () => {
  view(<TaskForm organizationId={id} item={item} people={people}/>);
  fill("Description", ""); fill("Due date and time", ""); fill("Record reason", "Synthetic optional-field clearing"); submit();
  await screen.findByText("Task saved. Revision 4.");
  expect(mutation.mock.calls[0]![0]).toMatchObject({ action: "edit", taskId: id, expectedRevision: 3, description: null, dueAt: null });
});
test("does not offer metadata or cancellation to an assignee", () => {
  view(<TaskForm organizationId={id} item={{ ...item, canManage: false }} people={people}/>);
  expect(screen.getByRole("option", { name: "start" })).toBeInTheDocument();
  for (const name of ["edit", "reassign", "transfer owner", "cancel"]) expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
});
test("does not offer completion for a blocked task until staff resumes it", () => {
  view(<TaskForm organizationId={id} item={{ ...item, state: "blocked", blockerReason: "Synthetic blocker" }} people={people}/>);
  expect(screen.getByRole("option", { name: "resume" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "complete" })).not.toBeInTheDocument();
});
test.each(["completed", "cancelled"] as const)("offers no form for a %s task", state => {
  view(<TaskForm organizationId={id} item={{ ...item, state, canManage: false, canProgress: false }} people={people}/>);
  expect(screen.queryByRole("button", { name: "Save task" })).not.toBeInTheDocument();
});
test("transfers current ownership with one immutable reason and revision", async () => {
  view(<TaskForm organizationId={id} item={item} people={people}/>);
  fill("Action", "transfer_owner"); fill("Task owner", other); fill("Record reason", "Synthetic owner departure"); submit();
  await screen.findByText("Task saved. Revision 4.");
  expect(mutation.mock.calls[0]![0]).toMatchObject({ action: "transfer_owner", ownerIdentityId: other, expectedRevision: 3 });
  expect(mutation.mock.calls[0]![0]).not.toHaveProperty("createdByIdentityId");
});
test("keeps owner and assignee choices separate when the action changes", async () => {
  const third = "33333333-3333-4333-8333-333333333333";
  view(<TaskForm organizationId={id} item={item} people={{ ...people, items: [...people.items, { id: third, label: "Another staff member" }] }}/>);
  fill("Action", "transfer_owner"); fill("Task owner", third); fill("Action", "reassign");
  expect(screen.getByLabelText("Task assignee", { exact: true })).toHaveValue(other);
  fill("Record reason", "Synthetic reassignment"); submit(); await screen.findByText("Task saved. Revision 4.");
  expect(mutation.mock.calls[0]![0]).toMatchObject({ action: "reassign", assigneeIdentityId: other });
});
test("does not retain an unassigned choice when switching back to ownership", () => {
  view(<TaskForm organizationId={id} item={item} people={people}/>);
  fill("Action", "reassign"); fill("Task assignee", ""); fill("Action", "transfer_owner");
  expect(screen.getByLabelText("Task owner", { exact: true })).toHaveValue(id);
});
test.each(["CONFLICT", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN"])("offers reload instead of unchanged retry for definite %s", async code => {
  mutation.mockRejectedValueOnce(Object.assign(new Error("Synthetic definite failure"), { data: { code } }));
  view(<TaskForm organizationId={id} item={item} people={people}/>); fill("Record reason", "Synthetic definite rejection"); submit();
  await screen.findByRole("button", { name: "Reload page" });
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(code === "CONFLICT" ? "The task changed" : "Task access is unavailable");
  submit(); expect(mutation).toHaveBeenCalledOnce();
});
test("unlocks invalid fields for correction and uses a fresh request after a definite rejection", async () => {
  mutation.mockRejectedValueOnce(Object.assign(new Error("Synthetic invalid input"), { data: { code: "BAD_REQUEST" } }));
  view(<TaskForm organizationId={id} item={item} people={people}/>); fill("Record reason", "Synthetic field rejection"); submit();
  await screen.findByText("The task fields or action are invalid. Check the fields and try again.");
  const first = mutation.mock.calls[0]![0]; expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
  fill("Task title", "Corrected synthetic title"); submit(); await screen.findByText("Task saved. Revision 4.");
  expect(mutation.mock.calls[1]![0].idempotencyKey).not.toBe(first.idempotencyKey);
  expect(mutation.mock.calls[1]![0].correlationId).not.toBe(first.correlationId);
});
test("preserves the original request after an uncertain response and disables duplicate submits", async () => {
  mutation.mockRejectedValueOnce(new Error("Synthetic lost response"));
  view(<TaskForm organizationId={id} item={item} people={people}/>);
  fill("Record reason", "Synthetic exact retry"); submit();
  const button = await screen.findByRole("button", { name: "Retry unchanged request" });
  const first = mutation.mock.calls[0]![0]; submit(); expect(mutation).toHaveBeenCalledOnce();
  fireEvent.click(button); await screen.findByText("Task saved. Revision 4."); expect(mutation.mock.calls[1]![0]).toEqual(first);
});
test("keeps a confirmed saved result when route refresh fails", async () => {
  refresh.mockImplementation(() => { throw new Error("Synthetic refresh failure"); });
  view(<TaskForm organizationId={id} item={item} people={people}/>); fill("Record reason", "Synthetic update"); submit();
  await screen.findByText("Task saved. Revision 4. Reload the page to read the current task.");
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
});
test("rejects ambiguous local due times before a write", () => {
  view(<TaskForm organizationId={id} item={item} people={people}/>);
  fill("Due date and time", "2026-11-01T01:30:00"); fill("Due time zone", "America/New_York"); fill("Record reason", "Synthetic due date"); submit();
  expect(mutation).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toBeInTheDocument();
});
test("creates the task with a selected scoped deal and current owner", async () => {
  view(<TaskForm organizationId={id} people={people} viewerIdentityId={id} deals={{ items: [{ id, label: "Synthetic customer deal" }], nextCursor: null }}/>);
  fill("Customer deal", id); fill("Task title", "Synthetic new task"); fill("Record reason", "Synthetic create"); submit();
  await screen.findByText("Task saved. Revision 4.");
  expect(mutation.mock.calls[0]![0]).toMatchObject({ action: "create", ownerIdentityId: id, dealId: id, assigneeIdentityId: null });
  expect(push).toHaveBeenCalledWith(`/admin/tasks/${id}`);
});
test("loads eligible choice pages without replacing selected records or copying unrelated identities", async () => {
  choices.mockResolvedValue({ items: [{ id: other, label: "More synthetic staff" }], nextCursor: null });
  view(<TaskChoice organizationId={id} kind="people" initial={{ items: [{ id, label: "Initial staff" }], nextCursor: id }}
    name="ownerIdentityId" label="Task owner" defaultValue={id}/>);
  fireEvent.click(screen.getByRole("button", { name: "More choices" })); await screen.findByRole("option", { name: "More synthetic staff" });
  expect(screen.getByLabelText("Task owner")).toHaveValue(id); expect(choices.mock.calls[0]![0]).toMatchObject({ organizationId: id, kind: "people", afterId: id });
});
test("uses authorized labels for an unavailable current owner outside the visible choice page", () => {
  view(<TaskChoice organizationId={id} kind="people" initial={{ items: [], nextCursor: null }} name="ownerIdentityId"
    label="Task owner" defaultValue={other} unavailableValue={other} currentLabel="former-staff@example.invalid"/>);
  expect(screen.getByRole("option", { name: "former-staff@example.invalid · Access is unavailable" })).toBeInTheDocument();
  expect(screen.queryByText(other)).not.toBeInTheDocument();
});
test("supports focus on each named native field and its submit control", () => {
  view(<TaskForm organizationId={id} item={item} people={people}/>);
  for (const name of ["Action", "Task title", "Description", "Priority", "Due date and time", "Due time zone", "Record reason"]) {
    const field = screen.getByLabelText(name, { exact: true }); field.focus(); expect(field).toHaveFocus();
    expect(field.tabIndex).toBeGreaterThanOrEqual(0);
  }
  const button = screen.getByRole("button", { name: "Save task" }); button.focus(); expect(button).toHaveFocus();
  expect(screen.getByLabelText("Description", { exact: true })).toHaveAccessibleDescription("Leave this field empty to clear the description.");
  expect(screen.getByLabelText("Due date and time", { exact: true })).toHaveAccessibleDescription("Leave this field empty to clear the due date.");
  expect(screen.getByLabelText("Due time zone", { exact: true })).toHaveAccessibleDescription("Use UTC or an IANA time zone, such as America/New_York.");
});
test("rejects an invalid due time zone before sending a request", () => {
  view(<TaskForm organizationId={id} item={item} people={people}/>);
  fill("Due date and time", "2026-10-03T12:00:00"); fill("Due time zone", "Invalid/Zone"); fill("Record reason", "Synthetic invalid due date"); submit();
  expect(mutation).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toBeInTheDocument();
});
test("blocks another write while its first response is pending", async () => {
  let finish: ((value: object) => void) | undefined;
  mutation.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  view(<TaskForm organizationId={id} item={item} people={people}/>); fill("Record reason", "Synthetic pending write"); submit(); submit();
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce()); finish!({ taskId: id, revision: 4 }); await screen.findByText("Task saved. Revision 4.");
});
