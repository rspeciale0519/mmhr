import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PortalClarificationPage } from "@/lib/portal-clarification";
import { ClarificationDecision, ClarificationQuestion, ClarificationReply } from "./clarification-controls";

const { mutations, options, refresh } = vi.hoisted(() => ({ mutations: { ask: vi.fn(), reply: vi.fn(), decide: vi.fn() },
  options: { ask: vi.fn(), reply: vi.fn(), decide: vi.fn() }, refresh: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ clarifications: Object.fromEntries(
  Object.entries(options).map(([name, mutationOptions]) => [name, { mutationOptions }]),
) }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const id = "11111111-1111-4111-8111-111111111111", revisionId = "22222222-2222-4222-8222-222222222222";
const item: PortalClarificationPage["items"][number] = { clarificationId: id, recipientId: id, normalizationId: id,
  replyNormalizationId: null, providerName: "Synthetic vendor", question: "Confirm the export terms.", answer: null,
  changeSummary: null, decisionReason: null, deadlineAt: "2030-01-02T00:00:00Z", askedAt: "2026-09-30T20:00:00Z",
  answeredAt: null, revision: 1, replyRevision: null, latestNormalizationId: revisionId, latestRevision: 2,
  status: "pending", decision: "pending", canReply: true, canDecide: false, late: false };
function view(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>); }
function fillReply() {
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "No added fee applies." } });
  fireEvent.change(screen.getByLabelText("What changed in your response?"), { target: { value: "The new revision states the fee condition." } });
  fireEvent.click(screen.getByLabelText("I checked this answer and its stated changes."));
}
beforeEach(() => {
  refresh.mockReset();
  for (const name of ["ask", "reply", "decide"] as const) {
    mutations[name].mockReset().mockResolvedValue({});
    options[name].mockReset().mockImplementation((config: object) => ({ mutationFn: mutations[name], ...config }));
  }
});
afterEach(cleanup);
test("validates the question and deadline before it sends a staff request", () => {
  view(<ClarificationQuestion organizationId={id} recipientId={id} normalizationId={id} />);
  fireEvent.change(screen.getByLabelText("Question for vendor"), { target: { value: " \u00a0" } });
  fireEvent.submit(screen.getByLabelText("Question for vendor").closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("Check the fields.");
  expect(mutations.ask).not.toHaveBeenCalled();
});
test("keeps an uncertain question locked and retries the exact request", async () => {
  mutations.ask.mockRejectedValueOnce(new Error("Transport unavailable")).mockResolvedValueOnce({});
  view(<ClarificationQuestion organizationId={id} recipientId={id} normalizationId={id} />);
  fireEvent.click(screen.getByText("Ask vendor to clarify"));
  fireEvent.change(screen.getByLabelText("Question for vendor"), { target: { value: "Confirm the export fee." } });
  fireEvent.change(screen.getByLabelText("Reply deadline in your local time"), { target: { value: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16) } });
  fireEvent.submit(screen.getByLabelText("Question for vendor").closest("form")!);
  await screen.findByText(/We could not confirm this action/);
  expect(screen.getByLabelText("Question for vendor")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await screen.findByText("Your question is saved in the vendor portal.");
  expect(mutations.ask.mock.calls[1]![0]).toEqual(mutations.ask.mock.calls[0]![0]);
});
test("requires an actual newer saved revision when the vendor links a change", () => {
  view(<ClarificationReply organizationId={id} item={item} latestNormalizationId={null} latestRevision={1} />);
  fillReply();
  fireEvent.click(screen.getByLabelText(/This answer uses my newer saved response/));
  expect(screen.getByRole("alert")).toHaveTextContent("Submit a new response above");
  expect(screen.getByRole("button", { name: "Submit clarification answer" })).toBeDisabled();
  expect(mutations.reply).not.toHaveBeenCalled();
});
test("links the selected revision and preserves saved status if refresh fails", async () => {
  refresh.mockImplementation(() => { throw new Error("Refresh unavailable"); });
  view(<ClarificationReply organizationId={id} item={item} latestNormalizationId={revisionId} latestRevision={2} />);
  expect(screen.getByRole("button", { name: "Submit clarification answer" })).toBeDisabled();
  fillReply(); fireEvent.click(screen.getByLabelText(/This answer uses my newer saved response/));
  fireEvent.click(screen.getByRole("button", { name: "Submit clarification answer" }));
  await screen.findByText("Your action is saved. Reload this page to read its status.");
  expect(mutations.reply.mock.calls[0]![0]).toMatchObject({ action: "reply", clarificationId: id, replyNormalizationId: revisionId });
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
});
test("requires a recorded staff reason and confirmation for a decision", async () => {
  view(<ClarificationDecision organizationId={id} item={{ ...item, status: "answered", canReply: false, canDecide: true }} />);
  expect(screen.getByRole("button", { name: "Record clarification decision" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "The revised conditions resolve the question." } });
  fireEvent.click(screen.getByLabelText("I checked the vendor answer and any linked response revision."));
  fireEvent.click(screen.getByRole("button", { name: "Record clarification decision" }));
  await screen.findByText(/Your decision is saved/);
  expect(mutations.decide.mock.calls[0]![0]).toMatchObject({ action: "decide", decision: "accepted", reason: "The revised conditions resolve the question." });
  expect(mutations.decide.mock.calls[0]![0]).not.toHaveProperty("actorIdentityId");
});
test("omits vendor replies and staff decisions when the server denies those actions", () => {
  view(<><ClarificationReply organizationId={id} item={{ ...item, canReply: false }} latestNormalizationId={revisionId} latestRevision={2} />
    <ClarificationDecision organizationId={id} item={{ ...item, status: "answered", canReply: false, canDecide: false }} /></>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText("A different staff member must record the decision.")).toBeInTheDocument();
});
