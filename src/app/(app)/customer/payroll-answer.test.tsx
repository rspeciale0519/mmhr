import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { emptyPayrollAnswer, PayrollAnswerFields, PayrollAnswerSummary, payrollAnswerSchema } from "./payroll-answer";
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

test("keeps older payroll answers and treats a missing partner choice as unknown", () => {
  const older = { version: 1, requested: "yes", country: "US", workerType: "employee", stateScope: "single", allowPayrollAddOn: false };
  expect(payrollAnswerSchema.parse(older)).toMatchObject({ ...older, allowPayrollPartner: null });
});

test("lets the customer record whether a payroll partner is acceptable", () => {
  const onChange = vi.fn();
  render(<PayrollAnswerFields value={emptyPayrollAnswer} onChange={onChange}/>);
  fireEvent.change(screen.getByRole("combobox", { name: "Would you consider payroll from a partner provider?" }),
    { target: { value: "true" } });
  expect(onChange).toHaveBeenCalledWith({ ...emptyPayrollAnswer, allowPayrollPartner: true });
});
