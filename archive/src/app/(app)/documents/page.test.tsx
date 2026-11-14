import { randomUUID } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Owner decision D2 hides this area at launch; src/lib/launch-surface tests cover that guard.
vi.mock("@/lib/launch-surface-guard", () => ({ requireLaunchArea: vi.fn() }));
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { getWorkspaceDocumentHistory, getWorkspaceDocuments, getWorkspaceDocumentVersions } from "@/server/commands/workspace-documents";
import WorkspaceDocuments from "./page";
import DocumentError from "./error";
import DocumentLoading from "./loading";
import { WorkspaceDocumentRowView } from "@/components/workflow/workspace-document-view";
import type { WorkspaceDocumentRow } from "@/lib/workspace-documents";

vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, authorizePermission: vi.fn() }));
vi.mock("@/components/workflow/workspace-document-download", () => ({ WorkspaceDocumentDownload: () => <button>Download this version</button> }));
vi.mock("@/server/commands/workspace-documents", () => ({ getWorkspaceDocuments: vi.fn(), getWorkspaceDocumentVersions: vi.fn(), getWorkspaceDocumentHistory: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, forbidden: () => { throw new Error("FORBIDDEN"); } }));
vi.mock("@/components/workflow/workspace-document-upload", () => ({ WorkspaceDocumentUpload: ({ replacement }: { replacement?: object }) =>
  <div data-testid="document-upload">{replacement ? "Replacement upload" : "New document upload"}</div> }));
