import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { WorkspaceDocumentReviewPage } from "@/lib/workspace-document-review";
import { WorkspaceDocumentReview } from "./workspace-document-review";

const { decide, refresh } = vi.hoisted(() => ({ decide: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ documents: { decide: {
  mutationOptions: (options: object) => ({ mutationFn: decide, ...options }),
} } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const accessId = "44444444-4444-4444-8444-444444444444";
vi.mock("./workspace-document-download", () => ({ WorkspaceDocumentDownload: ({ onAccessReady }: { onAccessReady: (id: string) => void }) =>
  <button onClick={() => onAccessReady(accessId)}>Download current file</button> }));
const page: WorkspaceDocumentReviewPage = { organizationId: "11111111-1111-4111-8111-111111111111", correlationId: "55555555-5555-4555-8555-555555555555", canReview: true,
  document: { documentId: "22222222-2222-4222-8222-222222222222", versionId: "33333333-3333-4333-8333-333333333333", version: 1,
    isCurrent: true, state: "ready", revision: 4, fileName: "Synthetic original.pdf", contentType: "application/pdf", byteSize: 12, failureCode: null,
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" } };
beforeEach(() => { decide.mockReset().mockResolvedValue({}); refresh.mockReset(); });
afterEach(cleanup);
function view(state = "ready" as "ready" | "needs_review", canReview = true) {
  return render(<QueryClientProvider client={new QueryClient()}><WorkspaceDocumentReview page={{ ...page, canReview,
    document: { ...page.document, state, revision: state === "ready" ? 4 : 5 } }} /></QueryClientProvider>);
}
function fill() {
  fireEvent.change(screen.getByLabelText("Private review reason"), { target: { value: "Synthetic independent review" } });
  fireEvent.change(screen.getByLabelText("Review record reference"), { target: { value: "synthetic:review" } });
}
test("starts review against the displayed immutable revision", async () => {
  view(); fill(); fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!); await screen.findByText(/Your decision is recorded/);
  expect(decide.mock.calls[0][0]).toMatchObject({ action: "begin_review", expectedRevision: 4, versionId: page.document.versionId,
    organizationId: page.organizationId, reason: "Synthetic independent review", reviewReference: "synthetic:review" });
  expect(decide.mock.calls[0][0]).not.toHaveProperty("contentsReviewed"); expect(refresh).toHaveBeenCalledOnce();
});
test.each(["approve", "reject"])("requires the current file request and explicit acknowledgement before %s", async decision => {
  view("needs_review"); fill(); expect(screen.getByRole("button", { name: "Record decision" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Download current file" }));
  fireEvent.change(screen.getByLabelText("Decision"), { target: { value: decision } });
  fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("confirm your review"); expect(decide).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!);
  await screen.findByText(/Your decision is recorded/); expect(decide.mock.calls[0][0]).toMatchObject({ action: decision, expectedRevision: 5,
    reviewedAccessId: accessId, contentsReviewed: true });
});
test("locks uncertain decisions and retries exactly without accepting changed fields", async () => {
  decide.mockRejectedValueOnce(new Error("private provider detail")); view(); fill(); fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!);
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private provider detail"); expect(screen.getByLabelText("Private review reason")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged decision" })); await screen.findByText(/Your decision is recorded/);
  expect(decide.mock.calls[1][0]).toEqual(decide.mock.calls[0][0]);
});
test("does not replace a recorded result with an uncertain decision after a refresh failure", async () => {
  refresh.mockImplementation(() => { throw new Error("refresh failed"); }); view(); fill(); fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!);
  await screen.findByText("The page could not refresh. Your recorded result remains saved.");
  expect(screen.queryByRole("button", { name: "Retry unchanged decision" })).not.toBeInTheDocument(); expect(decide).toHaveBeenCalledOnce();
});
test("hides controls when this version or this reviewer has no decision authority", () => {
  view("ready", false); expect(screen.getByRole("status")).toHaveTextContent("cannot receive a new decision");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
