import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject = randomUUID(), identityId = randomUUID(), organizationId = randomUUID();
const vendorProfileId = randomUUID(), sourceId = randomUUID(), factId = randomUUID(), evidenceId = randomUUID();
const approvalId = randomUUID(), origin = "https://mmhr.example";
const timestamp = "2026-09-15T10:00:00Z";
const record = {
  source: { sourceId, organizationId, vendorProfileId, uri: "https://vendor.example/evidence", sourceType: "manual" as const,
    licenseNote: null, capturedAt: timestamp, active: true },
  fact: { factId, organizationId, vendorProfileId, productId: null, fieldKey: "payroll", value: "yes",
    observedAt: timestamp, status: "draft" as const },
  evidence: { evidenceId, organizationId, factId, sourceId, version: 1, contentHash: "a".repeat(64),
    capturedAt: timestamp, freshUntil: "2026-10-15T10:00:00Z", citation: "Payroll module specification" },
};
const decision = { approvalId, organizationId, evidenceId, decision: "approved" as const, decidedAt: timestamp, reason: "Reviewed source" };
const rpc = vi.fn(), getClaims = vi.fn();
function caller(patch: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...patch }).vendorEvidence;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === "mmhr_authorize") return { data: [{ identity_id: identityId,
      authorized_organization_id: args.organization_id, assurance: "aal2" }], error: null };
    return { data: { sourceId, factId, evidenceId, organizationId,
      approvalId: name === "mmhr_approve_vendor_evidence" ? approvalId : null,
      correlationId: name === "mmhr_approve_vendor_evidence" ? approvalId : evidenceId,
      outcomeCode: name === "mmhr_approve_vendor_evidence" ? "decided" : "recorded" }, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

test("records through the existing command after workspace and staff checks", async () => {
  await expect(caller().record(record)).resolves.toMatchObject({ outcomeCode: "recorded" });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, args]) => args.permission_key))
    .toEqual(["workspace.access", "admin.access", "workspace.access"]);
  expect(rpc).toHaveBeenLastCalledWith("mmhr_record_vendor_evidence", {
    payload: record, correlation_id: evidenceId, idempotency_key: evidenceId,
  });
});
test("binds the evidence decision to the authorized reviewer", async () => {
  await expect(caller().decide(decision)).resolves.toMatchObject({ outcomeCode: "decided" });
  expect(rpc).toHaveBeenLastCalledWith("mmhr_approve_vendor_evidence", {
    payload: { ...decision, reviewerIdentityId: identityId }, correlation_id: approvalId, idempotency_key: approvalId,
  });
});

test("activates a product through the existing scoped and revision-checked command", async () => {
  const productId = randomUUID(), idempotencyKey = randomUUID();
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation((name, args) => name === "mmhr_update_product" ? Promise.resolve({ error: null,
    data: { operation: "update_product", recordId: productId, organizationId, revision: 3, outcomeCode: "updated", correlationId: randomUUID() } }) : original(name, args));
  await expect(caller().activateProduct({ organizationId, productId, expectedRevision: 2, idempotencyKey }))
    .resolves.toMatchObject({ revision: 3 });
  expect(rpc).toHaveBeenLastCalledWith("mmhr_update_product", {
    payload: { organizationId, productId, expectedRevision: 2, idempotencyKey, status: "active" },
    correlation_id: expect.any(String), idempotency_key: idempotencyKey,
  });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, args]) => args.permission_key))
    .toEqual(["workspace.access", "admin.access", "workspace.access"]);
});

test("rejects an activation status override before calling the database", async () => {
  await expect(caller().activateProduct({ organizationId, productId: randomUUID(), expectedRevision: 1,
    idempotencyKey: randomUUID(), status: "archived" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});

test("approves a catalog profile with current revision and server authority", async () => {
  const profileId=randomUUID(),idempotencyKey=randomUUID();
  const original=rpc.getMockImplementation()!;
  rpc.mockImplementation((name,args) => name==="mmhr_approve_vendor_catalog_profile" ? Promise.resolve({error:null,
    data:{organizationId,profileId,revision:2,status:"active",approvedAt:timestamp,outcomeCode:"approved",correlationId:idempotencyKey}}) : original(name,args));
  await expect(caller().approveProfile({organizationId,profileId,expectedRevision:1,reason:"Reviewed catalog",approvalReference:"review:test",idempotencyKey}))
    .resolves.toMatchObject({revision:2});
  expect(rpc).toHaveBeenLastCalledWith("mmhr_approve_vendor_catalog_profile",{payload:{organizationId,profileId,expectedRevision:1,reason:"Reviewed catalog",approvalReference:"review:test"},correlation_id:idempotencyKey,idempotency_key:idempotencyKey});
});
test("rejects a caller-supplied catalog approval identity", async () => {
  await expect(caller().approveProfile({organizationId,profileId:randomUUID(),expectedRevision:1,reason:"Reviewed",approvalReference:"review:test",idempotencyKey:randomUUID(),approvedByIdentityId:identityId} as never))
    .rejects.toMatchObject({code:"BAD_REQUEST"});
  expect(rpc).not.toHaveBeenCalled();
});
test("rejects a supplied reviewer identity", async () => {
  await expect(caller().decide({ ...decision, reviewerIdentityId: randomUUID() } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test("denies a workspace user without staff access", async () => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation((name, args) => args.permission_key === "admin.access"
    ? Promise.resolve({ data: [], error: null }) : original(name, args));
  await expect(caller().record(record)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("denies an unsafe mutation origin", async () => {
  await expect(caller({ transport: { method: "POST", origin: "https://other.example" } }).record(record))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc).not.toHaveBeenCalled();
});
test("does not return private provider errors", async () => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation((name, args) => name === "mmhr_authorize" ? original(name, args)
    : Promise.resolve({ data: null, error: { message: "private source detail" } }));
  await expect(caller().record(record)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Vendor evidence request failed" });
});
