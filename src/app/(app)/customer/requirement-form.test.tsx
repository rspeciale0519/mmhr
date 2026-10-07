import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { CustomerRequirementForm } from "./requirement-form";

const { mutate, router } = vi.hoisted(() => ({ mutate: vi.fn(), router: { replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ intakes: { saveRequirement: {
  mutationOptions: (options: unknown) => ({ mutationFn: mutate, ...((options ?? {}) as object) }),
} } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const organizationId = "22222222-2222-4222-8222-222222222222";
const intakeId = "33333333-3333-4333-8333-333333333333";
const requirementId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const retryRequirementId = "77777777-7777-4777-8777-777777777777";
const retryCorrelationId = "88888888-8888-4888-8888-888888888888";
const retryIdempotencyKey = "99999999-9999-4999-8999-999999999999";
const returnHref = `/customer?intake=${intakeId}`;
type Requirement = NonNullable<Parameters<typeof CustomerRequirementForm>[0]["requirement"]>;

const result = (overrides: Record<string, unknown> = {}) => ({
  requirementId, organizationId, intakeId, revision: 1, correlationId, outcomeCode: "created", ...overrides,
});
const existingRequirement = (overrides: Record<string, unknown> = {}): Requirement => ({
  requirementId, organizationId, intakeId, stableKey: "need_existing", label: "Existing need",
  importance: "must", weight: 8, response: { source: "legacy", note: "Keep this" }, status: "active",
  requirementType: "structured", revision: 3, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z",
  ...overrides,
} as Requirement);
function serverError(code: string): TRPCClientError<never> {
  const error = new TRPCClientError<never>("server response");
  Object.defineProperty(error, "data", { configurable: true, value: { code } });
  return error;
}

beforeEach(() => {
  mutate.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("crypto", { randomUUID: vi.fn()
    .mockReturnValueOnce(requirementId).mockReturnValueOnce(correlationId).mockReturnValueOnce(idempotencyKey)
    .mockReturnValueOnce(retryRequirementId).mockReturnValueOnce(retryCorrelationId).mockReturnValueOnce(retryIdempotencyKey)
    .mockReturnValue(retryIdempotencyKey) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderForm(requirement?: Requirement, href = returnHref) {
  render(<QueryClientProvider client={new QueryClient()}><CustomerRequirementForm
    organizationId={organizationId} intakeId={intakeId} requirement={requirement} returnHref={href}
  /></QueryClientProvider>);
}

test("creates a requirement with strict customer fields and generated identifiers", async () => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "SSO support" } });
  fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "text" } });
  fireEvent.change(screen.getByLabelText("Text answer"), { target: { value: "SAML" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![0]).toEqual({
    requirementId, organizationId, intakeId, expectedRevision: 0, stableKey: `need_${requirementId.replaceAll("-", "")}`,
    label: "SSO support", importance: "must", weight: 1, response: "SAML", requirementType: "custom",
    correlationId, idempotencyKey,
  });
});

test("preserves existing complex answers and metadata by default", async () => {
  mutate.mockResolvedValue(result({ revision: 4, outcomeCode: "updated" }));
  const response = { source: "legacy", nested: ["Keep this", { count: 2 }] };
  renderForm(existingRequirement({ response, label: "Legacy label" }));
  expect(screen.getByText("Keep this")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Updated label" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![0]).toMatchObject({
    requirementId, organizationId, intakeId, expectedRevision: 3, stableKey: "need_existing",
    label: "Updated label", importance: "must", weight: 8, response, requirementType: "structured",
  });
});

test("saves standard payroll answers with reusable scope keys and no assumed answers", async () => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement template"), { target: { value: "payroll" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0]).toMatchObject({ stableKey: "input_payroll", label: "Payroll processing", requirementType: "structured",
    response: { version: 1, requested: null, country: null, workerType: null, stateScope: null, allowPayrollAddOn: null } });
});

test("saves typed payroll restrictions without turning a no into an unknown", async () => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement template"), { target: { value: "payroll" } });
  fireEvent.change(screen.getByLabelText("Do you need payroll processing?"), { target: { value: "yes" } });
  fireEvent.change(screen.getByLabelText("Payroll country code"), { target: { value: "us" } });
  fireEvent.change(screen.getByLabelText("Who will you pay?"), { target: { value: "employee" } });
  fireEvent.change(screen.getByLabelText("US payroll locations"), { target: { value: "multiple" } });
  fireEvent.change(screen.getByLabelText("Would you consider a paid payroll add-on?"), { target: { value: "false" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0].response).toEqual({ version: 1, requested: "yes", country: "US", workerType: "employee", stateScope: "multiple", allowPayrollAddOn: false });
});

