import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskWorkspace } from "./task-workspace";
import { TaskRevisionConflict } from "@/server/commands/deal-follow-up";

const { choices, queue, detail, history } = vi.hoisted(() => ({ choices: vi.fn(), queue: vi.fn(), detail: vi.fn(), history: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ requirePagePermission: vi.fn(), requireSelectedOrganizationPermission: async () => ({
  authorization: { identityId: "11111111-1111-4111-8111-111111111111", scope: { kind: "organization", organizationId: "11111111-1111-4111-8111-111111111111" }, supabase: {} },
}) }));
vi.mock("@/server/commands/deal-follow-up", () => ({ getDealFollowUpChoices: choices, getDealFollowUpQueue: queue,
  getDealFollowUp: detail, getDealFollowUpHistory: history, TaskRevisionConflict: class extends Error {}, TaskInputError: class extends Error {} }));
vi.mock("@/components/workflow/task-form", () => ({ TaskForm: () => <div>Task controls</div> }));
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const saved = { taskId: id, organizationId: id, dealId: other, title: "Prepare synthetic vendor answer", description: "Synthetic task scope",
  ownerIdentityId: other, assigneeIdentityId: id, createdByIdentityId: other, ownerLabel: "former-owner@example.invalid",
  assigneeLabel: "staff@example.invalid", createdByLabel: "creator@example.invalid", dealLabel: "Synthetic customer · Synthetic vendor · payroll · evaluation",
  ownerAvailable: false, assigneeAvailable: true, priority: "high", dueAt: null, blockerReason: "Await synthetic data", state: "blocked", revision: 2,
  createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T11:00:00.000Z", canManage: true, canProgress: true };
beforeEach(() => {
  choices.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  queue.mockReset().mockResolvedValue({ organizationId: id, items: [saved], nextCursor: null, version: 2,
    asOf: "2026-10-03T12:00:00.000Z", counts: { owned: 1, assigned: 1, blocked: 1, overdue: 0, completed: 0 } });
  detail.mockReset().mockResolvedValue({ item: saved });
  const { ownerAvailable: _owner, assigneeAvailable: _assignee, canManage: _manage, canProgress: _progress, ...snapshot } = saved;
  void [_owner, _assignee, _manage, _progress];
  history.mockReset().mockResolvedValue({ events: [{ eventId: other, revision: 2, action: "block", actorIdentityId: other,
    actorLabel: "historical-staff@example.invalid", occurredAt: "2026-10-03T11:00:00.000Z", reason: "Synthetic blocker record",
    before: { ...snapshot, blockerReason: null, state: "open", revision: 1 }, after: snapshot }], nextRevision: null });
});
afterEach(cleanup);
test("shows people and deal labels instead of ordinary-flow UUIDs", async () => {
  render(await TaskWorkspace({ searchParams: Promise.resolve({ queue: "blocked" }) }));
  expect(screen.getByText(/Synthetic customer · Synthetic vendor · payroll · evaluation/)).toBeInTheDocument();
  expect(screen.getByText(/former-owner@example.invalid/)).toBeInTheDocument(); expect(screen.getByText(/staff@example.invalid/)).toBeInTheDocument();
  expect(screen.queryByText(id)).not.toBeInTheDocument(); expect(screen.queryByText(other)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Prepare synthetic vendor answer" })).toHaveAttribute("href", `/admin/tasks/${id}`);
  expect(screen.getByText(/Synthetic customer · Synthetic vendor · payroll · evaluation/)).toHaveClass("[overflow-wrap:anywhere]");
});
test("shows readable history, retained attribution and formatted fields", async () => {
  render(await TaskWorkspace({ taskId: id, searchParams: Promise.resolve({}) }));
  expect(screen.getByText(/Recorded by historical-staff@example.invalid/)).toBeInTheDocument();
  expect(screen.getAllByText("Created by")).toHaveLength(2); expect(screen.getAllByText("Due").length).toBeGreaterThan(0);
  expect(screen.getByText(/People and deal labels use their current records/)).toBeInTheDocument();
  expect(screen.queryByText("ownerIdentityId")).not.toBeInTheDocument(); expect(screen.queryByText(other)).not.toBeInTheDocument();
  expect(screen.getByText("A team manager can transfer ownership to an active staff member.")).toBeInTheDocument();
});
test("renders a stale queue response with a fresh read action and no old task controls", async () => {
  queue.mockRejectedValueOnce(new TaskRevisionConflict());
  render(await TaskWorkspace({ searchParams: Promise.resolve({ queue: "overdue" }) }));
  expect(screen.getByRole("alert")).toHaveTextContent("The task queue changed. Start a fresh page.");
  expect(screen.getByRole("link", { name: "Reload task queue" })).toHaveAttribute("href", "/admin/tasks?queue=overdue");
  expect(screen.queryByText("Task controls")).not.toBeInTheDocument();
});
test("renders the empty queue and prevents creation without a customer deal", async () => {
  queue.mockResolvedValueOnce({ items: [], nextCursor: null, asOf: "2026-10-03T12:00:00.000Z",
    counts: { owned: 0, assigned: 0, blocked: 0, overdue: 0, completed: 0 } });
  render(await TaskWorkspace({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("No tasks are in this queue.")).toBeInTheDocument();
  expect(screen.getByText("A customer deal is required before staff can create a follow-up task.")).toBeInTheDocument();
  expect(screen.queryByText("Task controls")).not.toBeInTheDocument();
});
test("explains an empty older-history page without changing the current task", async () => {
  history.mockResolvedValueOnce({ events: [], nextRevision: null });
  render(await TaskWorkspace({ taskId: id, searchParams: Promise.resolve({ beforeRevision: "1" }) }));
  expect(screen.getByText("No older task changes are available.")).toBeInTheDocument();
  expect(screen.getByText("Prepare synthetic vendor answer")).toBeInTheDocument();
});
