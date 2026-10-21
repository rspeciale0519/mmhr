import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ManagedInvoiceWorkspace, type ManagedInvoiceClient } from "./managed-invoice-workspace";
import { invoiceActor, invoiceDetail, invoiceId, invoiceRequest } from "./managed-invoice-ui-fixtures";
const mocks = vi.hoisted(() => ({ detail: vi.fn(), owners: vi.fn(), source: vi.fn(), execute: vi.fn() }));
vi.mock("./invoice-original-download", () => ({ InvoiceOriginalDownload: ({ original, onAccessReady }: { original: { versionId: string }; onAccessReady: (id: string) => void }) =>
  <button onClick={() => onAccessReady(invoiceId(Number(original.versionId.slice(-2)) + 40))}>Complete exact original download</button> }));
const api: ManagedInvoiceClient = mocks;
function result(input: Parameters<ManagedInvoiceClient["execute"]>[0]) {
  return { organizationId: input.organizationId, correlationId: input.correlationId, commissionEventId: input.commissionEventId,
    invoiceId: input.invoiceId, preparationId: input.preparationId, action: input.action, preparationRevision: input.action === "prepare_invoice" ? 1 : 2,
    invoiceRevision: input.expectedInvoiceRevision + (input.action === "reject_invoice" ? 0 : 1),
    eventRevision: input.expectedEventRevision + (input.action === "issue_invoice" ? 1 : 0),
    status: input.action === "issue_invoice" ? "issued" : input.action === "approve_invoice" ? "ready" : "draft", outcomeCode: "recorded" };
}
const clients: QueryClient[] = [];
function mount(state: Parameters<typeof invoiceDetail>[0] = "empty", workspaceType: "customer" | "internal" = "customer") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  mocks.detail.mockResolvedValue(invoiceDetail(state));
  return render(<QueryClientProvider client={client}><ManagedInvoiceWorkspace request={invoiceRequest} actorIdentityId={invoiceActor}
    workspaceLabel="Synthetic customer" workspaceType={workspaceType} api={api} /></QueryClientProvider>);
}
function reason() { fireEvent.change(screen.getByLabelText("Reason for this request"), { target: { value: "Synthetic invoice sources checked" } }); }
async function prepare() {
  await screen.findByText("Prepare the invoice");
  fireEvent.change(screen.getByLabelText("Eligible invoice owner"), { target: { value: invoiceId(8) } });
  fireEvent.change(screen.getByLabelText("Invoice number"), { target: { value: "INV-SYNTHETIC-2" } });
  fireEvent.change(screen.getByLabelText("Issue date and time (UTC)"), { target: { value: "2026-10-03T10:00:00.000001" } });
  fireEvent.change(screen.getByLabelText("Due date and time (UTC)"), { target: { value: "2026-10-03T10:00:00.000002" } });
  fireEvent.change(screen.getByLabelText("Collection terms"), { target: { value: "Due on the recorded date" } }); reason();
  fireEvent.submit(screen.getByLabelText("Invoice number").closest("form")!);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.execute.mockImplementation(async input => result(input));
  mocks.owners.mockImplementation(async input => ({ ...input, owners: [{ identityId: invoiceId(8), label: "Synthetic eligible owner" }], nextCursor: null }));
  mocks.source.mockImplementation(async input => ({ ...input, eventRevision: 2, calculationRevision: 1, amountMinorUnits: 0, currency: "USD", sourceDigest: "b".repeat(64) }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
test("shows loading and the empty stored invoice without invented money", async () => {
  mount(); expect(screen.getByText("Loading the stored invoice record.")).toBeInTheDocument();
  await screen.findByText("No invoice is recorded for this commission event."); expect(screen.getByText("No proposals are recorded on this page.")).toBeInTheDocument();
});
test("prepares exact approved zero sources and actual owner without caller money or actor authority", async () => {
  mount(); await prepare(); await screen.findByText(/original request result is recorded: draft/);
  const input = mocks.execute.mock.calls[0][0]; expect(input).toMatchObject({ action: "prepare_invoice", expectedInvoiceRevision: 0,
    ownerIdentityId: invoiceId(8), supportingSources: invoiceDetail().mandatorySources, issueDate: "2026-10-03T10:00:00.000001Z" });
  for (const field of ["amountMinorUnits", "currency", "actorIdentityId"]) expect(input).not.toHaveProperty(field);
});
test("keeps one exact unknown command across repeated clicks and a read failure", async () => {
  mocks.execute.mockRejectedValueOnce(new Error("Uncertain transport")); mount(); await prepare();
  await screen.findByRole("button", { name: "Retry unchanged request" });
  const original = mocks.execute.mock.calls[0][0]; expect(screen.getByLabelText("Invoice number")).toBeDisabled();
  mocks.detail.mockRejectedValueOnce({ data: { code: "FORBIDDEN" } });
  const retry = screen.getByRole("button", { name: "Retry unchanged request" });
  act(() => { fireEvent.click(retry); fireEvent.click(retry); });
  await screen.findByText(/original request result is recorded: draft/);
  expect(mocks.execute).toHaveBeenCalledTimes(2); expect(mocks.execute.mock.calls[1][0]).toEqual(original);
  await screen.findByText(/current record could not refresh/);
});
test("denied reads show restricted feedback and no write form", async () => {
  mount(); mocks.detail.mockRejectedValue({ data: { code: "FORBIDDEN" } });
  await screen.findByText("Prepare the invoice");
  // A new mount makes the denied request the initial read, rather than changing normal query behavior.
  cleanup(); clients.splice(0).forEach(client => client.clear());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><ManagedInvoiceWorkspace request={invoiceRequest} actorIdentityId={invoiceActor}
    workspaceLabel="Synthetic customer" workspaceType="customer" api={api} /></QueryClientProvider>);
  await screen.findByRole("alert"); expect(screen.queryByLabelText("Invoice number")).not.toBeInTheDocument();
});
test("independent decision requires successful access to every exact original and an explicit review", async () => {
  mount("pending"); await screen.findByText("Invoice readiness and issue");
  expect(screen.getByRole("button", { name: "Record readiness decision" })).toBeDisabled();
  screen.getAllByRole("button", { name: "Complete exact original download" }).forEach(button => fireEvent.click(button));
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.change(screen.getByLabelText("Readiness review reference"), { target: { value: "Reviewed exact originals" } });
  const form = screen.getByLabelText("Readiness review reference").closest("form")!;
  fireEvent.change(form.querySelector('textarea[name="reason"]')!, { target: { value: "Independent source review complete" } }); fireEvent.submit(form);
  await screen.findByText(/original request result is recorded: ready/);
  expect(mocks.execute.mock.calls[0][0]).toMatchObject({ action: "approve_invoice", contentsReviewed: true,
    reviewedSources: invoiceDetail("pending").mandatorySources.map(source => ({ ...source, reviewedAccessId: invoiceId(Number(source.versionId.slice(-2)) + 40) })) });
});
test("stale pending readiness permits rejection but does not offer approval", async () => {
  mount("pending"); const stale = invoiceDetail("pending"); stale.currentPreparation!.canApprove = false; stale.currentPreparation!.sourceCurrent = false;
  mocks.detail.mockResolvedValue(stale);
  cleanup(); clients.splice(0).forEach(client => client.clear());
  const client = new QueryClient(); clients.push(client);
  render(<QueryClientProvider client={client}><ManagedInvoiceWorkspace request={invoiceRequest} actorIdentityId={invoiceActor}
    workspaceLabel="Synthetic customer" workspaceType="customer" api={api} initialData={stale} /></QueryClientProvider>);
  expect(screen.getByText("The source observation changed. Approval and issue are unavailable.")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Reject invoice readiness" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Approve invoice readiness" })).not.toBeInTheDocument();
});
test("issues only stored ready state and retains zero as an unpaid invoice", async () => {
  mount("ready"); await screen.findByRole("button", { name: "Issue the approved invoice" });
  const form = screen.getByRole("button", { name: "Issue the approved invoice" }).closest("form")!;
  fireEvent.change(form.querySelector('textarea[name="reason"]')!, { target: { value: "Approved readiness checked" } }); fireEvent.submit(form);
  await screen.findByText(/original request result is recorded: issued/);
  expect(mocks.execute.mock.calls[0][0]).toMatchObject({ action: "issue_invoice", expectedInvoiceRevision: 2 });
  expect(screen.queryByText(/original request result is recorded: paid/)).not.toBeInTheDocument();
});
test("an internal workspace cannot request the customer invoice", () => {
  mount("empty", "internal"); expect(screen.getByRole("alert")).toHaveTextContent("Select the customer finance workspace");
  expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
});
test.each(["FORBIDDEN", "CONFLICT"])("a confirmed %s command refusal has no unsafe retry or competing action", async code => {
  mocks.execute.mockRejectedValue({ data: { code } }); mount(); await prepare();
  await screen.findByRole("alert"); expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Invoice number")).toBeDisabled(); expect(mocks.execute).toHaveBeenCalledOnce();
});
test("unknown calculation state disables preparation without guessing money", async () => {
  const detail = invoiceDetail(); detail.eventState = "pending_review"; detail.calculationId = null; detail.calculationRevision = 0; detail.mandatorySources = [];
  const client = new QueryClient(); clients.push(client); mocks.detail.mockResolvedValue(detail);
  render(<QueryClientProvider client={client}><ManagedInvoiceWorkspace request={invoiceRequest} actorIdentityId={invoiceActor}
    workspaceLabel="Synthetic customer" workspaceType="customer" api={api} initialData={detail} /></QueryClientProvider>);
  expect(screen.getByText(/preparation needs an approved event/)).toBeInTheDocument();
  expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.owners).not.toHaveBeenCalled(); expect(screen.queryByLabelText("Invoice number")).not.toBeInTheDocument();
});
test("uses the exact owner cursor and clears the old page selection", async () => {
  mocks.owners.mockImplementation(async input => ({ organizationId: input.organizationId, correlationId: input.correlationId,
    commissionEventId: input.commissionEventId, owners: input.afterId ? [{ identityId: invoiceId(125), label: "Later eligible owner" }]
    : Array.from({ length: 25 }, (_, index) => ({ identityId: invoiceId(100 + index), label: `Eligible owner ${index}` })), nextCursor: input.afterId ? null : invoiceId(124) }));
  mount(); await screen.findByRole("button", { name: "Next owner page" });
  fireEvent.change(screen.getByLabelText("Eligible invoice owner"), { target: { value: invoiceId(100) } });
  fireEvent.click(screen.getByRole("button", { name: "Next owner page" })); await screen.findByRole("option", { name: "Later eligible owner" });
  expect(mocks.owners.mock.calls[1][0].afterId).toBe(invoiceId(124)); expect(screen.getByLabelText("Eligible invoice owner")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Record invoice proposal" })).toBeDisabled();
});
test("uses the exact preserved-proposal cursor without hiding the current invoice", async () => {
  const detail = invoiceDetail("issued"), preparedAt = detail.currentPreparation!.preparedAt;
  detail.preparations = Array.from({ length: 25 }, (_, index) => ({ preparationId: invoiceId(100 + index), revision: 2, state: "rejected",
    preparedAt, preparedByLabel: "Past synthetic preparer", invoiceRevisionAfterPrepare: index + 1 })); detail.nextPreparationCursor = invoiceId(124);
  mocks.detail.mockImplementation(async input => ({ ...detail, correlationId: input.correlationId,
    ...(input.afterPreparationId ? { preparations: [], nextPreparationCursor: null } : {}) }));
  const client = new QueryClient(); clients.push(client);
  render(<QueryClientProvider client={client}><ManagedInvoiceWorkspace request={invoiceRequest} actorIdentityId={invoiceActor}
    workspaceLabel="Synthetic customer" workspaceType="customer" api={api} initialData={detail} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Next proposal page" })); await screen.findByText("No proposals are recorded on this page.");
  expect(mocks.detail.mock.calls.some(([input]) => input.afterPreparationId === invoiceId(124))).toBe(true);
  expect(screen.getByText("Stored invoice status: issued.")).toBeInTheDocument();
});
test("rejected readiness is visible and cannot be issued", async () => {
  mount("rejected"); await screen.findByText("Readiness was rejected. Prepare a replacement proposal before issue.");
  expect(screen.queryByRole("button", { name: "Issue the approved invoice" })).not.toBeInTheDocument();
});

test("a stored proposal replacement resets its fields, owner choice and exact-original review state", async () => {
  mount("pending"); await screen.findByLabelText("Invoice number");
  fireEvent.change(screen.getByLabelText("Eligible invoice owner"), { target: { value: invoiceId(8) } });
  fireEvent.change(screen.getByLabelText("Invoice number"), { target: { value: "OLD-UNSAVED-NUMBER" } });
  fireEvent.change(screen.getByLabelText("Collection terms"), { target: { value: "Old unsaved terms" } });
  screen.getAllByRole("button", { name: "Complete exact original download" }).forEach(button => fireEvent.click(button));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Readiness review reference"), { target: { value: "Old review reference" } });
  expect(screen.getByRole("button", { name: "Record readiness decision" })).toBeEnabled();
  const replacement = invoiceDetail("pending");
  replacement.invoice!.invoiceRevision = 2; replacement.invoice!.currentPreparationId = invoiceId(60);
  replacement.invoice!.invoiceNumber = "INV-REPLACEMENT";
  replacement.invoice!.issueDate = "2026-10-04T11:00:00.000001Z";
  replacement.invoice!.dueDate = "2026-10-05T11:00:00.000002Z";
  replacement.currentPreparation!.preparationId = invoiceId(60);
  replacement.currentPreparation!.collectionTerms = "New stored collection terms";
  replacement.preparations[0].preparationId = invoiceId(60);
  replacement.preparations[0].invoiceRevisionAfterPrepare = 2;
  mocks.detail.mockResolvedValue(replacement);
  await act(async () => { await clients.at(-1)!.refetchQueries({ queryKey: ["managedInvoiceDetail"] }); });
  await screen.findByDisplayValue("INV-REPLACEMENT");
  expect(screen.getByLabelText("Issue date and time (UTC)")).toHaveValue("2026-10-04T11:00:00.000001");
  expect(screen.getByLabelText("Due date and time (UTC)")).toHaveValue("2026-10-05T11:00:00.000002");
  expect(screen.getByLabelText("Collection terms")).toHaveValue("New stored collection terms");
  expect(screen.getByLabelText("Eligible invoice owner")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByLabelText("Readiness review reference")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Record readiness decision" })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("Readiness review reference").closest("form")!);
  expect(mocks.execute).not.toHaveBeenCalled();
});

test("a record change resets child forms without changing an unknown command or its IDs", async () => {
  mocks.execute.mockRejectedValueOnce(new Error("Response lost")); mount(); await prepare();
  await screen.findByRole("button", { name: "Retry unchanged request" });
  const original = mocks.execute.mock.calls[0][0]; const stored = invoiceDetail("pending");
  stored.invoice!.invoiceId = original.invoiceId; stored.invoice!.currentPreparationId = original.preparationId;
  stored.invoice!.invoiceNumber = original.invoiceNumber;
  stored.currentPreparation!.preparationId = original.preparationId;
  stored.currentPreparation!.preparedByIdentityId = invoiceActor;
  stored.currentPreparation!.canApprove = false; stored.currentPreparation!.canReject = false;
  stored.preparations[0].preparationId = original.preparationId;
  mocks.detail.mockResolvedValue(stored);
  await act(async () => { await clients.at(-1)!.refetchQueries({ queryKey: ["managedInvoiceDetail"] }); });
  await screen.findByText("Stored invoice status: draft.");
  expect(await screen.findByLabelText("Invoice number")).toBeDisabled();
  expect(screen.getByLabelText("Eligible invoice owner")).toHaveValue("");
  expect(mocks.execute).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await screen.findByText(/original request result is recorded: draft/);
  expect(mocks.execute).toHaveBeenCalledTimes(2); expect(mocks.execute.mock.calls[1][0]).toEqual(original);
});