test("edits standard payroll answers without changing the stable key or revision", async () => {
  mutate.mockResolvedValue(result({ revision: 4, outcomeCode: "updated" }));
  const response = { version: 1, requested: "yes", country: "US", workerType: "employee", stateScope: "single", allowPayrollAddOn: true };
  renderForm(existingRequirement({ stableKey: "input_payroll", response }));
  fireEvent.change(screen.getByLabelText("US payroll locations"), { target: { value: "multiple" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0]).toMatchObject({ stableKey: "input_payroll", expectedRevision: 3, response: { ...response, stateScope: "multiple" } });
});

test("rejects invalid payroll country input without submitting", () => {
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement template"), { target: { value: "payroll" } });
  fireEvent.change(screen.getByLabelText("Payroll country code"), { target: { value: "1" } });
  fireEvent.submit(screen.getByRole("form", { name: "Add intake requirement" }));
  expect(screen.getByRole("alert")).toHaveTextContent("two-letter country code");
  expect(mutate).not.toHaveBeenCalled();
});

test("preserves unrecognized payroll answer fields through the existing editor", async () => {
  mutate.mockResolvedValue(result({ revision: 4, outcomeCode: "updated" }));
  const response = { version: 2, country: "US", futureField: "Keep this answer" };
  renderForm(existingRequirement({ stableKey: "input_payroll", response }));
  expect(screen.getByText("Keep this answer")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0].response).toEqual(response);
});

