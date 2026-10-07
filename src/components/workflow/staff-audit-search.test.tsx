import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StaffAuditSearch } from "./staff-audit-search";
import type { StaffAuditSearch as Search, StaffAuditPage } from "@/lib/staff-audit";
import { auditId, auditPage, auditRow } from "@/server/audit/staff-audit-test-fixture";
const mocks = vi.hoisted(() => ({ send: vi.fn<(input: Search) => Promise<StaffAuditPage>>(), reset: vi.fn(), options: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ audit: { search: { mutationOptions: mocks.options } } }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: mocks.send, reset: mocks.reset }) }));
beforeEach(() => { mocks.send.mockReset().mockResolvedValue(auditPage()); mocks.reset.mockReset(); mocks.options.mockReset(); });
test("renders only the permitted metadata and exact microseconds", () => {
  render(<StaffAuditSearch organizationId={null} initialPage={auditPage()}/>);
  expect(screen.getByText("role_version.activate")).toBeInTheDocument();
  expect(screen.getByText("2026-10-04 12:00:00.123456 UTC")).toBeInTheDocument();
  expect(screen.queryByText("private")).not.toBeInTheDocument();
  expect(mocks.options).toHaveBeenCalledWith({ retry: false, gcTime: 0 });
});
test("shows an empty result without making an extra read", () => {
  render(<StaffAuditSearch organizationId={null} initialPage={auditPage(null, [])}/>);
  expect(screen.getByText("No audit events match this search.")).toBeInTheDocument(); expect(mocks.send).not.toHaveBeenCalled();
});
test("submits exact typed reference filters without generating links or storage", async () => {
  const store = vi.spyOn(Storage.prototype, "setItem");
  const { container } = render(<StaffAuditSearch organizationId={null} initialPage={auditPage()}/>);
  fireEvent.change(screen.getByLabelText("Actor type"), { target: { value: "worker" } });
  const actorReference = screen.getByLabelText("Known actor reference (optional)");
  expect(actorReference).toHaveAccessibleName("Known actor reference (optional)");
  expect(actorReference).toHaveAccessibleDescription("Leave this field empty to search all actors of this type.");
  expect(actorReference).toHaveAttribute("aria-describedby", `${actorReference.id}-help`);
  fireEvent.change(actorReference, { target: { value: "known-fixture-reference" } });
  fireEvent.click(screen.getByRole("button", { name: "Search audit events" }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith({ organizationId: null, limit: 25, actor: { type: "worker", reference: "known-fixture-reference" } }));
  expect(container.querySelectorAll("a")).toHaveLength(0); expect(store).not.toHaveBeenCalled(); store.mockRestore();
});
test("clears visible rows during a pending read and rejects overlapping submissions", async () => {
  let resolve: ((page: StaffAuditPage) => void) | undefined;
  mocks.send.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<StaffAuditSearch organizationId={null} initialPage={auditPage()}/>);
  fireEvent.click(screen.getByRole("button", { name: "Search audit events" }));
  expect(screen.queryByText("role_version.activate")).not.toBeInTheDocument();
  expect(screen.getByText("Loading audit events…")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Search audit events" })); expect(mocks.send).toHaveBeenCalledTimes(1);
  if (!resolve) throw new Error("Read callback missing"); resolve(auditPage());
  await waitFor(() => expect(screen.getByText("role_version.activate")).toBeInTheDocument());
});
test("rejects a reversed range without a provider call", () => {
  render(<StaffAuditSearch organizationId={null} initialPage={auditPage()}/>);
  fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-10-04T12:00" } });
  fireEvent.change(screen.getByLabelText("To (UTC)"), { target: { value: "2026-10-04T11:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Search audit events" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Check the actor"); expect(mocks.send).not.toHaveBeenCalled();
});
test("removes prior rows after access failure and does not retry automatically", async () => {
  mocks.send.mockRejectedValue(new Error("private provider payload"));
  render(<StaffAuditSearch organizationId={null} initialPage={auditPage()}/>);
  fireEvent.click(screen.getByRole("button", { name: "Search audit events" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Audit search is unavailable"));
  expect(screen.queryByText("role_version.activate")).not.toBeInTheDocument(); expect(screen.queryByText("private provider payload")).not.toBeInTheDocument();
  expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.reset).toHaveBeenCalledTimes(1);
});
test("reuses filters and the precise last key for the next page", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => auditRow(i + 1));
  const initial = { ...auditPage(null, rows), nextCursor: { id: auditId(25), occurredAt: rows[24]!.occurredAt } };
  mocks.send.mockResolvedValue(auditPage(null, []));
  render(<StaffAuditSearch organizationId={null} initialPage={initial}/>);
  fireEvent.click(screen.getByRole("button", { name: "Next audit page" }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith({ organizationId: null, limit: 25, after: initial.nextCursor }));
  expect(screen.queryByRole("button", { name: "Next audit page" })).not.toBeInTheDocument();
});
test("rejects injected private result fields before rendering", async () => {
  const malformed = { ...auditPage(), rows: [{ ...auditRow(), actorReference: "private-reference" }] };
  mocks.send.mockResolvedValue(malformed);
  render(<StaffAuditSearch organizationId={null} initialPage={auditPage()}/>);
  fireEvent.click(screen.getByRole("button", { name: "Search audit events" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.queryByText("private-reference")).not.toBeInTheDocument();
});

afterEach(cleanup);
