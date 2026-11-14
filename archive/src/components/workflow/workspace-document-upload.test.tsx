import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createWorkspaceDocumentFileManifest } from "@/lib/workspace-document-upload";
import { WorkspaceDocumentUpload } from "./workspace-document-upload";

const { prepare, complete, upload, from, refresh } = vi.hoisted(() => ({ prepare: vi.fn(), complete: vi.fn(), upload: vi.fn(), from: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ documents: {
  prepareUpload: { mutationOptions: (options: object) => ({ mutationFn: prepare, ...options }) },
  completeUpload: { mutationOptions: (options: object) => ({ mutationFn: complete, ...options }) },
} }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/workspace-document-upload", async (original) => ({ ...await original<object>(), createWorkspaceDocumentFileManifest: vi.fn() }));
const organizationId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  prepare.mockReset().mockResolvedValue({}); complete.mockReset().mockResolvedValue({}); refresh.mockReset();
  from.mockReset().mockReturnValue({ upload });
  upload.mockReset().mockImplementation(async (path) => ({ data: { path, fullPath: `mmhr-document-quarantine/${path}` }, error: null }));
  vi.mocked(createWorkspaceDocumentFileManifest).mockReset().mockResolvedValue({ fileName: "synthetic.pdf", declaredMimeType: "application/pdf",
    byteSize: 12, sha256: "a".repeat(64) });
});
afterEach(cleanup);
function view(replacement?: { documentId: string; expectedVersion: number }) {
  return render(<QueryClientProvider client={new QueryClient()}><WorkspaceDocumentUpload organizationId={organizationId} replacement={replacement} /></QueryClientProvider>);
}
function chooseAndSubmit() {
  const field = screen.getByLabelText("Document file");
  fireEvent.change(field, { target: { files: [new File(["%PDF-example"], "synthetic.pdf", { type: "application/pdf" })] } });
  fireEvent.submit(field.closest("form")!);
}
test("stores privately with exact reserved IDs and queues a check without approval", async () => {
  view(); chooseAndSubmit(); await screen.findByText(/Your private upload is recorded/);
  const input = prepare.mock.calls[0][0];
  expect(upload).toHaveBeenCalledWith(`${organizationId}/${input.documentId}/${input.versionId}`, expect.any(File),
    { contentType: "application/pdf", cacheControl: "0", upsert: false });
  expect(from).toHaveBeenCalledWith("mmhr-document-quarantine");
  expect(complete.mock.calls[0][0]).toMatchObject({ organizationId, documentId: input.documentId, versionId: input.versionId,
    expectedRevision: 1, correlationId: input.correlationId });
  expect(screen.getByLabelText("Document file")).toBeDisabled();
  expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument(); expect(refresh).toHaveBeenCalledTimes(1);
});
test("rejects invalid files before any server or Storage request", async () => {
  vi.mocked(createWorkspaceDocumentFileManifest).mockRejectedValue(new Error("private parse detail"));
  view(); chooseAndSubmit(); expect(await screen.findByRole("alert")).not.toHaveTextContent("private parse detail");
  expect(prepare).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(screen.getByLabelText("Document file")).not.toBeDisabled();
});
test("retries uncertain reservation with unchanged manifest and IDs", async () => {
  prepare.mockRejectedValueOnce(new Error("uncertain")); view(); chooseAndSubmit();
  const retry = await screen.findByRole("button", { name: "Retry the same request" }); expect(upload).not.toHaveBeenCalled();
  fireEvent.click(retry); await screen.findByText(/Your private upload is recorded/);
  expect(prepare.mock.calls[1][0]).toEqual(prepare.mock.calls[0][0]); expect(upload).toHaveBeenCalledTimes(1);
});
test.each(["transport", "reported_error", "wrong_path"])("checks uncertain %s without repeating the original write", async (failure) => {
  if (failure === "transport") upload.mockRejectedValueOnce(new Error("uncertain"));
  else upload.mockResolvedValueOnce(failure === "reported_error" ? { error: { message: "private" }, data: null }
    : { error: null, data: { path: "foreign", fullPath: "foreign" } });
  view(); chooseAndSubmit(); fireEvent.click(await screen.findByRole("button", { name: "Check this upload" }));
  await screen.findByText(/Your private upload is recorded/);
  expect(upload).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1); expect(complete).toHaveBeenCalledTimes(1);
});
test("retries completion with the same receipt and keeps a failed check visible", async () => {
  complete.mockRejectedValueOnce(new Error("unknown")).mockRejectedValueOnce(new Error("still missing"));
  view(); chooseAndSubmit(); fireEvent.click(await screen.findByRole("button", { name: "Check this upload" }));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
  expect(complete.mock.calls[1][0]).toEqual(complete.mock.calls[0][0]); expect(upload).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert")).toHaveTextContent("uncertain"); expect(screen.getByLabelText("Document file")).toBeDisabled();
});
test("blocks duplicate submissions while the preparation is pending", async () => {
  let finish!: () => void; prepare.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  view(); chooseAndSubmit(); await screen.findByText("Preparing the private upload.");
  fireEvent.submit(screen.getByLabelText("Document file").closest("form")!); expect(prepare).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Upload privately" })).toBeDisabled(); finish(); await screen.findByText(/Your private upload is recorded/);
});
test("preserves recorded success after a page refresh failure and permits an explicit new file", async () => {
  refresh.mockImplementation(() => { throw new Error("refresh failed"); }); view(); chooseAndSubmit();
  await screen.findByText("Upload completion is recorded. Reload this page to see the current status.");
  expect(screen.queryByRole("button", { name: "Check this upload" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Upload another file" })); expect(screen.getByLabelText("Document file")).not.toBeDisabled();
});
test("binds a replacement to its current document version", async () => {
  const documentId = "22222222-2222-4222-8222-222222222222";
  view({ documentId, expectedVersion: 2 }); chooseAndSubmit(); await screen.findByText(/Your private upload is recorded/);
  expect(prepare.mock.calls[0][0]).toMatchObject({ organizationId, documentId, expectedVersion: 2 });
  expect(screen.queryByRole("button", { name: "Upload another file" })).not.toBeInTheDocument();
});
