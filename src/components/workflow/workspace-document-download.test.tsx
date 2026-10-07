import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WorkspaceDocumentDownload } from "./workspace-document-download";
import type { WorkspaceDocumentRow } from "@/lib/workspace-documents";

const { issue } = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ documents: { issueAccess: {
  mutationOptions: (options: object) => ({ mutationFn: issue, ...options }),
} } }) }));
const organizationId = "11111111-1111-4111-8111-111111111111", documentId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333", accessId = "44444444-4444-4444-8444-444444444444";
const row: WorkspaceDocumentRow = { documentId, versionId, version: 1, isCurrent: true, state: "needs_review", revision: 5,
  fileName: "Synthetic original.pdf", contentType: "application/pdf", byteSize: 12, failureCode: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const fetchFile = vi.fn(), createObjectURL = vi.fn(), revokeObjectURL = vi.fn(), ready = vi.fn();
beforeEach(() => {
  issue.mockReset().mockImplementation(async input => {
    const issuedAt = new Date().toISOString();
    return { organizationId, documentId, versionId, revision: 5, purpose: "review", correlationId: input.correlationId,
      accessId, accessToken: "a".repeat(64), issuedAt, expiresAt: new Date(Date.parse(issuedAt)+60_000).toISOString(), outcomeCode: "recorded" };
  });
  fetchFile.mockReset().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/octet-stream", "content-length": "12" }),
    blob: async () => new Blob([new Uint8Array(12)]) });
  createObjectURL.mockReset().mockReturnValue("blob:https://mmhr.example.invalid/private-file"); revokeObjectURL.mockReset(); ready.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  vi.stubGlobal("fetch", fetchFile); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function view() { return render(<QueryClientProvider client={new QueryClient()}>
  <WorkspaceDocumentDownload organizationId={organizationId} document={row} purpose="review" onAccessReady={ready} />
</QueryClientProvider>); }
test("requests scoped access, posts its token privately, and starts an attachment download", async () => {
  view(); fireEvent.click(screen.getByRole("button", { name: "Download this version" })); await screen.findByText(/Download started/);
  expect(issue.mock.calls[0][0]).toMatchObject({ organizationId, documentId, versionId, expectedRevision: 5, purpose: "review" });
  expect(fetchFile.mock.calls[0][0]).toBe("/api/documents/access");
  const request = fetchFile.mock.calls[0][1]; expect(request).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" });
  expect(JSON.parse(request.body)).toMatchObject({ accessId, accessToken: "a".repeat(64) });
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce(); expect(ready).toHaveBeenCalledWith(accessId);
});
test("retries an uncertain grant with the same request and no automatic repeat", async () => {
  issue.mockRejectedValueOnce(new Error("private provider error")); view(); fireEvent.click(screen.getByRole("button", { name: "Download this version" }));
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private provider error"); expect(fetchFile).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged access request" })); await screen.findByText(/Download started/);
  expect(issue.mock.calls[1][0]).toEqual(issue.mock.calls[0][0]);
});
test.each(["denied", "wrong_type", "wrong_length", "wrong_bytes", "transport"])("does not open %s file responses", async failure => {
  if (failure === "transport") fetchFile.mockRejectedValue(new Error("private transport detail"));
  else fetchFile.mockResolvedValue({ ok: failure !== "denied", headers: new Headers({ "content-type": failure === "wrong_type" ? "text/html" : "application/octet-stream",
    "content-length": failure === "wrong_length" ? "13" : "12" }), blob: async () => new Blob([new Uint8Array(failure === "wrong_bytes" ? 13 : 12)]) });
  view(); fireEvent.click(screen.getByRole("button", { name: "Download this version" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The file could not download"); expect(ready).not.toHaveBeenCalled();
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
test("reuses the known grant for a failed read and uses a fresh request only on explicit choice", async () => {
  fetchFile.mockRejectedValueOnce(new Error("uncertain read")); view(); fireEvent.click(screen.getByRole("button", { name: "Download this version" }));
  await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "Download this version" })); await screen.findByText(/Download started/);
  expect(issue).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Download this version" })); await screen.findByText(/Download started/);
  expect(issue).toHaveBeenCalledTimes(2); expect(issue.mock.calls[1][0].idempotencyKey).not.toBe(issue.mock.calls[0][0].idempotencyKey);
});
test("keeps pending access disabled and removes the temporary object URL on unmount", async () => {
  let finish!: (value: unknown) => void;
  fetchFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const rendered = view();
  fireEvent.click(screen.getByRole("button", { name: "Download this version" })); await screen.findByRole("button", { name: "Preparing download…" });
  expect(screen.getByRole("button", { name: "Preparing download…" })).toBeDisabled();
  await vi.waitFor(() => expect(fetchFile).toHaveBeenCalledOnce());
  finish({ ok: true, headers: new Headers({ "content-type": "application/octet-stream", "content-length": "12" }), blob: async () => new Blob([new Uint8Array(12)]) });
  await screen.findByText(/Download started/); rendered.unmount(); expect(revokeObjectURL).toHaveBeenCalledOnce();
});