test("requires an explicit replacement before changing a complex answer", async () => {
  mutate.mockResolvedValue(result({ revision: 4, outcomeCode: "updated" }));
  renderForm(existingRequirement());
  expect(screen.getByRole("button", { name: "Replace answer" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Replace answer" }));
  expect(screen.getByRole("button", { name: "Keep saved answer" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Text answer"), { target: { value: "New answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Keep saved answer" }));
  expect(screen.getByRole("button", { name: "Replace answer" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Replace answer" }));
  fireEvent.change(screen.getByLabelText("Text answer"), { target: { value: "New answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![0].response).toBe("New answer");
});

test.each([
  ["none", null], ["text", "Plain text"], ["number", 42], ["boolean", false],
] as const)("writes a %s answer without stringifying it", async (mode, expected) => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Answer format" } });
  fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: mode } });
  if (mode === "text") fireEvent.change(screen.getByLabelText("Text answer"), { target: { value: "Plain text" } });
  if (mode === "number") fireEvent.change(screen.getByLabelText("Number answer"), { target: { value: "42" } });
  if (mode === "boolean") fireEvent.change(screen.getByLabelText("Yes or no answer"), { target: { value: "false" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![0].response).toBe(expected);
});

test("rejects invalid labels, weights, and numbers before saving", async () => {
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Valid label" } });
  fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "101" } });
  fireEvent.submit(screen.getByRole("form", { name: "Add intake requirement" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("1 to 100");
  expect(mutate).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Valid" } });
  fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "number" } });
  fireEvent.change(screen.getByLabelText("Number answer"), { target: { value: "not a number" } });
  fireEvent.submit(screen.getByRole("form", { name: "Add intake requirement" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("valid number");
  expect(mutate).not.toHaveBeenCalled();
});

test("blocks duplicate saves while the first request is pending", async () => {
  let finish!: (value: unknown) => void;
  mutate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Pending save" } });
  const button = screen.getByRole("button", { name: "Save requirement" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("Requirement label")).toBeDisabled();
  finish(result());
  await waitFor(() => expect(screen.getByRole("heading", { name: "Save confirmed" })).toBeInTheDocument());
});

test("retries the exact locked request after an uncertain result", async () => {
  mutate.mockRejectedValueOnce(new Error("private failure")).mockResolvedValueOnce(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Retry me" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await screen.findByText(/It may have succeeded/);
  const firstInput = mutate.mock.calls[0]![0];
  expect(screen.getByLabelText("Requirement label")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[1]![0]).toBe(firstInput);
});

test("unlocks a first BAD_REQUEST so the user can correct and create a new request", async () => {
  mutate.mockRejectedValueOnce(serverError("BAD_REQUEST")).mockResolvedValueOnce(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "First value" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("server rejected");
  expect(screen.getByLabelText("Requirement label")).not.toBeDisabled();
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
  const firstInput = mutate.mock.calls[0]![0];

  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Corrected value" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[1]![0]).not.toBe(firstInput);
  expect(mutate.mock.calls[1]![0].correlationId).not.toBe(firstInput.correlationId);
  expect(mutate.mock.calls[1]![0].idempotencyKey).not.toBe(firstInput.idempotencyKey);
});

test.each(["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED"]) (
  "shows fresh-view guidance for a first %s rejection",
  async (code) => {
    mutate.mockRejectedValueOnce(serverError(code));
    renderForm();
    fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Rejected" } });
    fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
    expect(await screen.findByText("This save was rejected. Return to the requirements list to check current access and saved values.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to requirements" })).toHaveAttribute("href", returnHref);
    expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Requirement label")).toBeDisabled();
  },
);

test("keeps the exact request uncertain after a network failure then a deterministic rejection", async () => {
  mutate.mockRejectedValueOnce(new Error("network down")).mockRejectedValueOnce(serverError("BAD_REQUEST"));
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Maybe saved" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await screen.findByText(/It may have succeeded/);
  const firstInput = mutate.mock.calls[0]![0];
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "Retry unchanged request" })).toBeInTheDocument();
  expect(screen.getByText(/It may have succeeded/)).toBeInTheDocument();
  expect(mutate.mock.calls[1]![0]).toBe(firstInput);
});

test("does not trust a spoofed error data property", async () => {
  const spoofed = Object.assign(new Error("network down"), { data: { code: "BAD_REQUEST" } });
  mutate.mockRejectedValueOnce(spoofed);
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Spoofed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await screen.findByText(/It may have succeeded/);
  expect(screen.getByLabelText("Requirement label")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Retry unchanged request" })).toBeInTheDocument();
});

test("keeps the confirmed view when navigation fails", async () => {
  mutate.mockResolvedValue(result());
  router.replace.mockImplementationOnce(() => { throw new Error("navigation failed"); });
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Confirmed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await screen.findByRole("heading", { name: "Save confirmed" });
  expect(screen.getByRole("link", { name: "Return to requirements" })).toHaveAttribute("href", returnHref);
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
  expect(router.refresh).toHaveBeenCalledOnce();
});

test("refreshes after a confirmed save", async () => {
  mutate.mockResolvedValue(result());
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Refresh" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await screen.findByRole("heading", { name: "Save confirmed" });
  expect(router.replace).toHaveBeenCalledWith(returnHref);
  expect(router.refresh).toHaveBeenCalledOnce();
});

test("keeps the confirmed view when refresh fails", async () => {
  mutate.mockResolvedValue(result());
  router.refresh.mockImplementationOnce(() => { throw new Error("refresh failed"); });
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Refresh failure" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await screen.findByRole("heading", { name: "Save confirmed" });
  expect(screen.getByRole("link", { name: "Return to requirements" })).toHaveAttribute("href", returnHref);
});

test.each([
  "https://untrusted.example",
  "/customer\\?intake=" + intakeId,
  "/customer?intake=" + intakeId + "&evil=1",
  "/customer?intake=not-a-uuid",
  "/customer?intake=" + intakeId + "\u0000",
])("rejects an unsafe return link: %s", async (href) => {
  mutate.mockResolvedValue(result());
  renderForm(undefined, href);
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "Safe link" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  await screen.findByRole("heading", { name: "Save confirmed" });
  expect(screen.getByRole("link", { name: "Return to requirements" })).toHaveAttribute("href", "/customer");
});

test("shows an oversized saved answer and requires replacement", async () => {
  const oversized = { first: "é".repeat(2_000), second: "é".repeat(2_000), third: "é".repeat(2_000) };
  renderForm(existingRequirement({ response: oversized }));
  expect(screen.getByText("Existing answer is preserved")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("too large to save again");
  expect(mutate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Replace answer" }));
  fireEvent.change(screen.getByLabelText("Text answer"), { target: { value: "Replacement" } });
  mutate.mockResolvedValue(result({ revision: 4, outcomeCode: "updated" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![0].response).toBe("Replacement");
});

test("does not submit when secure identifiers are unavailable", async () => {
  vi.stubGlobal("crypto", { randomUUID: undefined });
  renderForm();
  fireEvent.change(screen.getByLabelText("Requirement label"), { target: { value: "No UUID" } });
  fireEvent.click(screen.getByRole("button", { name: "Save requirement" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("secure save request");
  expect(mutate).not.toHaveBeenCalled();
});
