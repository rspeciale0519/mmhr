import { describe, expect, test } from "vitest";
import { auditFormInstant, auditSearchFromForm, staffAuditSearchSchema, verifyStaffAuditPage } from "@/lib/staff-audit";
import { auditId, auditPage, auditRow } from "./staff-audit-test-fixture";

describe("staff audit input and safe projection", () => {
  test("preserves six digits and accepts the exact five-field page", () => {
    expect(verifyStaffAuditPage(auditPage(), { organizationId: null, limit: 25 }).rows[0]?.occurredAt)
      .toBe("2026-10-04T12:00:00.123456Z");
  });
  test("orders timestamp ties by ascending ID without losing microseconds", () => {
    const rows = [auditRow(3, "2026-10-04T12:00:00.000002Z"), auditRow(1, "2026-10-04T12:00:00.000001Z"), auditRow(2, "2026-10-04T12:00:00.000001Z")];
    expect(verifyStaffAuditPage(auditPage(null, rows), { organizationId: null, limit: 25 }).rows).toEqual(rows);
    expect(() => verifyStaffAuditPage(auditPage(null, [...rows].reverse()), { organizationId: null, limit: 25 })).toThrow();
  });
  test("accepts an empty authorized page", () => {
    expect(verifyStaffAuditPage(auditPage(null, []), { organizationId: null, limit: 25 })).toEqual(auditPage(null, []));
  });
  test.each(["actorReference", "actorIdentityId", "reason", "beforeSummary", "afterSummary", "correlationId", "sessionId"])(
    "rejects unexpected private row field: %s", field => {
      expect(() => verifyStaffAuditPage({ ...auditPage(), rows: [{ ...auditRow(), [field]: "private" }] }, { organizationId: null, limit: 25 })).toThrow();
    });
  test.each([
    { organizationId: undefined }, { organizationId: "invalid" }, { organizationId: null, limit: 0 },
    { organizationId: null, limit: 101 }, { organizationId: null, limit: 1.5 }, { organizationId: null, actor: {} },
    { organizationId: null, actor: { type: "user", reference: "worker" } },
    { organizationId: null, actor: { type: "worker", identityId: auditId(1) } },
    { organizationId: null, actor: { type: "system", reference: "\nunsafe" } },
    { organizationId: null, occurredFrom: "2026-10-04T12:00:00.000000Z", occurredTo: "2026-10-04T11:59:59.999999Z" },
    { organizationId: null, after: { occurredAt: "2026-10-04T12:00:00.123Z", id: auditId(1) } },
    { organizationId: null, actor: { type: "service_role" } }, { organizationId: null, summary: {} },
  ])("rejects malformed or conflicting input row %#", input => { expect(staffAuditSearchSchema.safeParse(input).success).toBe(false); });
  test("distinguishes user identities from typed machine references", () => {
    expect(staffAuditSearchSchema.parse({ organizationId: null, actor: { type: "user", identityId: auditId(2) } }).actor)
      .toEqual({ type: "user", identityId: auditId(2) });
    for (const type of ["worker", "system", "migration"]) {
      expect(staffAuditSearchSchema.safeParse({ organizationId: null, actor: { type, reference: "known-fixture-reference" } }).success).toBe(true);
    }
  });
  test("rejects wrong scope, duplicate rows, excess rows, and a wrong next cursor", () => {
    const request = { organizationId: null, limit: 1 };
    for (const page of [auditPage(auditId(9)), auditPage(null, [auditRow(), auditRow()]),
      { ...auditPage(), nextCursor: { occurredAt: auditRow().occurredAt, id: auditId(2) } }]) {
      expect(() => verifyStaffAuditPage(page, request)).toThrow();
    }
    expect(() => verifyStaffAuditPage(auditPage(null, [auditRow(), auditRow()]), { organizationId: null, limit: 25 })).toThrow();
  });
  test("validates actor-free row predicates and the previous precise key", () => {
    const row = auditRow();
    expect(() => verifyStaffAuditPage(auditPage(), { organizationId: null, limit: 25, action: "other" })).toThrow();
    expect(() => verifyStaffAuditPage(auditPage(), { organizationId: null, limit: 25, entityId: "other" })).toThrow();
    expect(() => verifyStaffAuditPage(auditPage(), { organizationId: null, limit: 25, entityType: "other" })).toThrow();
    expect(() => verifyStaffAuditPage(auditPage(), { organizationId: null, limit: 25, occurredFrom: "2026-10-04T12:00:00.123457Z" })).toThrow();
    expect(() => verifyStaffAuditPage(auditPage(), { organizationId: null, limit: 25, occurredTo: "2026-10-04T12:00:00.123455Z" })).toThrow();
    expect(() => verifyStaffAuditPage(auditPage(), { organizationId: null, limit: 25, after: { id: row.id, occurredAt: row.occurredAt } })).toThrow();
  });
  test("converts form dates as UTC and rejects invalid calendars", () => {
    expect(auditFormInstant("2026-10-04T12:00")).toBe("2026-10-04T12:00:00.000000Z");
    expect(auditFormInstant("2026-10-04T12:00:00.123456")).toBe("2026-10-04T12:00:00.123456Z");
    expect(auditFormInstant("")).toBeUndefined();
    expect(() => auditFormInstant("2026-02-30T12:00")).toThrow();
    expect(() => auditFormInstant("yesterday")).toThrow();
  });
  test("builds only search fields and does not create a cursor from form input", () => {
    const form = new FormData(); form.set("actorType", "worker"); form.set("actorReference", "known-fixture-reference");
    form.set("limit", "100"); form.set("after", "injected"); form.set("reason", "injected");
    expect(auditSearchFromForm(form, null)).toEqual({ organizationId: null, limit: 100, actor: { type: "worker", reference: "known-fixture-reference" } });
  });
});
