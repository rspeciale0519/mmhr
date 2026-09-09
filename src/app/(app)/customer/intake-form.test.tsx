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

  expect(screen.getByLabelText("Company context label 1")).toHaveValue("legacyFlag");
  expect(screen.getByLabelText("Company context answer 1")).toHaveValue("true");
  expect(screen.getByLabelText("Company context answer 2")).toHaveValue("Keep this value\nwith two lines");
  expect(screen.getByLabelText("Current systems answer 1")).toHaveValue("Legacy CRM");
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
  renderForm();
  fireEvent.change(screen.getByLabelText("Company context label 1"), { target: { value: "Purpose" } });
  fireEvent.change(screen.getByLabelText("Company context answer 1"), { target: { value: "x".repeat(2_001) } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("2,000 characters or less");
  expect(mutate).not.toHaveBeenCalled();
});

test("rejects trim-equivalent labels instead of overwriting an answer", async () => {
  renderForm();
  const company = screen.getByRole("region", { name: "Company context" });
  fireEvent.change(screen.getByLabelText("Company context label 1"), { target: { value: "Owner" } });
  fireEvent.change(screen.getByLabelText("Company context answer 1"), { target: { value: "First" } });
  fireEvent.click(within(company).getByRole("button", { name: "Add answer" }));
  fireEvent.change(screen.getByLabelText("Company context label 2"), { target: { value: " Owner " } });
  fireEvent.change(screen.getByLabelText("Company context answer 2"), { target: { value: "Second" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("duplicate labels");
  expect(mutate).not.toHaveBeenCalled();
});

test("stores an explicit No choice as false", async () => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Budget label 1"), { target: { value: "Uses approval" } });
  fireEvent.change(screen.getByLabelText("Budget answer type 1"), { target: { value: "boolean" } });
  fireEvent.change(screen.getByLabelText("Budget answer 1"), { target: { value: "false" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0]![0].data.budget).toEqual({ "Uses approval": false });
});

test("rejects a blank numeric answer before calling the server", async () => {
  renderForm();
  fireEvent.change(screen.getByLabelText("Budget label 1"), { target: { value: "Amount" } });
  fireEvent.change(screen.getByLabelText("Budget answer type 1"), { target: { value: "number" } });
  fireEvent.change(screen.getByLabelText("Budget answer 1"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid number");
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
  expect(screen.getByLabelText("Company context label 1")).toBeDisabled();
  finish(result({ status: "in_progress" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalled());
});

test("retries the exact failed request and keeps editing locked", async () => {
  mutate.mockRejectedValueOnce(new Error("private failure")).mockResolvedValueOnce(result({ outcomeCode: "updated", revision: 4 }));
  renderForm(existingIntake());
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("We could not confirm this save. Your answers stay on screen.");
  const first = mutate.mock.calls[0]![0];
  expect(screen.getByLabelText("Company context label 1")).toBeDisabled();
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
