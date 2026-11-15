import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getStaffSubmissionQueue, openStaffCase, StaffSubmissionError } from "./staff-submissions";

vi.mock("@/server/auth/authorization", async (original) => ({
  ...(await original<typeof import("@/server/auth/authorization")>()), requirePermission: vi.fn(),
}));

const intakeId = "11111111-1111-4111-8111-111111111111";
const otherIntakeId = "33333333-3333-4333-8333-333333333333";
const organizationId = "22222222-2222-4222-8222-222222222222";
const correlationId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const submittedAt = "2026-11-14T10:00:00.000000Z";
const rpc = vi.fn();
const item = {
  intakeId, organizationId, organizationName: "Your software search", status: "submitted",
  submittedAt, callerHasAccess: false, staffWithAccess: 0,
};

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requirePermission).mockReset().mockResolvedValue({
    supabase: { rpc }, identityId: "66666666-6666-4666-8666-666666666666",
    scope: { kind: "platform" }, assurance: "aal2", correlationId,
  } as never);
});

describe("staff submission queue", () => {
  test("requires platform staff access and returns the checked page", async () => {
    rpc.mockResolvedValue({ data: { version: 1, items: [item], nextCursor: null }, error: null });
    await expect(getStaffSubmissionQueue({})).resolves.toEqual({ items: [item], nextCursor: null });
    expect(requirePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" }, {});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_staff_submission_queue", { payload: { limit: 25 } });
  });

  test("passes a strict cursor and accepts only a matching next cursor", async () => {
    rpc.mockResolvedValue({ data: { version: 1, items: [item], nextCursor: { submittedAt, intakeId } }, error: null });
    const after = { submittedAt: "2026-11-15T10:00:00.000000Z", intakeId: otherIntakeId.toUpperCase() };
    await expect(getStaffSubmissionQueue({ after, pageSize: 1 })).resolves.toMatchObject({ nextCursor: { submittedAt, intakeId } });
    expect(rpc).toHaveBeenCalledWith("mmhr_get_staff_submission_queue", {
      payload: { limit: 1, after: { submittedAt: after.submittedAt, intakeId: otherIntakeId } },
    });
  });

  test("rejects a cursor that does not match the last row", async () => {
    rpc.mockResolvedValue({ data: { version: 1, items: [item], nextCursor: { submittedAt, intakeId: otherIntakeId } }, error: null });
    await expect(getStaffSubmissionQueue({ pageSize: 1 })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([
    [{ pageSize: 0 }], [{ pageSize: 51 }], [{ after: { submittedAt: "yesterday", intakeId } }], [{ extra: true }],
  ])("rejects invalid input %j before any authorization", async (input) => {
    await expect(getStaffSubmissionQueue(input as never)).rejects.toBeInstanceOf(StaffSubmissionError);
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("denies callers without staff access", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(getStaffSubmissionQueue({})).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("maps database denial and rejects unexpected fields", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(getStaffSubmissionQueue({})).rejects.toBeInstanceOf(AuthorizationError);
    rpc.mockResolvedValueOnce({ data: { version: 1, items: [{ ...item, commission: 1 }], nextCursor: null }, error: null });
    await expect(getStaffSubmissionQueue({})).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(getStaffSubmissionQueue({})).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});

describe("open staff case", () => {
  const input = { intakeId, correlationId, idempotencyKey };
  const result = { intakeId, organizationId, grantId: otherIntakeId, outcomeCode: "opened", correlationId };

  test("sends only the intake reference and returns the server-derived workspace", async () => {
    rpc.mockResolvedValue({ data: result, error: null });
    await expect(openStaffCase(input)).resolves.toEqual(result);
    expect(requirePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" }, { correlationId });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_open_staff_case", {
      payload: { intakeId }, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });

  test.each(["existing", "replayed"])("accepts the %s outcome without a new grant", async (outcomeCode) => {
    rpc.mockResolvedValue({ data: { ...result, outcomeCode, grantId: null }, error: null });
    await expect(openStaffCase(input)).resolves.toMatchObject({ outcomeCode, grantId: null });
  });

  test("rejects a result for a different intake", async () => {
    rpc.mockResolvedValue({ data: { ...result, intakeId: otherIntakeId }, error: null });
    await expect(openStaffCase(input)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("rejects an organization chosen by the caller", async () => {
    await expect(openStaffCase({ ...input, organizationId } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([["42501", AuthorizationError], ["22023", StaffSubmissionError], ["XX000", StaffSubmissionError]])(
    "maps database code %s", async (code, type) => {
      rpc.mockResolvedValue({ data: null, error: { code } });
      await expect(openStaffCase(input)).rejects.toBeInstanceOf(type);
    },
  );

  test("rejects a session below AAL2", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ supabase: { rpc }, scope: { kind: "platform" }, assurance: "aal1" } as never);
    await expect(openStaffCase(input)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
