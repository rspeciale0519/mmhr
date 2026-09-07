import { describe, expect, test } from "vitest";
import { authorizeGatedResource } from "./gated-resource-contract";

const base = { resourceId: "hris-landscape-report", subjectId: "00000000-0000-4000-8000-000000000001", workEmail: "person@example.com", consentAt: "2026-09-03T12:00:00.000Z", leadId: "00000000-0000-4000-8000-000000000002", leadStatus: "new" as const };

describe("gated resource contract", () => {
  test("requires an active routed lead and consent", () => expect(authorizeGatedResource(base, new Date("2026-09-03T13:00:00.000Z")).leadId).toBe(base.leadId));
  test("denies unrouted or terminal leads", () => expect(() => authorizeGatedResource({ ...base, leadId: null, leadStatus: null })).toThrow("active routed lead"));
  test("denies future consent", () => expect(() => authorizeGatedResource(base, new Date("2026-09-03T11:00:00.000Z"))).toThrow("future"));
});
