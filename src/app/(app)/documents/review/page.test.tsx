import { randomUUID } from "node:crypto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getWorkspaceDocumentReview } from "@/server/commands/workspace-document-review";
import DocumentReviewPage from "./page";

vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {} }));
vi.mock("@/server/commands/workspace-document-review", () => ({ getWorkspaceDocumentReview: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("FORBIDDEN"); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/workflow/workspace-document-review", () => ({ WorkspaceDocumentReview: () => <div>Current review control</div> }));
vi.mock("@/components/workflow/workspace-document-download", () => ({ WorkspaceDocumentDownload: () => <button>Download this version</button> }));
const organizationId = randomUUID(), documentId = randomUUID(), versionId = randomUUID(), supabase = {} as never;
const document = { documentId, versionId, version: 1, revision: 4, isCurrent: true, fileName: "Synthetic original.pdf", byteSize: 128,
  contentType: "application/pdf" as const, state: "ready" as const, failureCode: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
beforeEach(() => {
  vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue({ authorization: { scope: { kind: "organization", organizationId }, supabase } } as never);
  vi.mocked(getWorkspaceDocumentReview).mockReset().mockResolvedValue({ organizationId, correlationId: randomUUID(), document, canReview: true });
});
afterEach(cleanup);
const view = (query: Record<string, string | string[] | undefined> = { document: documentId, version: versionId }) =>
  DocumentReviewPage({ searchParams: Promise.resolve(query) });
test("binds the staff screen to the selected workspace and exact version", async () => {
  render(await view()); expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("rfp.approve");
  expect(getWorkspaceDocumentReview).toHaveBeenCalledWith({ organizationId, documentId, versionId, correlationId: expect.any(String) }, { supabase });
  expect(screen.getByRole("heading", { name: "Document review" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Workspace documents" })).toHaveAttribute("href", "/documents");
});
test.each([{}, { document: documentId }, { document: documentId, version: "bad" }, { document: [documentId], version: versionId },
  { document: documentId, version: versionId, organizationId: randomUUID() }])("rejects invalid or injected review links", async query => {
  await expect(view(query)).rejects.toThrow("NOT_FOUND"); expect(getWorkspaceDocumentReview).not.toHaveBeenCalled();
});
test("stops before any document read when staff permission fails", async () => {
  vi.mocked(requireSelectedOrganizationPermission).mockRejectedValue(new Error("FORBIDDEN"));
  await expect(view()).rejects.toThrow("FORBIDDEN"); expect(getWorkspaceDocumentReview).not.toHaveBeenCalled();
});
test("hides foreign document denial and preserves a service error boundary", async () => {
  vi.mocked(getWorkspaceDocumentReview).mockRejectedValueOnce(new AuthorizationError()); await expect(view()).rejects.toThrow("NOT_FOUND");
  vi.mocked(getWorkspaceDocumentReview).mockRejectedValueOnce(new Error("Document request failed")); await expect(view()).rejects.toThrow("Document request failed");
});