const organizationId = randomUUID(), documentId = randomUUID(), versionId = randomUUID(), supabase = {} as never;
const row: WorkspaceDocumentRow = { documentId, versionId, version: 2, isCurrent: true, fileName: "Synthetic document.pdf", contentType: "application/pdf",
  byteSize: 128, state: "received", revision: 1, failureCode: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const page = { organizationId, correlationId: randomUUID(), canUpload: true, items: [row], nextCursor: null };
beforeEach(() => {
  vi.mocked(authorizePermission).mockReset().mockResolvedValue(null);
  vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue({ authorization: { scope: { kind: "organization", organizationId }, supabase } } as never);
  vi.mocked(getWorkspaceDocuments).mockReset().mockResolvedValue(page);
  vi.mocked(getWorkspaceDocumentVersions).mockReset().mockResolvedValue({ ...page, documentId, currentVersion: 2, nextVersion: null });
  vi.mocked(getWorkspaceDocumentHistory).mockReset().mockResolvedValue({ organizationId, correlationId: randomUUID(), documentId, versionId,
    items: [{ revision: 1, action: "reserve", occurredAt: row.createdAt }], nextRevision: null });
});
afterEach(cleanup);
const view = (query: Record<string, string | string[] | undefined> = {}) => WorkspaceDocuments({ searchParams: Promise.resolve(query) });
test("uses only the server-selected workspace and shows safe document status links", async () => {
  render(await view()); expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("workspace.access");
  expect(getWorkspaceDocuments).toHaveBeenCalledWith({ organizationId, correlationId: expect.any(String), afterId: undefined }, { supabase });
  expect(screen.getByRole("heading", { name: "Synthetic document.pdf" })).toBeInTheDocument();
  expect(screen.getByText("Status: Upload not finished")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View versions" })).toHaveAttribute("href", `/documents?document=${documentId}`);
  expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
});
test("hides upload controls for a read-only workspace member", async () => {
  vi.mocked(getWorkspaceDocuments).mockResolvedValueOnce({ ...page, canUpload: false });
  render(await view()); expect(screen.queryByTestId("document-upload")).not.toBeInTheDocument();
});
test.each(["received", "quarantined", "scanning", "ready", "processing", "needs_review", "failed", "superseded"] as const)(
  "does not offer replacement while the current version is %s", async (state) => {
    vi.mocked(getWorkspaceDocumentVersions).mockResolvedValueOnce({ ...page, documentId, currentVersion: 2, nextVersion: null,
      items: [{ ...row, state }] });
    render(await view({ document: documentId })); expect(screen.queryByTestId("document-upload")).not.toBeInTheDocument();
  });
test.each(["approved", "rejected"] as const)("offers a new immutable version after %s review", async (state) => {
  vi.mocked(getWorkspaceDocumentVersions).mockResolvedValueOnce({ ...page, documentId, currentVersion: 2, nextVersion: null,
    items: [{ ...row, state }] });
  render(await view({ document: documentId })); expect(screen.getByTestId("document-upload")).toHaveTextContent("Replacement upload");
});
test.each([{ organizationId: randomUUID() }, { document: documentId, after: randomUUID() }, { version: versionId },
  { afterVersion: "1" }, { afterRevision: "1" }, { document: documentId, version: versionId, afterVersion: "1" },
  { document: documentId, afterVersion: "100001" }, { document: documentId, afterVersion: "1e2" },
  { document: documentId, afterVersion: "" }, { after: [randomUUID(), randomUUID()] }])("rejects invalid or mixed document links", async (query) => {
  await expect(view(query)).rejects.toThrow("NOT_FOUND"); expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test("stops before reading when the page permission fails", async () => {
  vi.mocked(requireSelectedOrganizationPermission).mockRejectedValue(new Error("FORBIDDEN"));
  await expect(view()).rejects.toThrow("FORBIDDEN"); expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test("shows an empty page and bounded document continuation", async () => {
  vi.mocked(getWorkspaceDocuments).mockResolvedValueOnce({ ...page, items: [] });
  render(await view()); expect(screen.getByRole("status")).toHaveTextContent("No documents are recorded"); cleanup();
  const after = randomUUID(); vi.mocked(getWorkspaceDocuments).mockResolvedValueOnce({ ...page, nextCursor: documentId });
  render(await view({ after })); expect(screen.getByRole("link", { name: "Next documents" })).toHaveAttribute("href", `/documents?after=${documentId}`);
  expect(screen.getByRole("link", { name: "First documents" })).toHaveAttribute("href", "/documents");
});
test("shows saved versions with their exact page cursor", async () => {
  vi.mocked(getWorkspaceDocumentVersions).mockResolvedValueOnce({ ...page, documentId, currentVersion: 2, nextVersion: 2 });
  render(await view({ document: documentId, afterVersion: "1" }));
  expect(getWorkspaceDocumentVersions).toHaveBeenCalledWith({ organizationId, correlationId: expect.any(String), documentId, afterVersion: 1 }, { supabase });
  expect(screen.getByRole("heading", { name: "Document versions" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Next versions" })).toHaveAttribute("href", `/documents?document=${documentId}&afterVersion=2`);
  expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test("shows public history summaries with exact version association", async () => {
  render(await view({ document: documentId, version: versionId, afterRevision: "0" }));
  expect(getWorkspaceDocumentHistory).toHaveBeenCalledWith({ organizationId, correlationId: expect.any(String), documentId, versionId, afterRevision: 0 }, { supabase });
  expect(screen.getByRole("heading", { name: "Change 1: Upload recorded" })).toBeInTheDocument();
  expect(screen.getByText(/UTC/)).toBeInTheDocument(); expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test("uses generic not-found behavior when scoped document access changes", async () => {
  vi.mocked(getWorkspaceDocuments).mockRejectedValue(new AuthorizationError());
  await expect(view()).rejects.toThrow("NOT_FOUND");
});
test("lets unexpected service failures reach the generic error boundary", async () => {
  vi.mocked(getWorkspaceDocuments).mockRejectedValue(new Error("Document request failed"));
  await expect(view()).rejects.toThrow("Document request failed");
});
test.each([["ready", "Ready for MMHR review"], ["needs_review", "Waiting for MMHR review"], ["approved", "Approved"],
  ["scanning", "Safety check in progress"], ["superseded", "Earlier version"], ["failed", "Processing failed"]] as const)(
  "shows %s without treating a clean scan as approval", (state, text) => {
    render(<WorkspaceDocumentRowView row={{ ...row, state }} />); expect(screen.getByText(`Status: ${text}`)).toBeInTheDocument();
  });
test("escapes untrusted names and shows a safe failure reason", () => {
  render(<WorkspaceDocumentRowView row={{ ...row, fileName: "<img src=x onerror=alert(1)>.pdf", state: "rejected", failureCode: "unsafe_document" }} />);
  expect(screen.getByRole("heading", { name: "<img src=x onerror=alert(1)>.pdf" })).toBeInTheDocument();
  expect(document.querySelector("img")).toBeNull(); expect(screen.getByRole("status")).toHaveTextContent("The safety check rejected this file.");
});
test("uses generic loading and retry states without private error content", () => {
  render(<DocumentLoading />); expect(screen.getByRole("status")).toHaveTextContent("Loading document information."); cleanup();
  const reset = vi.fn(); render(<DocumentError reset={reset} />); fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce(); expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute("href", "/home");
});
