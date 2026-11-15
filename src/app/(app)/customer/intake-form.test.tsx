import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { CustomerIntakeForm } from "./intake-form";

const { mutate, router } = vi.hoisted(() => ({ mutate: vi.fn(), router: { replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ intakes: { saveDraft: {
  mutationOptions: (options: unknown) => ({ mutationFn: mutate, ...((options ?? {}) as object) }),
} } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const organizationId = "22222222-2222-4222-8222-222222222222";
const intakeId = "33333333-3333-4333-8333-333333333333";
const result = (overrides: Record<string, unknown> = {}) => ({
  intakeId, organizationId, status: "draft", revision: 1,
  outcomeCode: "created", correlationId: "44444444-4444-4444-8444-444444444444", ...overrides,
});
const existingIntake = (overrides: Record<string, unknown> = {}): NonNullable<Parameters<typeof CustomerIntakeForm>[0]["intake"]> => ({
  intakeId, organizationId, status: "draft", revision: 3,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", submittedAt: null,
  data: { companyContext: { legacyFlag: true, customAnswer: "Keep this value\nwith two lines" }, currentSystems: ["Legacy CRM"] }, ...overrides,
} as NonNullable<Parameters<typeof CustomerIntakeForm>[0]["intake"]>);

beforeEach(() => { mutate.mockReset(); router.replace.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderForm(intake?: Parameters<typeof CustomerIntakeForm>[0]["intake"]) {
  render(<QueryClientProvider client={new QueryClient()}><CustomerIntakeForm organizationId={organizationId} intake={intake} /></QueryClientProvider>);
}

test("creates a draft and preserves unknown legacy values and omitted sections", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake());

  expect(screen.getByLabelText("legacyFlag")).toHaveValue("true");
  expect(screen.getByLabelText("customAnswer")).toHaveValue("Keep this value\nwith two lines");
  expect(screen.getByLabelText("Other system")).toHaveValue("Legacy CRM");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0]).toMatchObject({ intakeId, organizationId, expectedRevision: 3, status: "draft" });
  expect(mutate.mock.calls[0]![0].data).toEqual({
    companyContext: { legacyFlag: true, customAnswer: "Keep this value\nwith two lines" }, currentSystems: ["Legacy CRM"],
  });
  expect(router.replace).toHaveBeenCalledWith(`/customer?intake=${intakeId}`);
});

test("creates a new intake with an empty valid answer set", async () => {
  mutate.mockResolvedValue(result({ revision: 1 }));
  renderForm();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0]).toMatchObject({
    intakeId: null, organizationId, expectedRevision: 0, status: "draft", data: {},
  });
  expect(mutate.mock.calls[0]![0].correlationId).toEqual(expect.any(String));
  expect(mutate.mock.calls[0]![0].idempotencyKey).toEqual(expect.any(String));
});

test("saves an optional employee count as a number for estimates", async () => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Number of employees for estimates"), { target: { value: "25" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data.companyContext).toEqual({ estimateEmployeeCountV1: 25 });
});

test("preserves a saved employee count and other company details", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: { companyContext: { estimateEmployeeCountV1: 25, sector: "services" } } }));
  expect(screen.getByLabelText("Number of employees for estimates")).toHaveValue("25");
  expect(screen.getByLabelText("sector")).toHaveValue("services");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data.companyContext).toEqual({ estimateEmployeeCountV1: 25, sector: "services" });
});

test("preserves an unusable old count until the customer changes it", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: { companyContext: { estimateEmployeeCountV1: "unknown" } } }));
  expect(screen.getByLabelText("Number of employees for estimates")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data.companyContext).toEqual({ estimateEmployeeCountV1: "unknown" });
});

test("can replace an unusable old count with a valid one", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: { companyContext: { estimateEmployeeCountV1: "unknown", sector: "services" } } }));
  fireEvent.change(screen.getByLabelText("Number of employees for estimates"), { target: { value: "35" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data.companyContext).toEqual({ estimateEmployeeCountV1: 35, sector: "services" });
});

test("can clear the employee count without removing other answers", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: { companyContext: { estimateEmployeeCountV1: 25, sector: "services" } } }));
  fireEvent.change(screen.getByLabelText("Number of employees for estimates"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data.companyContext).toEqual({ sector: "services" });
});

test("rejects an out-of-range employee count", async () => {
  renderForm();
  fireEvent.change(screen.getByLabelText("Number of employees for estimates"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a whole number from 1 to 10,000,000");
  expect(mutate).not.toHaveBeenCalled();
});

test("does not silently clear a saved count when the new entry is not a number", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: { companyContext: { estimateEmployeeCountV1: 25 } } }));
  fireEvent.change(screen.getByLabelText("Number of employees for estimates"), { target: { value: "many" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a whole number from 1 to 10,000,000");
  expect(mutate).not.toHaveBeenCalled();
});

test("resumes an in-progress intake with its revision and status", async () => {
  mutate.mockResolvedValue(result({ revision: 4, outcomeCode: "updated", status: "in_progress" }));
  renderForm(existingIntake({ status: "in_progress" }));
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0]).toMatchObject({ intakeId, expectedRevision: 3, status: "in_progress" });
});

