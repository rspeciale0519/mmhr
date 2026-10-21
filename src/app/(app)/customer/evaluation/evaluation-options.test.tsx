import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PublicationRead } from "@/server/matching/option-publication-contract";
import type { EvaluationSelectionRead } from "@/server/commands/evaluation-selection";
import { EvaluationOptions } from "./evaluation-options";

const { mutate, fetchPage, mutationOptions } = vi.hoisted(() => ({ mutate: vi.fn(), fetchPage: vi.fn(), mutationOptions: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ evaluations: {
  select: { mutationOptions },
  get: { queryOptions: (input: unknown, options: object) => ({ queryKey: ["options", input], queryFn: () => fetchPage(input), ...options }) },
} }) }));
const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const publication: PublicationRead = {
  organizationId: uuid(1), intakeId: uuid(2), publicationId: uuid(3), correlationId: uuid(4),
  sequence: 1, configurationVersion: 1, state: "published", inputDigest: "a".repeat(64),
  optionCount: 6, nextOrdinal: null,
  options: Array.from({ length: 6 }, (_, index) => ({
    optionId: uuid(10 + index), ordinal: index + 1, maskedLabel: `Option ${index + 1}`,
    eligibility: index === 0 ? "unknown" : index === 1 ? "ineligible" : "eligible",
    deterministicScore: index * 1_000, confidenceBasisPoints: index * 1_000,
    fitReasons: [], limitations: ["Payroll evidence needs review"], evidenceFreshAt: null, validUntil: null,
  })),
};
const history: EvaluationSelectionRead = {
  organizationId: publication.organizationId, intakeId: publication.intakeId, correlationId: uuid(5),
  initialCandidateCount: 0, remainingInitialChoices: 5, items: [],
};
type Props = Parameters<typeof EvaluationOptions>[0];
function view(patch: Partial<Props> = {}) {
  return <QueryClientProvider client={new QueryClient()}><EvaluationOptions publication={publication} history={history} canSelect {...patch} /></QueryClientProvider>;
}
function choose(n: number) { fireEvent.click(screen.getByRole("checkbox", { name: `Choose Option ${n}` })); }

