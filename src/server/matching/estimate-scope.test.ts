import { expect, test } from "vitest";
import { evaluateEstimateScope } from "./fact-scope";

const input = {
  estimateEmployeeCount: 25,
  companyContext: { estimateEmployeeCountV1: 25 },
  scope: { version: 1, conditions: [{ kind: "module", requirementKey: "package",
    responsePath: ["payroll"], allowedValues: [true] }] },
  requirements: [{ key: "package", response: { payroll: true } }],
};

test("accepts a cost estimate only when its employee count and reviewed package conditions match", () => {
  expect(evaluateEstimateScope(input)).toBe("match");
});

test.each([undefined, null, {}, [], { estimateEmployeeCountV1: "25" },
  { estimateEmployeeCountV1: 0 }, { estimateEmployeeCountV1: 25.5 },
  Object.create({ estimateEmployeeCountV1: 25 })])("treats missing or invalid customer counts as unknown: %j", (companyContext) => {
  expect(evaluateEstimateScope({ ...input, companyContext })).toBe("unknown");
});

test("rejects a different count or package and does not infer missing scope", () => {
  expect(evaluateEstimateScope({ ...input, companyContext: { estimateEmployeeCountV1: 26 } })).toBe("mismatch");
  expect(evaluateEstimateScope({ ...input, requirements: [{ key: "package", response: { payroll: false } }] })).toBe("mismatch");
  expect(evaluateEstimateScope({ ...input, requirements: [] })).toBe("unknown");
  expect(evaluateEstimateScope({ ...input, scope: null })).toBe("unknown");
  expect(evaluateEstimateScope({ ...input, companyContext: {}, requirements: [{ key: "package", response: { payroll: false } }] })).toBe("mismatch");
});

test("requires valid approved estimates and reviewed scope", () => {
  expect(() => evaluateEstimateScope({ ...input, estimateEmployeeCount: 0 })).toThrow("Invalid estimate employee count");
  expect(() => evaluateEstimateScope({ ...input, estimateEmployeeCount: 25.5 })).toThrow("Invalid estimate employee count");
  expect(() => evaluateEstimateScope({ ...input, scope: { version: 1, conditions: [{ ...input.scope.conditions[0], allowedValues: [] }] } })).toThrow();
});
