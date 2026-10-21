import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InvoiceOriginalDownload } from "./invoice-original-download";
import { invoiceDetail, invoiceId } from "./managed-invoice-ui-fixtures";
const fetchMock = vi.fn(), onAccessReady = vi.fn(), click = vi.fn();
const OriginalURL = URL;
function response(options: { status?: number; type?: string; length?: string; access?: string; size?: number } = {}) {
  const headers = new Map([["content-type", options.type ?? "application/octet-stream"], ["content-length", options.length ?? "3"],
    ["X-MMHR-Reviewed-Access-Id", options.access ?? invoiceId(40)]]);
  return { ok: (options.status ?? 200) === 200, status: options.status ?? 200, headers: { get: (key: string) => headers.get(key) ?? null },
    blob: async () => new Blob(["x".repeat(options.size ?? 3)]) };
}
function mount() {
  const detail = invoiceDetail("pending"), original = detail.currentPreparation!.supportingOriginals[1];
  return render(<InvoiceOriginalDownload detail={detail} original={original} locked={false} onAccessReady={onAccessReady} />);
}
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(response()); onAccessReady.mockReset(); click.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", class extends OriginalURL { static createObjectURL = vi.fn(() => "blob:synthetic-invoice"); static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test("downloads exact internal original through invoice authority and returns only the reviewed access ID", async () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Download this invoice original" }));
  await screen.findByText(/Download started/); expect(onAccessReady).toHaveBeenCalledWith(invoiceId(40)); expect(click).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0]; expect(url).toBe("/api/finance/invoices/originals");
  expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" });
  const request = JSON.parse(options.body); const original = invoiceDetail("pending").currentPreparation!.supportingOriginals[1];
  expect(request).toMatchObject({ organizationId: invoiceId(1), invoiceId: invoiceId(5), preparationId: invoiceId(7), expectedRevision: original.document.revision,
    source: { organizationId: original.organizationId, documentId: original.documentId, versionId: original.versionId, sha256: original.sha256 } });
  expect(request).not.toHaveProperty("accessToken"); expect(request).not.toHaveProperty("actorIdentityId");
});
test("retains exact original access request after uncertainty and blocks simultaneous retries", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Response lost")); mount(); fireEvent.click(screen.getByRole("button", { name: "Download this invoice original" }));
  const retry = await screen.findByRole("button", { name: "Retry unchanged original access" }); const original = fetchMock.mock.calls[0][1].body;
  act(() => { fireEvent.click(retry); fireEvent.click(retry); }); await screen.findByText(/Download started/);
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(fetchMock.mock.calls[1][1].body).toBe(original);
});
test.each([{ access: "invalid" }, { type: "text/html" }, { length: "4" }, { size: 2 }, { status: 503 }])("rejects incomplete original response %j without a review callback", async fields => {
  fetchMock.mockResolvedValue(response(fields)); mount(); fireEvent.click(screen.getByRole("button", { name: "Download this invoice original" }));
  await screen.findByRole("button", { name: "Retry unchanged original access" }); expect(onAccessReady).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
test.each([401, 403, 404, 409])("blocks unsafe retry after confirmed response %s", async status => {
  fetchMock.mockResolvedValue(response({ status })); mount(); fireEvent.click(screen.getByRole("button", { name: "Download this invoice original" }));
  await screen.findByRole("alert"); expect(screen.queryByRole("button", { name: "Retry unchanged original access" })).not.toBeInTheDocument();
  expect(onAccessReady).not.toHaveBeenCalled();
});
test("offers explicit fresh access after confirmed expiry without replacing unknown requests", async () => {
  fetchMock.mockResolvedValueOnce(response({ status: 410 })); mount(); fireEvent.click(screen.getByRole("button", { name: "Download this invoice original" }));
  const original = fetchMock.mock.calls[0][1].body; fireEvent.click(await screen.findByRole("button", { name: "Request fresh original access" }));
  await screen.findByText(/Download started/); const next = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(next.idempotencyKey).not.toBe(JSON.parse(original).idempotencyKey); expect(next.correlationId).not.toBe(JSON.parse(original).correlationId);
  expect(next.source).toEqual(JSON.parse(original).source);
});
test("does not download while the invoice command is locked", () => {
  const detail = invoiceDetail("pending"); render(<InvoiceOriginalDownload detail={detail} original={detail.currentPreparation!.supportingOriginals[0]}
    locked onAccessReady={onAccessReady} />); expect(screen.getByRole("button", { name: "Download this invoice original" })).toBeDisabled(); expect(fetchMock).not.toHaveBeenCalled();
});