test("rejects invalid answer limits before calling the server", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: { budget: { Purpose: "Short" } } }));
  fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "x".repeat(2_001) } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("2,000 characters or less");
  expect(mutate).not.toHaveBeenCalled();
});
test("preserves a literal __proto__ map key", async () => {
  mutate.mockResolvedValue(result());
  const legacyMap = Object.fromEntries([["__proto__", "Keep this key"]]);
  renderForm(existingIntake({ data: { companyContext: legacyMap } }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data.companyContext).toEqual(Object.fromEntries([["__proto__", "Keep this key"]]));
  expect(Object.prototype.hasOwnProperty.call(mutate.mock.calls[0]![0].data.companyContext, "__proto__")).toBe(true);
});

test("blocks duplicate saves while the first request is pending", async () => {
  let finish!: (value: unknown) => void;
  mutate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderForm();
  const continueButton = screen.getByRole("button", { name: "Save and continue" });
  fireEvent.click(continueButton);
  fireEvent.click(continueButton);
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Industry")).toBeDisabled();
  finish(result({ status: "in_progress" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalled());
});

test("retries the exact failed request and keeps editing locked", async () => {
  mutate.mockRejectedValueOnce(new Error("private failure")).mockResolvedValueOnce(result({ outcomeCode: "updated", revision: 4 }));
  renderForm(existingIntake());
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("We could not confirm this save. Your answers stay on screen.");
  const first = mutate.mock.calls[0]![0];
  expect(screen.getByLabelText("Industry")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[1]![0]).toEqual(first);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/customer?intake=${intakeId}`));
});

test("routes replayed later revisions to read the saved intake", async () => {
  mutate.mockResolvedValue(result({ outcomeCode: "replayed", revision: 8, status: "submitted" }));
  renderForm(existingIntake());
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/customer?intake=${intakeId}`));
  expect(router.refresh).toHaveBeenCalledTimes(1);
});

test("shows a confirmed-save link when navigation throws after the server succeeds", async () => {
  mutate.mockResolvedValue(result());
  router.replace.mockImplementationOnce(() => { throw new Error("navigation failed"); });
  renderForm();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("heading", { name: "Save confirmed" });
  expect(screen.getByRole("link", { name: "Open saved intake" })).toHaveAttribute("href", `/customer?intake=${intakeId}`);
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
});

test("does not submit when secure request identifiers are unavailable", async () => {
  vi.stubGlobal("crypto", { randomUUID: undefined });
  renderForm();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("secure save request");
  expect(mutate).not.toHaveBeenCalled();
});

test("shows a locked review state for a submitted intake", () => {
  renderForm(existingIntake({ status: "submitted" }));
  expect(screen.getByRole("status")).toHaveTextContent("no longer editable");
  expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
});

test("shows fixed, plainly labeled questions instead of label and answer type editors", () => {
  renderForm();
  for (const label of ["Industry", "Number of employees for estimates", "Anything else about your company", "HR system", "Payroll system",
    "Budget range per year", "Is this budget approved?", "Target start date", "How will the decision be made?", "Who gives final approval?"]) {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  }
  expect(screen.getByRole("group", { name: "US states where you have employees" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Which of these apply?" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Who is involved in the decision?" })).toBeInTheDocument();
  expect(screen.queryByText("Answer type")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/label 1$/)).not.toBeInTheDocument();
  expect(screen.queryByText("Earlier answers")).not.toBeInTheDocument();
});

