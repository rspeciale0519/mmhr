import { beforeEach, expect, test, vi } from "vitest";
import { requirePermission } from "@/server/auth/authorization";
import { getIntakeRequirementsPage } from "./requirement-read";

vi.mock("@/server/auth/authorization", () => ({ requirePermission: vi.fn() }));
const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const requirementId = "33333333-3333-4333-8333-333333333333";
const nextId = "44444444-4444-4444-8444-444444444444";
const row = { requirement_id: requirementId, organization_id: organizationId, intake_id: intakeId,
  stable_key: "payroll", label: "  Payroll  ", importance: "must", weight: 100, response: { answer: "  Yes  " },
  status: "active", requirement_type: "custom", revision: 1,
  created_at: "2026-09-08T10:00:00Z", updated_at: "2026-09-08T11:00:00Z" };
const rpc = vi.fn();
const supabase = { rpc };
const read = () => getIntakeRequirementsPage({ organizationId, intakeId });
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  vi.mocked(requirePermission).mockReset().mockResolvedValue({ supabase, scope: { kind: "organization", organizationId } } as never);
});

test("uses only the permission-bound client and fixed scoped RPC", async () => {
  const suppliedClient = {} as never;
  const result = await getIntakeRequirementsPage({ organizationId, intakeId }, { supabase: suppliedClient });
  expect(requirePermission).toHaveBeenCalledExactlyOnceWith("workspace.access", { kind: "organization", organizationId }, { supabase: suppliedClient });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_intake_requirements_page", {
    requested_organization_id: organizationId, requested_intake_id: intakeId, after_id: null, page_size: 25,
  });
  expect(result).toEqual({ requirements: [{ requirementId, organizationId, intakeId, stableKey: "payroll", label: "  Payroll  ",
    importance: "must", weight: 100, response: { answer: "  Yes  " }, status: "active", requirementType: "custom", revision: 1,
    createdAt: row.created_at, updatedAt: row.updated_at }], nextCursor: null });
});

test("uses one look-ahead row and returns the last displayed ID as cursor", async () => {
  rpc.mockResolvedValue({ data: [row, { ...row, requirement_id: nextId, stable_key: "benefits" }], error: null });
  const first = await getIntakeRequirementsPage({ organizationId, intakeId, pageSize: 1 });
  expect(first.requirements).toHaveLength(1);
  expect(first.nextCursor).toBe(requirementId);
  rpc.mockResolvedValue({ data: [{ ...row, requirement_id: nextId }], error: null });
  const second = await getIntakeRequirementsPage({ organizationId, intakeId, afterId: requirementId, pageSize: 1 });
  expect(second.requirements[0].requirementId).toBe(nextId);
  expect(second.nextCursor).toBeNull();
});

test("returns an authorized empty page", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await expect(read()).resolves.toEqual({ requirements: [], nextCursor: null });
});

test.each([null, false, 0, "", { answer: "  saved  " }, ["a", "a"]])("preserves saved JSON values: %j", async (response) => {
  rpc.mockResolvedValue({ data: [{ ...row, response }], error: null });
  expect((await read()).requirements[0].response).toEqual(response);
});

test("reads valid saved responses beyond the 8000-byte new-write limit", async () => {
  const response = Array.from({ length: 5 }, () => "a".repeat(1_800));
  expect(Buffer.byteLength(JSON.stringify(response), "utf8")).toBeGreaterThan(8_000);
  rpc.mockResolvedValue({ data: [{ ...row, response }], error: null });
  expect((await read()).requirements[0].response).toEqual(response);
});

test("uses PostgreSQL character counts for stored Unicode labels, keys and answers", async () => {
  const response = { ["😀".repeat(100)]: "😀".repeat(2_000) };
  const label = `  ${"😀".repeat(200)}  `;
  rpc.mockResolvedValue({ data: [{ ...row, label, response }], error: null });
  expect((await read()).requirements[0]).toMatchObject({ label, response });
});

test.each([
  null, {}, [row, row], [{ ...row, organization_id: nextId }], [{ ...row, intake_id: nextId }],
  [{ ...row, status: "archived" }], [{ ...row, revision: 0 }], [{ ...row, weight: 101 }],
  [{ ...row, label: "   " }], [{ ...row, label: "a".repeat(201) }], [{ ...row, importance: "maybe" }],
  [{ ...row, requirement_type: "other" }], [{ ...row, updated_at: "not-a-time" }],
  [{ ...row, owner_identity_id: nextId }], [{ ...row, evidence_references: [] }], [{ ...row, vendor_response_links: [] }],
  [{ ...row, requirement_id: nextId }, row], [row, { ...row, requirement_id: nextId }],
])("rejects unsafe, duplicate or unordered result rows %#", async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  await expect(read()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([undefined, Infinity, BigInt(1), () => 1, new Date(), new Array(1), "a".repeat(2_001),
  { "": true }, { answer: undefined }, Array.from({ length: 51 }, () => null), [[[[[[null]]]]]],
])("rejects non-JSON or oversized saved answers %#", async (response) => {
  rpc.mockResolvedValue({ data: [{ ...row, response }], error: null });
  await expect(read()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("rejects cycles and over-budget escaped text without throwing raw serializer errors", async () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const response of [cycle, Array.from({ length: 50 }, () => "\u0001".repeat(2_000))]) {
    rpc.mockResolvedValue({ data: [{ ...row, response }], error: null });
    await expect(read()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  }
});

test("rejects a response at the cursor and excess look-ahead rows", async () => {
  await expect(getIntakeRequirementsPage({ organizationId, intakeId, afterId: requirementId })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  rpc.mockResolvedValue({ data: [row, { ...row, requirement_id: nextId, stable_key: "second" },
    { ...row, requirement_id: "55555555-5555-4555-8555-555555555555", stable_key: "third" }], error: null });
  await expect(getIntakeRequirementsPage({ organizationId, intakeId, pageSize: 1 })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([{ organizationId, intakeId: "bad" }, { organizationId: "bad", intakeId }, { organizationId, intakeId, afterId: [] },
  { organizationId, intakeId, pageSize: 0 }, { organizationId, intakeId, pageSize: 51 }, { organizationId, intakeId, pageSize: 1.5 },
  { organizationId, intakeId, actorIdentityId: nextId }, { organizationId, intakeId, status: "archived" },
])("rejects invalid or authority-bearing inputs before authorization %#", async (input) => {
  await expect(getIntakeRequirementsPage(input as never)).rejects.toMatchObject({ code: "REJECTED" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test("rejects substituted organization scope before RPC", async () => {
  vi.mocked(requirePermission).mockResolvedValue({ supabase, scope: { kind: "organization", organizationId: nextId } } as never);
  await expect(read()).rejects.toMatchObject({ code: "REJECTED" });
  expect(rpc).not.toHaveBeenCalled();
});

test.each([["42501", "REJECTED"], ["22023", "INVALID_RESPONSE"], ["unexpected", "UNAVAILABLE"]])("redacts RPC failure %s", async (code, expected) => {
  rpc.mockResolvedValue({ data: [row], error: { code, message: "private database details" } });
  await expect(read()).rejects.toMatchObject({ code: expected, message: "Requirements could not be loaded" });
});

test("redacts missing provider responses and transport failures", async () => {
  rpc.mockResolvedValue(undefined);
  await expect(read()).rejects.toMatchObject({ code: "UNAVAILABLE" });
  rpc.mockRejectedValue(new Error("private transport details"));
  await expect(read()).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Requirements could not be loaded" });
});
