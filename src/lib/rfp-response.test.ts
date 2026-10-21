import { expect, test } from "vitest";
import { portalResponseContentSchema, responseFields } from "./rfp-response";
const blank = Object.fromEntries(Object.keys(responseFields).map((key) => [key, []]));
test("accepts the byte boundary and trims statements before validation", () => {
  expect(portalResponseContentSchema.safeParse({ ...blank, caveats: [" " + "é".repeat(1000) + " "] }).success).toBe(true);
  expect(portalResponseContentSchema.safeParse({ ...blank, caveats: ["😀".repeat(501)] }).success).toBe(false);
});
test("enforces the total response byte boundary across fields", () => {
  expect(portalResponseContentSchema.safeParse({ ...blank, caveats: Array(16).fill("x".repeat(2000)) }).success).toBe(true);
  expect(portalResponseContentSchema.safeParse({ ...blank, caveats: Array(17).fill("x".repeat(2000)) }).success).toBe(false);
});
test("rejects empty, blank, untyped, and unknown content", () => {
  for (const response of [blank, { ...blank, caveats: ["\t\u00a0\n"] }, { ...blank, caveats: [1] }, { ...blank, caveats: ["yes"], actorId: "spoofed" }]) {
    expect(portalResponseContentSchema.safeParse(response).success).toBe(false);
  }
});
