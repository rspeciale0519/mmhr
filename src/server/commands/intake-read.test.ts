import { beforeEach, describe, expect, test, vi } from "vitest";

import { requirePermission } from "@/server/auth/authorization";

import { getIntake, getIntakesPage, IntakeReadError } from "./intake-read";

vi.mock("@/server/auth/authorization", () => ({ requirePermission: vi.fn() }));

const organizationId = "22222222-2222-4222-8222-222222222222";
const otherOrganizationId = "99999999-9999-4999-8999-999999999999";
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";
const createdAt = "2026-09-01T10:00:00.000Z";
const updatedAt = "2026-09-01T11:00:00.000Z";

const firstRow = {
  intake_id: firstId,
  organization_id: organizationId,
  status: "draft",
  revision: 1,
  created_at: createdAt,
  updated_at: updatedAt,
};
const secondRow = { ...firstRow, intake_id: secondId, revision: 2 };

const detail = {
  intakeId: firstId,
  organizationId,
  status: "in_progress",
  revision: 2,
  createdAt,
  updatedAt,
  submittedAt: null,
  data: {
    companyContext: { sector: "services", employees: "250" },
    currentSystems: ["Legacy HRIS"],
    complianceNeeds: ["SOC 2"],
    budget: { currency: "USD" },
    timeline: { target: "Q4" },
    stakeholders: ["Finance"],
    decisionProcess: { approvers: "CFO" },
  },
};

const rpc = vi.fn();
const context = {
  supabase: { rpc },
  scope: { kind: "organization", organizationId },
};

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [firstRow], error: null });
  vi.mocked(requirePermission).mockReset().mockResolvedValue(context as never);
});

