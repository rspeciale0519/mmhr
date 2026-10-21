import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { EvidenceValue } from "./evidence-value";
afterEach(cleanup);

test("separates unrestricted scope from missing scope", () => {
  const view = render(<EvidenceValue fieldKey="comparison_fact_scopes" value="{}"/>);
  expect(screen.getByText(/Missing scope remains unknown/)).toBeInTheDocument();
  view.rerender(<EvidenceValue fieldKey="comparison_fact_scopes" value={JSON.stringify({ payroll: { version: 1, conditions: [] } })}/>);
  expect(screen.getByText(/Source confirms no restrictions/)).toBeInTheDocument();
});

test("shows typed answers and paths without showing a JSON record", () => {
  render(<EvidenceValue fieldKey="comparison_fact_scopes" value={JSON.stringify({ payroll: { version: 1, conditions: [
    { kind: "module", requirementKey: "configuration", responsePath: ["modules", "payroll"], allowedValues: [true, "true", 0] },
  ] } })}/>);
  expect(screen.getByText("Answer field: modules / payroll")).toBeInTheDocument();
  expect(screen.getByText("true (true or false)")).toBeInTheDocument();
  expect(screen.getByText("“true” (text)")).toBeInTheDocument();
  expect(screen.getByText("0 (number)")).toBeInTheDocument();
});

test("keeps invalid records visible with an explicit correction message", () => {
  render(<EvidenceValue fieldKey="comparison_fact_scopes" value="invalid saved data"/>);
  expect(screen.getByRole("alert")).toHaveTextContent("invalid");
  expect(screen.getByText("View stored value")).toBeInTheDocument();
});
