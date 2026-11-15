import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { CustomerIntakeSubmit } from "./intake-submit";

const { mutate, mutationOptions, router } = vi.hoisted(() => ({
  mutate: vi.fn(), mutationOptions: vi.fn(), router: { replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ intakes: { submit: {
  mutationOptions,
} } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const nextOrganizationId = "33333333-3333-4333-8333-333333333333";
const nextIntakeId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const retryCorrelationId = "77777777-7777-4777-8777-777777777777";
const retryIdempotencyKey = "88888888-8888-4888-8888-888888888888";
const currentHref = `/customer?intake=${intakeId}`;

function serverError(code: string): TRPCClientError<never> {
  const error = new TRPCClientError<never>("server response");
  Object.defineProperty(error, "data", { configurable: true, value: { code } });
  return error;
}

function renderSubmit(props: Partial<Parameters<typeof CustomerIntakeSubmit>[0]> = {}, key?: string) {
  const value = { organizationId, intakeId, expectedRevision: 3, ...props };
  return render(<QueryClientProvider client={new QueryClient()}><CustomerIntakeSubmit {...value} key={key} /></QueryClientProvider>);
}

function confirmSubmission() {
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Submit all current saved answers and requirements" }));
}

beforeEach(() => {
  mutate.mockReset();
  mutationOptions.mockReset().mockImplementation((options: unknown) => ({ mutationFn: mutate, ...((options ?? {}) as object) }));
  router.replace.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("crypto", { randomUUID: vi.fn()
    .mockReturnValueOnce(correlationId).mockReturnValueOnce(idempotencyKey)
    .mockReturnValueOnce(retryCorrelationId).mockReturnValueOnce(retryIdempotencyKey) });
});

test("explains missing requirements before a submission request can start", () => {
  renderSubmit({ requiresRequirement: true });
  expect(screen.getByRole("status")).toHaveTextContent("Save at least one must-have or nice-to-have requirement");
  expect(screen.getByRole("link", { name: "Add a requirement" })).toHaveAttribute("href", currentHref + "&newRequirement=1");
  expect(screen.queryByRole("button", { name: "Review submission" })).not.toBeInTheDocument();
  expect(mutate).not.toHaveBeenCalled();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("requires review and an explicit confirmation before submitting", () => {
  renderSubmit();
  expect(screen.getByRole("button", { name: "Review submission" })).toBeInTheDocument();
  expect(screen.queryByText(/all current saved answers and active requirements/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  expect(screen.getByText(/all current saved answers and active requirements/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Submit all current saved answers and requirements" }));
  expect(screen.getByRole("button", { name: "Submit saved intake" })).not.toBeDisabled();
  expect(mutate).not.toHaveBeenCalled();
});

test("explains an empty confirmation box instead of doing nothing", () => {
  renderSubmit();
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  const checkbox = screen.getByRole("checkbox", { name: "Submit all current saved answers and requirements" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Tick the box above to confirm");
  expect(checkbox).toHaveAttribute("aria-invalid", "true");
  expect(checkbox).toHaveAccessibleDescription(alert.textContent!);
  expect(checkbox).toHaveFocus();
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(checkbox);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(checkbox).not.toHaveAttribute("aria-invalid");
});

test("shows the requirement hint only when a qualifying requirement is not confirmed", () => {
  const hint = /needs at least one saved must-have or nice-to-have requirement/;
  const { unmount } = renderSubmit();
  expect(screen.getByText(hint)).toBeInTheDocument();
  unmount();
  renderSubmit({ hasRequirement: true });
  expect(screen.queryByText(hint)).not.toBeInTheDocument();
  expect(screen.getByText("You can still edit your saved answers and requirements now.")).toBeInTheDocument();
});

test("returns to editing without sending a request", () => {
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Return to editing" }));
  expect(screen.getByRole("button", { name: "Review submission" })).toBeInTheDocument();
  expect(mutate).not.toHaveBeenCalled();
});

test("submits the exact strict payload only after confirmation", async () => {
  mutate.mockResolvedValue({ status: "submitted" });
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![0]).toEqual({ organizationId, intakeId, expectedRevision: 3, correlationId, idempotencyKey });
});

test("keeps controls disabled while submitting and prevents duplicate requests", async () => {
  let finish!: (value: unknown) => void;
  mutate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderSubmit();
  confirmSubmission();
  const button = screen.getByRole("button", { name: "Submit saved intake" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(button).toBeDisabled();
  finish({ status: "submitted" });
});

test.each(["BAD_REQUEST", "NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED"])("first %s rejection gives fresh review guidance", async (code) => {
  mutate.mockRejectedValueOnce(serverError(code));
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  expect(await screen.findByText(/This submission was rejected/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Review saved intake" })).toHaveAttribute("href", currentHref);
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
});

test("configures the submit mutation without automatic retries", () => {
  renderSubmit();
  expect(mutationOptions).toHaveBeenCalledWith({ retry: false });
});

test("keeps the exact request after an unknown failure followed by deterministic rejection", async () => {
  mutate.mockRejectedValueOnce(new Error("network failure")).mockRejectedValueOnce(serverError("BAD_REQUEST"));
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  expect(await screen.findByText(/may have succeeded/)).toBeInTheDocument();
  const firstInput = mutate.mock.calls[0]![0];
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(screen.getByText(/may have succeeded/)).toBeInTheDocument();
  expect(mutate.mock.calls[1]![0]).toBe(firstInput);
});

test("does not expose provider errors", async () => {
  mutate.mockRejectedValueOnce(new Error("private database details"));
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  await screen.findByText(/may have succeeded/);
  expect(screen.queryByText(/private database details/)).not.toBeInTheDocument();
});

test.each([
  serverError("INTERNAL_SERVER_ERROR"),
  Object.assign(new Error("spoofed transport error"), { data: { code: "NOT_FOUND" } }),
])("keeps internal and spoofed errors uncertain", async (error) => {
  mutate.mockRejectedValueOnce(error);
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  expect(await screen.findByText(/may have succeeded/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry unchanged request" })).toBeInTheDocument();
  expect(screen.queryByText(/submission was rejected/)).not.toBeInTheDocument();
});

test("retries the exact request and confirms a later replay status", async () => {
  const replay = { status: "under_review", outcomeCode: "replayed" };
  mutate.mockRejectedValueOnce(new Error("unknown result")).mockResolvedValueOnce(replay);
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  await screen.findByText(/may have succeeded/);
  const firstInput = mutate.mock.calls[0]![0];
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[1]![0]).toBe(firstInput);
  expect(await screen.findByRole("heading", { name: "Your submission is confirmed" })).toBeInTheDocument();
});

test("requires browser crypto before creating a submission request", () => {
  vi.stubGlobal("crypto", {});
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  expect(screen.getByRole("alert")).toHaveTextContent("secure submission request");
  expect(mutate).not.toHaveBeenCalled();
});

test("keeps confirmed state when navigation or refresh fails", async () => {
  mutate.mockResolvedValue({ status: "submitted" });
  router.replace.mockImplementationOnce(() => { throw new Error("navigation failed"); });
  router.refresh.mockImplementationOnce(() => { throw new Error("refresh failed"); });
  renderSubmit();
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  expect(await screen.findByRole("heading", { name: "Your submission is confirmed" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open submitted intake" })).toHaveAttribute("href", currentHref);
  expect(router.replace).toHaveBeenCalledWith(currentHref);
  expect(router.refresh).toHaveBeenCalledOnce();
});

test("uses the current canonical props after a keyed parent change", async () => {
  mutate.mockResolvedValue({ status: "submitted" });
  const view = renderSubmit({}, "first");
  view.rerender(<QueryClientProvider client={new QueryClient()}><CustomerIntakeSubmit
    organizationId={nextOrganizationId} intakeId={nextIntakeId} expectedRevision={8} key="second"
  /></QueryClientProvider>);
  confirmSubmission();
  fireEvent.click(screen.getByRole("button", { name: "Submit saved intake" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![0]).toMatchObject({ organizationId: nextOrganizationId, intakeId: nextIntakeId, expectedRevision: 8 });
});
