import { describe, expect, test } from "vitest";
import { evaluateWorkEmail } from "./email-domain-policy";

describe("work email policy", () => {
  test("rejects personal domains without a reviewed exception", () => expect(evaluateWorkEmail("person@gmail.com").accepted).toBe(false));
  test("accepts a personal domain only with a bounded review", () => expect(evaluateWorkEmail("person@gmail.com", { reviewerId: "00000000-0000-4000-8000-000000000001", reason: "Verified company exception", approvedAt: "2026-09-03T12:00:00.000Z" })).toMatchObject({ accepted: true, exception: true }));
  test("accepts normal company domains", () => expect(evaluateWorkEmail("person@example.com").accepted).toBe(true));
});
