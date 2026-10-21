import { describe, expect, test } from "vitest";
import { evaluateFactScope, factScopeSchema } from "./fact-scope";

const country = { kind: "country", requirementKey: "configuration", responsePath: ["country"], allowedValues: ["US"] };
const moduleRule = { kind: "module", requirementKey: "configuration", responsePath: ["timeModule"], allowedValues: [true] };
const scope = { version: 1, conditions: [country, moduleRule] };
const answers = (response: unknown) => [{ key: "configuration", response }];

describe("reviewed fact scope", () => {
  test("requires every package and regional condition", () => {
    expect(evaluateFactScope(scope, answers({ country: "US", timeModule: true }))).toBe("match");
    expect(evaluateFactScope(scope, answers({ country: "US", timeModule: false }))).toBe("mismatch");
    expect(evaluateFactScope(scope, answers({ country: "US" }))).toBe("unknown");
  });

  test("a confirmed restriction conflict takes precedence over missing answers", () => {
    expect(evaluateFactScope(scope, answers({ country: "CA" }))).toBe("mismatch");
    expect(evaluateFactScope({ ...scope, conditions: [moduleRule, country] }, answers({ country: "CA" }))).toBe("mismatch");
  });

  test.each([undefined, null, {}, [], "", " "])("does not infer configuration from an unusable answer: %j", (answer) => {
    expect(evaluateFactScope(scope, answers(answer))).toBe("unknown");
  });

  test("requires explicit reviewed unrestricted scope", () => {
    expect(evaluateFactScope(undefined, [])).toBe("unknown");
    expect(evaluateFactScope(null, [])).toBe("unknown");
    expect(evaluateFactScope({ version: 1, conditions: [] }, [])).toBe("match");
  });

  test("preserves typed false and zero answers", () => {
    const typed = { version: 1, conditions: [{ ...moduleRule, allowedValues: [false, 0] }] };
    expect(evaluateFactScope(typed, answers({ timeModule: false }))).toBe("match");
    expect(evaluateFactScope(typed, answers({ timeModule: 0 }))).toBe("match");
    expect(evaluateFactScope(typed, answers({ timeModule: "false" }))).toBe("mismatch");
  });

  test("does not read inherited fields or ambiguous duplicate answers", () => {
    expect(evaluateFactScope(scope, answers(Object.create({ country: "US", timeModule: true })))).toBe("unknown");
    expect(() => evaluateFactScope(scope, [...answers({}), ...answers({})])).toThrow("Duplicate scope requirement");
  });

  test("rejects malformed rules and commercial conditions", () => {
    expect(factScopeSchema.safeParse({ ...scope, unexpected: true }).success).toBe(false);
    expect(factScopeSchema.safeParse({ version: 1, conditions: [{ ...country, allowedValues: [] }] }).success).toBe(false);
    expect(factScopeSchema.safeParse({ version: 1, conditions: [{ ...country, requirementKey: "commission_rate" }] }).success).toBe(false);
  });
});