describe("intake read page", () => {
  test("uses the exact permission-bound RPC and maps summary fields", async () => {
    await expect(getIntakesPage({ organizationId })).resolves.toEqual({
      intakes: [{
        intakeId: firstId,
        organizationId,
        status: "draft",
        revision: 1,
        createdAt,
        updatedAt,
      }],
      nextCursor: null,
    });
    expect(requirePermission).toHaveBeenCalledWith(
      "workspace.access",
      { kind: "organization", organizationId },
      {},
    );
    expect(rpc).toHaveBeenCalledWith("mmhr_get_intakes_page", {
      requested_organization_id: organizationId,
      after_id: null,
      page_size: 25,
    });
  });

  test("uses one look-ahead row as the opaque next cursor", async () => {
    rpc.mockResolvedValueOnce({ data: [firstRow, secondRow], error: null });
    await expect(getIntakesPage({ organizationId, pageSize: 1 })).resolves.toEqual({
      intakes: [{
        intakeId: firstId,
        organizationId,
        status: "draft",
        revision: 1,
        createdAt,
        updatedAt,
      }],
      nextCursor: firstId,
    });

    rpc.mockResolvedValueOnce({ data: [secondRow], error: null });
    await expect(getIntakesPage({ organizationId, afterId: firstId, pageSize: 1 })).resolves.toMatchObject({
      intakes: [{ intakeId: secondId }],
      nextCursor: null,
    });
    expect(rpc).toHaveBeenLastCalledWith("mmhr_get_intakes_page", {
      requested_organization_id: organizationId,
      after_id: firstId,
      page_size: 1,
    });
  });

  test("allows an authorized empty page", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getIntakesPage({ organizationId })).resolves.toEqual({ intakes: [], nextCursor: null });
  });

  test.each([
    null,
    [firstRow, firstRow],
    [{ ...firstRow, organization_id: otherOrganizationId }],
    [{ ...firstRow, status: "unknown" }],
    [{ ...firstRow, revision: 0 }],
    [{ ...firstRow, created_at: "not-a-time" }],
    [{ ...firstRow, extra: "must not cross the boundary" }],
    [secondRow, firstRow],
    [firstRow, secondRow, { ...secondRow, intake_id: "55555555-5555-4555-8555-555555555555" }],
  ])("rejects unsafe, unordered, or oversized page responses %#", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(getIntakesPage({ organizationId, pageSize: 1 })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("rejects rows at or before the cursor", async () => {
    rpc.mockResolvedValue({ data: [firstRow], error: null });
    await expect(getIntakesPage({ organizationId, afterId: firstId })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([0, -1, 51, 1.5])("rejects page size %s before permission lookup", async (pageSize) => {
    await expect(getIntakesPage({ organizationId, pageSize })).rejects.toMatchObject({ code: "REJECTED" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test.each([
    {},
    { organizationId: "not-a-uuid" },
    { organizationId, afterId: "not-a-uuid" },
    { organizationId, actorIdentityId: actorId },
  ])("rejects invalid or authority-bearing page input %#", async (input) => {
    await expect(getIntakesPage(input as never)).rejects.toMatchObject({ code: "REJECTED" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("does not read after authorization failure or a non-organization scope", async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error("authorization denied"));
    await expect(getIntakesPage({ organizationId })).rejects.toThrow("authorization denied");
    expect(rpc).not.toHaveBeenCalled();

    vi.mocked(requirePermission).mockResolvedValueOnce({
      supabase: { rpc },
      scope: { kind: "platform" },
    } as never);
    await expect(getIntakesPage({ organizationId })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("maps transport failure and RPC rejection without exposing details", async () => {
    rpc.mockRejectedValueOnce(new Error("private database details"));
    await expect(getIntakesPage({ organizationId })).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: "Intakes could not be loaded",
    });

    rpc.mockResolvedValueOnce({ data: null, error: { message: "private rejection" } });
    await expect(getIntakesPage({ organizationId })).rejects.toMatchObject({ code: "REJECTED" });
  });
});

describe("intake read detail", () => {
  test("loads bounded legacy data above the stricter new-write wire limit", async () => {
    const companyContext = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`field${index}`, "x".repeat(1_900)]));
    const stored = { ...detail, data: { companyContext } };
    expect(Buffer.byteLength(JSON.stringify(stored.data), "utf8")).toBeGreaterThan(90_000);
    rpc.mockResolvedValueOnce({ data: stored, error: null });
    await expect(getIntake({ organizationId, intakeId: firstId })).resolves.toEqual(stored);
  });
  test("preserves whitespace in stored fields and rejects nested nulls", async () => {
    const stored = { ...detail, data: { companyContext: { " sector ": "  services  " }, currentSystems: [" Legacy HRIS "] } };
    rpc.mockResolvedValueOnce({ data: stored, error: null });
    await expect(getIntake({ organizationId, intakeId: firstId })).resolves.toEqual(stored);
    rpc.mockResolvedValueOnce({ data: { ...detail, data: { companyContext: { sector: null } } }, error: null });
    await expect(getIntake({ organizationId, intakeId: firstId })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("accepts stored padded labels and keys within SQL trimmed bounds", async () => {
    const stored = { ...detail, data: { companyContext: { [` ${"k".repeat(100)} `]: "value" },
      currentSystems: [` ${"x".repeat(200)} `] } };
    rpc.mockResolvedValueOnce({ data: stored, error: null });
    await expect(getIntake({ organizationId, intakeId: firstId })).resolves.toEqual(stored);
  });

  test("counts stored Unicode characters as PostgreSQL does", async () => {
    const stored = { ...detail, data: { companyContext: { ["😀".repeat(100)]: "😀".repeat(2_000) },
      currentSystems: ["😀".repeat(200)] } };
    rpc.mockResolvedValueOnce({ data: stored, error: null });
    await expect(getIntake({ organizationId, intakeId: firstId })).resolves.toEqual(stored);
  });

  test("uses the exact ID-bound RPC and preserves bounded data strings", async () => {
    rpc.mockResolvedValue({ data: detail, error: null });
    await expect(getIntake({ organizationId, intakeId: firstId })).resolves.toEqual(detail);
    expect(requirePermission).toHaveBeenCalledWith(
      "workspace.access",
      { kind: "organization", organizationId },
      {},
    );
    expect(rpc).toHaveBeenCalledWith("mmhr_get_intake", {
      requested_organization_id: organizationId,
      requested_intake_id: firstId,
    });
  });

  test.each([
    null,
    { ...detail, organizationId: otherOrganizationId },
    { ...detail, intakeId: secondId },
    { ...detail, revision: 0 },
    { ...detail, createdAt: "not-a-time" },
    { ...detail, extra: actorId },
    { ...detail, data: { ...detail.data, actorIdentityId: actorId } },
    { ...detail, data: { companyContext: { nested: { forbidden: true } } } },
    { ...detail, data: { currentSystems: [""] } },
  ])("rejects unsafe or ambiguous detail responses %#", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(getIntake({ organizationId, intakeId: firstId })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([
    {},
    { organizationId: "not-a-uuid", intakeId: firstId },
    { organizationId, intakeId: "not-a-uuid" },
    { organizationId, intakeId: firstId, actorIdentityId: actorId },
  ])("rejects invalid or authority-bearing detail input %#", async (input) => {
    await expect(getIntake(input as never)).rejects.toMatchObject({ code: "REJECTED" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("maps detail transport failure and RPC rejection without exposing details", async () => {
    rpc.mockRejectedValueOnce(new Error("private detail"));
    await expect(getIntake({ organizationId, intakeId: firstId })).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: "Intakes could not be loaded",
    });

    rpc.mockResolvedValueOnce({ data: null, error: { message: "private rejection" } });
    await expect(getIntake({ organizationId, intakeId: firstId })).rejects.toMatchObject({ code: "REJECTED" });
  });

  test("exports the documented typed error", () => {
    expect(new IntakeReadError("INVALID_RESPONSE")).toMatchObject({
      name: "IntakeReadError",
      code: "INVALID_RESPONSE",
    });
  });
});
