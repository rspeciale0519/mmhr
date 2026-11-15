import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { IntakeDetails } from "./intake-views";

type Intake = Parameters<typeof IntakeDetails>[0]["intake"];
const intake = (data: Intake["data"]): Intake => ({
  intakeId: "22222222-2222-4222-8222-222222222222", organizationId: "11111111-1111-4111-8111-111111111111",
  status: "in_progress", revision: 2, createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T12:00:00Z", submittedAt: null, data,
} as Intake);

afterEach(cleanup);

test("shows guided answers with their questions for customers and staff", () => {
  for (const staffView of [false, true]) {
    render(<IntakeDetails staffView={staffView} intake={intake({
      companyContext: { usStatesV1: "FL, TX", industryV1: "Retail", estimateEmployeeCountV1: 40 },
      budget: { budgetApprovedV1: false, annualBudgetRangeV1: "Under $10,000" },
      timeline: { targetStartDateV1: "2027-01-15" },
      currentSystems: ["HR system: Spreadsheets"],
    })} />);
    const company = within(screen.getByRole("region", { name: "Company context" }));
    expect(company.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Industry", "Number of employees for estimates", "US states where you have employees",
    ]);
    expect(company.getByText("FL, TX")).toBeInTheDocument();
    expect(company.queryByText("industryV1")).not.toBeInTheDocument();
    const budget = within(screen.getByRole("region", { name: "Budget" }));
    expect(budget.getByText("Is this budget approved?")).toBeInTheDocument();
    expect(budget.getByText("No")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Timeline" })).getByText("January 15, 2027")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Current systems" })).getByText("HR system: Spreadsheets")).toBeInTheDocument();
    cleanup();
  }
});

test("still shows an old-format intake exactly as saved", () => {
  render(<IntakeDetails intake={intake({
    companyContext: { Sector: "services", Remote: true }, budget: { Limit: 0 }, timeline: { Target: "Next year" },
    decisionProcess: { Approval: "Team review" }, stakeholders: ["Operations"],
  })} />);
  const company = within(screen.getByRole("region", { name: "Company context" }));
  expect(company.getByText("Sector")).toBeInTheDocument();
  expect(company.getByText("services")).toBeInTheDocument();
  expect(company.getByText("Yes")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Budget" })).getByText("0")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Timeline" })).getByText("Next year")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Decision process" })).getByText("Approval")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Compliance needs" })).getByText("Not provided")).toBeInTheDocument();
});
