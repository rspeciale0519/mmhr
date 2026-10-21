import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: vi.fn() }));
const subject = randomUUID(), identityId = randomUUID(), organizationId = randomUUID(), correlationId = randomUUID();
const documentId = randomUUID(), versionId = randomUUID(), rpc = vi.fn(), getClaims = vi.fn();
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "GET", origin: null }, ...overrides }).documents;
}
beforeEach(() => {
  vi.mocked(readSelectedOrganizationId).mockReset().mockResolvedValue(organizationId);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === "mmhr_authorize") return { data: [{ identity_id: identityId, authorized_organization_id: args.organization_id, assurance: "aal1" }], error: null };
    const scope = { organizationId, correlationId, items: [] };
    if (name === "mmhr_get_workspace_document_history") return { data: { ...scope, documentId, versionId, nextRevision: null }, error: null };
    if (name === "mmhr_get_workspace_document_versions") return { data: { ...scope, documentId, canUpload: false, currentVersion: 1, nextVersion: null }, error: null };
    return { data: { ...scope, canUpload: false, nextCursor: null }, error: null };
  });
});

const prepareInput = { organizationId, correlationId, documentId, versionId, expectedVersion: 0, idempotencyKey: randomUUID(),
  fileName: "synthetic.pdf", declaredMimeType: "application/pdf" as const, byteSize: 12, sha256: "a".repeat(64) };
const completeInput = { organizationId, correlationId, documentId, versionId, expectedRevision: 1 as const, idempotencyKey: randomUUID() };
const reviewInput = { organizationId, correlationId, documentId, versionId, expectedRevision: 4, idempotencyKey: randomUUID(),
  action: "begin_review" as const, reason: "Synthetic independent review", reviewReference: "synthetic:review" };
const accessInput = { organizationId, correlationId, documentId, versionId, expectedRevision: 6, idempotencyKey: randomUUID(), purpose: "approved" as const };
function uploadCaller(transport: Context["transport"] = { method: "POST", origin: "http://localhost:3000" }) {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  return caller({ transport });
}
test.each(["prepareUpload", "completeUpload"] as const)("requires exact-origin POST for %s", async (name) => {
  const input = name === "prepareUpload" ? prepareInput : completeInput;
  for (const transport of [undefined, { method: "GET", origin: "http://localhost:3000" },
    { method: "POST", origin: null }, { method: "POST", origin: "https://foreign.example.invalid" }]) {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    await expect(caller({ transport })[name](input as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  expect(rpc).not.toHaveBeenCalled();
});
test.each(["prepareUpload", "completeUpload"] as const)("rejects anonymous and stale selected workspace for %s", async (name) => {
  const input = name === "prepareUpload" ? prepareInput : completeInput;
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  await expect(caller({ user: null, transport: { method: "POST", origin: "http://localhost:3000" } })[name](input as never))
    .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  vi.mocked(readSelectedOrganizationId).mockResolvedValue(randomUUID());
  await expect(uploadCaller()[name](input as never)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([called]) => called === "mmhr_authorize")).toBe(true);
});
test.each(["prepareUpload", "completeUpload"] as const)("rejects injected scan authority for %s", async (name) => {
  const input = name === "prepareUpload" ? prepareInput : completeInput;
  await expect(uploadCaller()[name]({ ...input, scanState: "clean" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each(["prepareUpload", "completeUpload"] as const)("reauthorizes %s and returns only its verified receipt", async (name) => {
  const initial = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (called, args) => called === "mmhr_authorize" ? initial(called, args)
    : { data: { organizationId, correlationId, documentId, versionId, state: name === "prepareUpload" ? "received" : "quarantined",
      revision: name === "prepareUpload" ? 1 : 2, ...(name === "prepareUpload" ? { version: 1 } : {}), outcomeCode: "recorded" }, error: null });
  await expect(uploadCaller()[name]((name === "prepareUpload" ? prepareInput : completeInput) as never))
    .resolves.toMatchObject({ organizationId, documentId, versionId });
  expect(rpc.mock.calls.filter(([called]) => called === "mmhr_authorize")).toHaveLength(2);
});
afterEach(() => vi.unstubAllEnvs());
test.each(["decide", "issueAccess"] as const)("requires exact-origin POST for %s", async name => {
  const input = name === "decide" ? reviewInput : accessInput;
  for (const transport of [undefined, { method: "GET", origin: "http://localhost:3000" },
    { method: "POST", origin: null }, { method: "POST", origin: "https://foreign.example.invalid" }]) {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    await expect(caller({ transport })[name](input as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  expect(rpc).not.toHaveBeenCalled();
});
test.each(["decide", "issueAccess"] as const)("denies anonymous and injected authority for %s", async name => {
  const input = name === "decide" ? reviewInput : accessInput;
  await expect(uploadCaller()[name]({ ...input, actorIdentityId: identityId } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  await expect(caller({ user: null, transport: { method: "POST", origin: "http://localhost:3000" } })[name](input as never))
    .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(rpc).not.toHaveBeenCalled();
});
test("denies a current low-assurance staff review before any document read", async () => {
  await expect(caller().review({ organizationId, documentId, versionId, correlationId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each(["review", "decide", "issueAccess"] as const)("binds %s to the current selected workspace", async name => {
  getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal2" } }, error: null });
  rpc.mockImplementation(async (_called, args) => ({ data: [{ identity_id: identityId, authorized_organization_id: args.organization_id, assurance: "aal2" }], error: null }));
  vi.mocked(readSelectedOrganizationId).mockResolvedValue(randomUUID());
  const input = name === "review" ? { organizationId, documentId, versionId, correlationId } : name === "decide" ? reviewInput : accessInput;
  await expect(uploadCaller()[name](input as never)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([called]) => called === "mmhr_authorize")).toBe(true);
});
test.each(["list", "versions", "history"] as const)("protects %s with verified workspace scope at both boundaries", async (kind) => {
  const input = { organizationId, correlationId, ...(kind === "list" ? {} : { documentId }), ...(kind === "history" ? { versionId } : {}) };
  await expect(caller()[kind](input as never)).resolves.toMatchObject({ organizationId, items: [] });
  const checks = rpc.mock.calls.filter(([name]) => name === "mmhr_authorize");
  expect(checks.map(([, args]) => [args.permission_key, args.organization_id])).toEqual([["workspace.access", organizationId], ["workspace.access", organizationId]]);
});
test("denies anonymous callers and injected read authority", async () => {
  await expect(caller({ user: null }).list({ organizationId, correlationId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(caller().list({ organizationId, correlationId, canUpload: true } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test("conceals database denial, detail, and forged result associations", async () => {
  const authorize = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => name === "mmhr_authorize" ? authorize(name, args) : { error: { code: "42501", message: "private" } });
  await expect(caller().list({ organizationId, correlationId })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Document request failed" });
  rpc.mockImplementation(async (name, args) => name === "mmhr_authorize" ? authorize(name, args)
    : { data: { organizationId: randomUUID(), correlationId, canUpload: false, items: [], nextCursor: null }, error: null });
  await expect(caller().list({ organizationId, correlationId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Document request failed" });
});
