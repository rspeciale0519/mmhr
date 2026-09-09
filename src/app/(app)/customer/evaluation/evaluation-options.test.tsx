import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