test("marks a product saved across publication versions without exposing its identity", () => {
  render(view({ history: { ...history, initialCandidateCount: 1, remainingInitialChoices: 4,
    selectionPublicationId: publication.publicationId, selectedOptionIds: [publication.options[0].optionId] } }));
  expect(screen.getByText("Choice saved")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Choose Option 1" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(5);
});
function review() {
  fireEvent.click(screen.getByRole("button", { name: "Review choices" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Save these initial choices" }));
}
function serverError(code: string) {
  const error = new TRPCClientError("private error details");
  Object.defineProperty(error, "data", { value: { code } });
  return error;
}
beforeEach(() => {
  refresh.mockReset();
  mutate.mockReset().mockResolvedValue({});
  fetchPage.mockReset();
  mutationOptions.mockReset().mockImplementation((options: object) => ({ mutationFn: mutate, ...options }));
  let counter = 100;
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => uuid(counter++)) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("shows all six options and permits unknown and ineligible choices", () => {
  render(view());
  expect(screen.getByText("Showing 6 of 6 options. Comparison version 1.")).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(6);
  choose(1); choose(2); choose(6);
  expect(screen.getByRole("checkbox", { name: "Choose Option 6" })).toBeChecked();
  expect(screen.getByText("3 new choices. 5 initial choices remain.")).toBeInTheDocument();
  expect(mutate).not.toHaveBeenCalled();
});

test("shows requirement labels instead of generated identifiers", () => {
  const key="need_12345678901234567890123456789012";
  render(view({requirementLabels:{[key]:"Payroll processing"},publication:{...publication,
    options:[{...publication.options[0],fitReasons:[key],limitations:[]}],optionCount:1}}));
  expect(screen.getByText("Payroll processing")).toBeInTheDocument();
  expect(screen.queryByText(key)).not.toBeInTheDocument();
});

test("requires explicit review and sends exact opaque choices with a stable request identity", async () => {
  render(view()); choose(3); choose(6);
  fireEvent.click(screen.getByRole("button", { name: "Review choices" }));
  expect(screen.getByRole("button", { name: "Save choices" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Save these initial choices" }));
  fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  await screen.findByText("Your choices are saved.");
  expect(mutate.mock.calls[0][0]).toEqual({
    organizationId: publication.organizationId, intakeId: publication.intakeId, publicationId: publication.publicationId,
    expectedDigest: publication.inputDigest, optionIds: [uuid(12), uuid(15)], correlationId: uuid(100), idempotencyKey: uuid(101),
  });
  expect(screen.getByRole("link", { name: "View saved choices" })).toHaveAttribute("href", `/customer/evaluation?intake=${publication.intakeId}`);
  expect(screen.queryByRole("button", { name: "Save choices" })).not.toBeInTheDocument();
  expect(refresh).toHaveBeenCalledOnce();
});

test("keeps a confirmed result when refreshing saved history fails", async () => {
  refresh.mockImplementation(() => { throw new Error("refresh failed"); });
  render(view()); choose(1); review(); fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  await screen.findByText("Your choices are saved.");
  expect(screen.getByRole("link", { name: "View saved choices" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
});

test("enforces five total choices and permits removing an unsaved choice", () => {
  render(view({ history: { ...history, initialCandidateCount: 3, remainingInitialChoices: 2 } }));
  choose(3); choose(6);
  expect(screen.getByRole("checkbox", { name: "Choose Option 1" })).toBeDisabled();
  choose(3);
  expect(screen.getByRole("checkbox", { name: "Choose Option 1" })).not.toBeDisabled();
  choose(1);
  expect(screen.getByText("2 new choices. 2 initial choices remain.")).toBeInTheDocument();
});

test("does not offer initial changes without permission", () => {
  render(view({ canSelect: false }));
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Review choices" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
});

test("marks saved current options and respects legacy initial candidates", () => {
  render(view({ history: { ...history, initialCandidateCount: 5, remainingInitialChoices: 0,
    items: [{ selectionId: uuid(50), publicationId: publication.publicationId, publicationSequence: 1,
      optionId: uuid(15), candidateId: uuid(51), ordinal: 6, maskedLabel: "Option 6", state: "archived", selectedAt: "2026-09-09T00:00:00Z" }] } }));
  expect(screen.getByText("Choice saved")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Choose Option 6" })).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
});

test("prevents duplicate saves during a pending request", async () => {
  let finish!: () => void;
  mutate.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(view()); choose(6); review();
  const button = screen.getByRole("button", { name: "Save choices" });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(button).toBeDisabled();
  expect(screen.getByRole("button", { name: "Change choices" })).toBeDisabled();
  finish(); await screen.findByText("Your choices are saved.");
});

test("retries an uncertain save without new identifiers or changed choices", async () => {
  mutate.mockRejectedValueOnce(new Error("network"));
  render(view()); choose(3); review(); fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry unchanged request" }));
  await screen.findByText("Your choices are saved.");
  expect(mutate).toHaveBeenCalledTimes(2);
  expect(mutate.mock.calls[1][0]).toEqual(mutate.mock.calls[0][0]);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
});

test.each(["FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "UNAUTHORIZED"])("locks a first rejected save for %s", async (code) => {
  mutate.mockRejectedValue(serverError(code));
  render(view()); choose(1); review(); fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  await screen.findByRole("link", { name: "Review current comparison" });
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
  expect(screen.queryByText("private error details")).not.toBeInTheDocument();
});

test("does not treat rejection after an uncertain attempt as proof of no saved choices", async () => {
  mutate.mockRejectedValueOnce(new Error("network")).mockRejectedValueOnce(serverError("NOT_FOUND"));
  render(view()); choose(1); review(); fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry unchanged request" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  await screen.findByRole("button", { name: "Retry unchanged request" });
  expect(screen.queryByRole("link", { name: "Review current comparison" })).not.toBeInTheDocument();
});

test("returns to choice editing without saving", () => {
  render(view()); choose(3); review(); fireEvent.click(screen.getByRole("button", { name: "Change choices" }));
  choose(3); choose(6);
  expect(screen.getByRole("checkbox", { name: "Choose Option 6" })).toBeChecked();
  expect(mutate).not.toHaveBeenCalled();
});

test("fails safely when secure request identifiers are unavailable", () => {
  vi.stubGlobal("crypto", {});
  render(view()); choose(3); review(); fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  expect(screen.getByRole("alert")).toHaveTextContent("This browser cannot create a secure request");
  expect(mutate).not.toHaveBeenCalled();
});

test("loads later options without limiting the display or losing earlier choices", async () => {
  const first = { ...publication, options: publication.options.slice(0, 3), nextOrdinal: 3 };
  fetchPage.mockImplementation(async (input) => ({ ...publication, options: publication.options.slice(3), correlationId: input.correlationId }));
  render(view({ publication: first })); choose(3);
  fireEvent.click(screen.getByRole("button", { name: "Show more options" }));
  await screen.findByRole("checkbox", { name: "Choose Option 6" });
  expect(screen.getByRole("checkbox", { name: "Choose Option 3" })).toBeChecked();
  expect(fetchPage.mock.calls[0][0]).toMatchObject({ publicationId: publication.publicationId, afterOrdinal: 3, limit: 25 });
  expect(screen.queryByRole("button", { name: "Show more options" })).not.toBeInTheDocument();
});

test.each(["failure", "digest", "duplicate", "scope"])("locks choice submission after a %s page", async (kind) => {
  fetchPage.mockImplementation(async (input) => {
    if (kind === "failure") throw new Error("private details");
    return { ...publication, options: publication.options.slice(3), correlationId: input.correlationId,
      ...(kind === "digest" ? { inputDigest: "b".repeat(64) } : kind === "duplicate" ? { options: publication.options.slice(0, 3) } : { organizationId: uuid(80) }) };
  });
  render(view({ publication: { ...publication, options: publication.options.slice(0, 3), nextOrdinal: 3 } }));
  choose(3); fireEvent.click(screen.getByRole("button", { name: "Show more options" }));
  await screen.findByRole("link", { name: "Reload comparison" });
  expect(screen.getByRole("button", { name: "Review choices" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Choose Option 3" })).toBeDisabled();
  expect(mutate).not.toHaveBeenCalled();
});

test("renders the approved empty comparison without choice actions", () => {
  render(view({ publication: { ...publication, options: [], optionCount: 0 } }));
  expect(screen.getByRole("status")).toHaveTextContent("contains no options");
  expect(screen.getByRole("button", { name: "Review choices" })).toBeDisabled();
});

test("uses a navigable comparison table and counts only required matches", () => {
  render(view({ requirements: [
    { key: "payroll", label: "US payroll", importance: "must" },
    { key: "recruiting", label: "Recruiting", importance: "nice" },
  ], publication: { ...publication, optionCount: 1, options: [{ ...publication.options[0],
    fitReasons: ["recruiting"], limitations: ["payroll"],
  }] } }));
  expect(screen.getByRole("region", { name: "Software comparison" })).toHaveAttribute("tabindex", "0");
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
  expect(within(table).getByRole("rowheader", { name: "US payroll Required" })).toHaveAttribute("scope", "row");
  expect(within(table).getByText("0 of 1")).toBeInTheDocument();
  const payrollRow = within(table).getByRole("rowheader", { name: "US payroll Required" }).closest("tr")!;
  expect(within(payrollRow).getByRole("cell")).toHaveTextContent("Unknown");
  const recruitingRow = within(table).getByRole("rowheader", { name: "Recruiting Nice to have" }).closest("tr")!;
  expect(within(recruitingRow).getByRole("cell")).toHaveTextContent("Match confirmed");
});

test("does not invent prices, setup estimates, or absence from legacy limitations", () => {
  render(view({ publication: { ...publication, optionCount: 1, options: [publication.options[0]] } }));
  for (const name of [/Estimated annual cost/, /Estimated setup/, /Required features met/]) {
    const row = screen.getByRole("rowheader", { name }).closest("tr")!;
    expect(within(row).getByRole("cell")).toHaveTextContent("Unknown");
  }
  expect(screen.queryByText("Not supported")).not.toBeInTheDocument();
});

test("displays published estimates with their basis and distinguishes coverage from fit", () => {
  const evidence = { basis: "evidence" as const, capturedAt: "2026-09-16T00:30:00+14:00",
    reviewedAt: "2026-09-15T11:00:00Z", validUntil: "2026-10-15T10:00:00Z", version: 2 };
  render(view({ requirementLabels: { payroll: "US payroll" }, requirements: [
    { key: "payroll", label: "US payroll", importance: "must" },
  ], publication: { ...publication, optionCount: 1, options: [{ ...publication.options[0],
    fitReasons: ["payroll"], limitations: [], details: {
      version: 1, features: [{ requirementKey: "payroll", outcome: "match", coverage: "add_on", evidence, coverageEvidence: evidence }],
      annualCost: { recurring: { minimum: 12000, maximum: 18000 }, currency: "USD", employeeCount: 100,
        includedModules: ["hr", "payroll"], assumptions: ["annual_billing"], exclusions: ["taxes"],
        oneTime: null, evidence },
      setup: { duration: { minimum: 4, maximum: 8 }, unit: "weeks", scope: "initial_implementation",
        includedModules: ["payroll"], assumptions: ["customer_data_ready"], evidence },
    },
  }] } }));
  const cost = within(screen.getByRole("rowheader", { name: /Estimated annual cost/ }).closest("tr")!);
  expect(cost.getByRole("cell")).toHaveTextContent("USD 12,000.00 – USD 18,000.00 / year");
  expect(cost.getByRole("cell")).toHaveTextContent("100 employees");
  expect(cost.getByRole("cell")).toHaveTextContent("Includes: HR records, Payroll");
  expect(cost.getByRole("cell")).toHaveTextContent("Excludes: Taxes");
  expect(cost.getByRole("cell")).toHaveTextContent("One-time charges: Unknown");
  expect(cost.getByRole("cell")).toHaveTextContent("Captured: 2026-09-15 UTC");
  const setup = within(screen.getByRole("rowheader", { name: /Estimated setup/ }).closest("tr")!);
  expect(setup.getByRole("cell")).toHaveTextContent("4 – 8 weeks");
  expect(setup.getByRole("cell")).toHaveTextContent("Customer data ready");
  const feature = within(screen.getByRole("rowheader", { name: "US payroll Required" }).closest("tr")!);
  expect(feature.getByRole("cell")).toHaveTextContent("Match confirmed");
  expect(feature.getByRole("cell")).toHaveTextContent("Add-on");
  expect(screen.queryAllByRole("link").every((link) => !link.getAttribute("href")?.startsWith("http"))).toBe(true);
});
