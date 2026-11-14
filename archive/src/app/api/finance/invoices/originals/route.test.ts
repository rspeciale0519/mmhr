import { beforeEach, expect, test, vi } from "vitest";
import { POST } from "./route";
import { ManagedInvoiceOriginalAccessExpiredError } from "@/server/commands/managed-invoice-original";
const { selected, download } = vi.hoisted(() => ({ selected: vi.fn(), download: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: selected }));
vi.mock("@/server/auth/server-action-request", () => ({ hasTrustedMutationOrigin: (origin: string) => origin === "https://mmhr.example.invalid" }));
vi.mock("@/server/commands/managed-invoice-original", () => ({ downloadManagedInvoiceOriginal: download,
  ManagedInvoiceOriginalAccessExpiredError: class extends Error {} }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { organizationId: id(1), commissionEventId: id(2), invoiceId: id(3), preparationId: id(4),
  source: { organizationId: id(5), documentId: id(6), versionId: id(7), sha256: "a".repeat(64) },
  expectedRevision: 6, correlationId: id(8), idempotencyKey: id(9) };
const bytes = new Uint8Array([1, 2, 3]), accessId = id(11);
beforeEach(() => {
  selected.mockReset().mockResolvedValue(input.organizationId);
  download.mockReset().mockResolvedValue({ bytes, reviewedAccessId: accessId,
    manifest: { fileName: "Résumé's (original).pdf", accessToken: "must-not-leak" } });
});
const request = (body: unknown = input, headers: Record<string, string> = {}) => new Request("https://mmhr.example.invalid/api/finance/invoices/originals", {
  method: "POST", headers: { Origin: "https://mmhr.example.invalid", "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body) });
test("streams private bytes and only the non-secret reviewed access ID", async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("x-mmhr-reviewed-access-id")).toBe(accessId);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(response.headers.get("content-length")).toBe("3");
  expect(response.headers.get("content-disposition")).toContain("R%C3%A9sum%C3%A9%27s%20%28original%29.pdf");
  expect(response.headers.get("content-security-policy")).toContain("sandbox");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(JSON.stringify([...response.headers])).not.toContain("must-not-leak");
  expect(download).toHaveBeenCalledWith(input);
});
test.each(["https://foreign.example.invalid", "null", ""])("denies origin %s before identity or document reads", async Origin => {
  expect((await POST(request(input, { Origin }))).status).toBe(403);
  expect(selected).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
});
test.each(["missing", "foreign", "revoked", "changed_selection"])("denies %s without bytes or access ID", async mode => {
  if (mode === "missing") selected.mockResolvedValue(null);
  if (mode === "foreign") selected.mockResolvedValue(id(99));
  if (mode === "revoked") download.mockRejectedValue(new Error("Private source details"));
  if (mode === "changed_selection") selected.mockResolvedValueOnce(input.organizationId).mockResolvedValueOnce(id(99));
  const response = await POST(request()); expect(response.status).toBe(404);
  expect(response.headers.get("x-mmhr-reviewed-access-id")).toBeNull();
  expect(await response.json()).toEqual({ error: "Invoice original request failed" });
});
test("permits an explicit fresh-access action after verified grant expiry", async () => {
  download.mockRejectedValue(new ManagedInvoiceOriginalAccessExpiredError());
  const response = await POST(request()); expect(response.status).toBe(410);
  expect(response.headers.get("x-mmhr-reviewed-access-id")).toBeNull();
  expect(await response.json()).toEqual({ error: "Invoice original request failed" });
});
test.each(["not json", "x".repeat(2049), { ...input, accessToken: "forged" }, { ...input, expectedRevision: 0 }])(
  "rejects malformed, excessive or injected input before download", async body => {
    expect((await POST(request(body))).status).toBe(404); expect(download).not.toHaveBeenCalled();
  });
test("rejects wrong content type and malformed UTF-8", async () => {
  expect((await POST(request(input, { "Content-Type": "text/plain" }))).status).toBe(404);
  const malformed = new Request("https://mmhr.example.invalid/api/finance/invoices/originals", { method: "POST",
    headers: { Origin: "https://mmhr.example.invalid", "Content-Type": "application/json" }, body: new Uint8Array([0xc3, 0x28]) });
  expect((await POST(malformed)).status).toBe(404); expect(download).not.toHaveBeenCalled();
});
test("cancels an oversized streaming body", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2049)); }, cancel });
  const streamed = new Request("https://mmhr.example.invalid/api/finance/invoices/originals", { method: "POST",
    headers: { Origin: "https://mmhr.example.invalid", "Content-Type": "application/json" }, body, duplex: "half" } as RequestInit);
  expect((await POST(streamed)).status).toBe(404); expect(cancel).toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
});
