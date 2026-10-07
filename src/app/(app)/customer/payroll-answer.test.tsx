import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { emptyPayrollAnswer, PayrollAnswerSummary } from "./payroll-answer";
import { evaluateFactScope } from "@/server/matching/fact-scope";
afterEach(cleanup);

test("shows readable payroll answers without internal version fields", () => {
  render(<PayrollAnswerSummary value={{ ...emptyPayrollAnswer, requested: "yes", country: "US", allowPayrollAddOn: false }} fallback="Legacy answer"/>);
  expect(screen.getByText("Needed")).toBeInTheDocument();
  expect(screen.getByText("Would not consider")).toBeInTheDocument();
  expect(screen.queryByText("version")).not.toBeInTheDocument();
});

test("uses saved typed answers for country and add-on conditions", () => {
  const scope = { version: 1, conditions: [
    { kind: "country", requirementKey: "input_payroll", responsePath: ["country"], allowedValues: ["US"] },
    { kind: "restriction", requirementKey: "input_payroll", responsePath: ["allowPayrollAddOn"], allowedValues: [true] },
  ] };
  const check = (response: unknown) => evaluateFactScope(scope, [{ key: "input_payroll", response }]);
  expect(check(emptyPayrollAnswer)).toBe("unknown");
  expect(check({ ...emptyPayrollAnswer, country: "US", allowPayrollAddOn: false })).toBe("mismatch");
  expect(check({ ...emptyPayrollAnswer, country: "US", allowPayrollAddOn: true })).toBe("match");
  expect(check("yes")).toBe("unknown");
});
