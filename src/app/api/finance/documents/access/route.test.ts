import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { requirePermission } from "@/server/auth/authorization";
import { downloadFinanceDocument } from "@/server/integrations/documents/finance-document-download";
import { POST } from "./route";

vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
vi.mock("@/server/auth/server-action-request", () => ({ hasTrustedMutationOrigin: (origin: string) => origin === "https://mmhr.example.invalid" }));
vi.mock("@/server/integrations/documents/finance-document-download", () => ({ downloadFinanceDocument: vi.fn() }));
const organizationId = randomUUID(), accessId = randomUUID(), supabase = {} as never;
const input = { organizationId, accessId, accessToken: "a".repeat(64), correlationId: randomUUID() };
const bytes = new Uint8Array([1,2,3]);
beforeEach(() => {
  vi.mocked(readSelectedOrganizationId).mockReset().mockResolvedValue(organizationId);
  vi.mocked(requirePermission).mockReset().mockResolvedValue({ supabase } as never);
  vi.mocked(downloadFinanceDocument).mockReset().mockResolvedValue({ bytes, manifest: { fileName: "Résumé's (original).pdf" } } as never);
});
const request = (body: unknown = input, headers: Record<string,string> = {}) => new Request("https://mmhr.example.invalid/api/finance/documents/access", {
  method: "POST", headers: { Origin: "https://mmhr.example.invalid", "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
test("returns a private attachment without leaking its capability into the URL or response headers", async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''R%C3%A9sum%C3%A9%27s%20%28original%29.pdf");
  expect(response.headers.get("content-security-policy")).toContain("sandbox");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(JSON.stringify([...response.headers])).not.toContain(input.accessToken);
  expect(downloadFinanceDocument).toHaveBeenCalledWith({ ...input, correlationId: expect.any(String) }, { supabase });
});
test.each(["https://foreign.example.invalid", "null", ""])("denies untrusted origin %s before any account read", async Origin => {
  const response = await POST(request(input, { Origin })); expect(response.status).toBe(403);
  expect(requirePermission).not.toHaveBeenCalled(); expect(downloadFinanceDocument).not.toHaveBeenCalled();
});
test.each(["missing_workspace", "denied_account", "foreign_workspace", "expired_grant"])("hides %s without file bytes", async failure => {
  let value = input;
  if (failure === "missing_workspace") vi.mocked(readSelectedOrganizationId).mockResolvedValue(null);
  if (failure === "denied_account") vi.mocked(requirePermission).mockRejectedValue(new Error("private identity detail"));
  if (failure === "foreign_workspace") value = { ...input, organizationId: randomUUID() };
  if (failure === "expired_grant") vi.mocked(downloadFinanceDocument).mockRejectedValue(new Error("private provider detail"));
  const response = await POST(request(value)); expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Document request failed" });
});
test.each(["not json", "x".repeat(2049), JSON.stringify({ ...input, actorIdentityId: randomUUID() }), JSON.stringify({ ...input, accessToken: "bad" })])(
  "rejects invalid, oversized, and injected request bodies", async body => {
    const response = await POST(request(body)); expect(response.status).toBe(404); expect(downloadFinanceDocument).not.toHaveBeenCalled();
  });
test("rejects the wrong content type and malformed UTF-8 before any download", async () => {
  expect((await POST(request(input, { "Content-Type": "text/plain" }))).status).toBe(404);
  const malformed = new Request("https://mmhr.example.invalid/api/finance/documents/access", { method: "POST",
    headers: { Origin: "https://mmhr.example.invalid", "Content-Type": "application/json" }, body: new Uint8Array([0xc3,0x28]) });
  expect((await POST(malformed)).status).toBe(404); expect(downloadFinanceDocument).not.toHaveBeenCalled();
});

test("cancels an oversized chunked body before downloading private finance bytes", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(1024)); controller.enqueue(new Uint8Array(1025)); },
    cancel,
  });
  const incoming = {
    headers: new Headers({ Origin: "https://mmhr.example.invalid", "Content-Type": "application/json" }),
    body: stream,
  } as Request;
  const response = await POST(incoming);
  expect(response.status).toBe(404);
  expect(cancel).toHaveBeenCalledOnce();
  expect(downloadFinanceDocument).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({ error: "Document request failed" });
});