test("saves guided answers in the existing stored format", async () => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Industry"), { target: { value: " Restaurants " } });
  fireEvent.change(screen.getByLabelText("Number of employees for estimates"), { target: { value: "40" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "TX" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "FL" }));
  fireEvent.change(screen.getByLabelText("HR system"), { target: { value: "Spreadsheets" } });
  fireEvent.change(screen.getByLabelText("Other system"), { target: { value: "Scheduling app" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "ACA reporting" }));
  fireEvent.change(screen.getByLabelText("Budget range per year"), { target: { value: "$10,000 to $25,000" } });
  fireEvent.change(screen.getByLabelText("Is this budget approved?"), { target: { value: "false" } });
  fireEvent.change(screen.getByLabelText("Target start date"), { target: { value: "2027-01-15" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Finance lead" }));
  fireEvent.change(screen.getByLabelText("Other person or team"), { target: { value: "Store managers" } });
  fireEvent.change(screen.getByLabelText("How will the decision be made?"), { target: { value: "A small team agrees" } });
  fireEvent.change(screen.getByLabelText("Anything else about the decision"), { target: { value: "Board sees the final pick." } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data).toEqual({
    companyContext: { industryV1: "Restaurants", estimateEmployeeCountV1: 40, usStatesV1: "FL, TX" },
    currentSystems: ["HR system: Spreadsheets", "Scheduling app"],
    complianceNeeds: ["ACA reporting"],
    budget: { annualBudgetRangeV1: "$10,000 to $25,000", budgetApprovedV1: false },
    timeline: { targetStartDateV1: "2027-01-15" },
    stakeholders: ["Finance lead", "Store managers"],
    decisionProcess: { decisionMethodV1: "A small team agrees", decisionNotesV1: "Board sees the final pick." },
  });
});

test("reopens a guided intake with every answer in its question and saves it unchanged", async () => {
  mutate.mockResolvedValue(result());
  const data = {
    companyContext: { industryV1: "Retail", estimateEmployeeCountV1: 12, usStatesV1: "GA, NY" },
    currentSystems: ["Payroll system: ADP", "Old time clock"],
    complianceNeeds: ["I-9 and E-Verify", "State paid leave"],
    budget: { annualBudgetRangeV1: "Under $10,000", budgetApprovedV1: true },
    timeline: { currentContractEndV1: "2027-06-30" },
    stakeholders: ["HR lead"],
    decisionProcess: { finalApproverV1: "CFO" },
  };
  renderForm(existingIntake({ data }));
  expect(screen.getByLabelText("Industry")).toHaveValue("Retail");
  expect(screen.getByRole("checkbox", { name: "GA" })).toBeChecked();
  expect(screen.getByText("Selected: GA, NY")).toBeInTheDocument();
  expect(screen.getByLabelText("Payroll system")).toHaveValue("ADP");
  expect(screen.getByLabelText("Other system")).toHaveValue("Old time clock");
  expect(screen.getByRole("checkbox", { name: "I-9 and E-Verify" })).toBeChecked();
  expect(screen.getByLabelText("Other compliance need")).toHaveValue("State paid leave");
  expect(screen.getByLabelText("Is this budget approved?")).toHaveValue("true");
  expect(screen.getByLabelText("When does your current contract end?")).toHaveValue("2027-06-30");
  expect(screen.getByRole("checkbox", { name: "HR lead" })).toBeChecked();
  expect(screen.getByLabelText("Who gives final approval?")).toHaveValue("CFO");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data).toEqual(data);
});

test("shows old free-form answers as earlier answers that can be changed or removed", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: {
    budget: { Range: "About 20k", "Approved by board": false, Seats: 15 },
    timeline: { Target: "Next year" },
  } }));
  const budget = within(screen.getByRole("region", { name: "Budget" }));
  expect(budget.getByText("Earlier answers")).toBeInTheDocument();
  expect(budget.getByLabelText("Range")).toHaveValue("About 20k");
  expect(budget.getByLabelText("Approved by board")).toHaveValue("false");
  expect(budget.getByLabelText("Seats")).toHaveValue("15");
  fireEvent.change(budget.getByLabelText("Seats"), { target: { value: "18" } });
  fireEvent.click(budget.getByRole("button", { name: "Remove earlier answer Range from Budget" }));
  fireEvent.change(screen.getByLabelText("Budget range per year"), { target: { value: "$10,000 to $25,000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data).toEqual({
    budget: { annualBudgetRangeV1: "$10,000 to $25,000", "Approved by board": false, Seats: 18 },
    timeline: { Target: "Next year" },
  });
});

test("rejects an earlier number answer that is no longer a number", async () => {
  renderForm(existingIntake({ data: { budget: { Seats: 15 } } }));
  fireEvent.change(screen.getByLabelText("Seats"), { target: { value: "many" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent('Enter a number for "Seats" in Budget.');
  expect(mutate).not.toHaveBeenCalled();
});

test("keeps an unusable saved guided answer until the customer changes it", async () => {
  mutate.mockResolvedValue(result());
  const data = {
    companyContext: { usStatesV1: "Remote only" }, budget: { annualBudgetRangeV1: "Custom range" }, timeline: { targetStartDateV1: "soon" },
  };
  renderForm(existingIntake({ data }));
  expect(screen.getByText("No states selected")).toBeInTheDocument();
  expect(screen.getByLabelText("Budget range per year")).toHaveValue("Custom range");
  expect(screen.getByLabelText("Target start date")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data).toEqual(data);
});

test("clears a saved guided answer when the customer empties it", async () => {
  mutate.mockResolvedValue(result());
  renderForm(existingIntake({ data: { companyContext: { industryV1: "Retail", sector: "services" }, complianceNeeds: ["ACA reporting"] } }));
  fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "  " } });
  fireEvent.click(screen.getByRole("checkbox", { name: "ACA reporting" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data).toEqual({ companyContext: { sector: "services" }, complianceNeeds: [] });
});

test("announces a guided validation error", async () => {
  renderForm();
  fireEvent.change(screen.getByLabelText("Number of employees for estimates"), { target: { value: "12.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a whole number from 1 to 10,000,000");
  expect(mutate).not.toHaveBeenCalled();
});
