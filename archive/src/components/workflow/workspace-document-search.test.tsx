import { randomUUID } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { searchWorkspaceDocumentsAction } from "@/app/(app)/documents/actions";
import { WorkspaceDocumentSearch } from "./workspace-document-search";
import type { WorkspaceDocumentSearchState } from "@/lib/workspace-documents";

vi.mock("@/app/(app)/documents/actions", () => ({ searchWorkspaceDocumentsAction: vi.fn() }));
vi.mock("./workspace-document-download", () => ({ WorkspaceDocumentDownload: ({ organizationId: scope }: { organizationId: string }) =>
  <button data-workspace={scope}>Download this version</button> }));
const organizationId = randomUUID(), documentId = randomUUID(), versionId = randomUUID();
const result: WorkspaceDocumentSearchState = { status: "success", query: "Synthetic", page: { organizationId, correlationId: randomUUID(),
  canUpload: true, nextCursor: null, items: [{ documentId, versionId, version: 1, isCurrent: true, fileName: "Synthetic private.pdf",
    byteSize: 128, contentType: "application/pdf", state: "received", revision: 1, failureCode: null,
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }] } };
beforeEach(() => { vi.mocked(searchWorkspaceDocumentsAction).mockReset().mockResolvedValue(result); });
afterEach(cleanup);
function view(showReview = false) { render(<WorkspaceDocumentSearch organizationId={organizationId} showReview={showReview}><p>Original document page</p></WorkspaceDocumentSearch>); }
function submit(query = "Synthetic") {
  const field = screen.getByRole("searchbox", { name: "Search file names" }); fireEvent.change(field, { target: { value: query } });
  fireEvent.submit(field.closest("form")!);
}
test("keeps the original server page until a private POST search returns", async () => {
  view(); expect(screen.getByText("Original document page")).toBeInTheDocument(); submit();
  await screen.findByRole("heading", { name: "Synthetic private.pdf" }); expect(screen.queryByText("Original document page")).not.toBeInTheDocument();
  const input = vi.mocked(searchWorkspaceDocumentsAction).mock.calls[0][1];
  expect(input.get("query")).toBe("Synthetic"); expect(input.get("organizationId")).toBe(organizationId);
  expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
});
test("shows a visible error and hides prior rows after failure", async () => {
  vi.mocked(searchWorkspaceDocumentsAction).mockResolvedValue({ status: "error" }); view(); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Document search could not finish");
  expect(screen.queryByText("Original document page")).not.toBeInTheDocument();
});
test("shows the empty result and preserves literal untrusted search text safely", async () => {
  const query = "<img src=x onerror=alert(1)>";
  vi.mocked(searchWorkspaceDocumentsAction).mockResolvedValue({ ...result, query, page: { ...result.page, items: [] } });
  view(); submit(query); await screen.findByText("No matching file names were found.");
  expect(document.querySelector("img")).toBeNull(); expect(screen.getByRole("searchbox")).toHaveValue(query);
});
test("binds the exact saved query and continuation to the next POST", async () => {
  vi.mocked(searchWorkspaceDocumentsAction).mockResolvedValue({ ...result, page: { ...result.page, nextCursor: documentId } });
  view(); submit(); const next = await screen.findByRole("button", { name: "Next results" }); fireEvent.submit(next.closest("form")!);
  await waitFor(() => expect(searchWorkspaceDocumentsAction).toHaveBeenCalledTimes(2));
  const input = vi.mocked(searchWorkspaceDocumentsAction).mock.calls[1][1];
  expect(input.get("afterId")).toBe(documentId); expect(input.get("query")).toBe("Synthetic");
});
test("disables controls and shows pending feedback before the result arrives", async () => {
  let finish!: (state: WorkspaceDocumentSearchState) => void;
  vi.mocked(searchWorkspaceDocumentsAction).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  view(); submit(); await screen.findByText("Searching documents.");
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled(); expect(screen.getByRole("searchbox")).toBeDisabled();
  finish(result); await screen.findByRole("heading", { name: "Synthetic private.pdf" });
});

test("keeps approved current file access available after searching", async () => {
  vi.mocked(searchWorkspaceDocumentsAction).mockResolvedValue({ ...result, page: { ...result.page,
    items: [{ ...result.page.items[0], state: "approved" }] } });
  view(); submit();
  expect(await screen.findByRole("button", { name: "Download this version" })).toHaveAttribute("data-workspace", organizationId);
  expect(screen.queryByRole("link", { name: "Review this version" })).not.toBeInTheDocument();
});
test.each([true, false])("retains only the server-selected staff review visibility (%s) after search", async allowed => {
  vi.mocked(searchWorkspaceDocumentsAction).mockResolvedValue({ ...result, page: { ...result.page,
    items: [{ ...result.page.items[0], state: "ready" }] } });
  view(allowed); submit(); await screen.findByRole("heading", { name: "Synthetic private.pdf" });
  expect(screen.queryByRole("link", { name: "Review this version" }) !== null).toBe(allowed);
  expect(screen.queryByRole("button", { name: "Download this version" })).not.toBeInTheDocument();
});
test("keeps historical approved results outside file access", async () => {
  vi.mocked(searchWorkspaceDocumentsAction).mockResolvedValue({ ...result, page: { ...result.page,
    items: [{ ...result.page.items[0], state: "approved", isCurrent: false }] } });
  view(true); submit(); await screen.findByRole("heading", { name: "Synthetic private.pdf" });
  expect(screen.queryByRole("button", { name: "Download this version" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Review this version" })).not.toBeInTheDocument();
});
