import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ResponseForm } from "./response-form";
const { mutate, options, refresh } = vi.hoisted(() => ({ mutate: vi.fn(), options: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ responses: { submit: { mutationOptions: options } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const organizationId="11111111-1111-4111-8111-111111111111",recipientId="22222222-2222-4222-8222-222222222222";
function form(closed=false) {
  return render(<QueryClientProvider client={new QueryClient()}><ResponseForm organizationId={organizationId} recipientId={recipientId} expectedRevision={0} closed={closed} /></QueryClientProvider>);
}
function fill() {
  fireEvent.change(screen.getByLabelText("Supported requirements"), { target: { value: "Payroll is supported.\nA reviewed setup is required." } });
  fireEvent.click(screen.getByRole("checkbox"));
}
beforeEach(() => {
  mutate.mockReset(); refresh.mockReset();
  options.mockReset().mockImplementation((config: object) => ({ mutationFn: mutate, ...config }));
});
afterEach(cleanup);
test("requires explicit confirmation and valid statements before submission", () => {
  form();
  expect(screen.getByRole("button", { name: "Submit response" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Submit response" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Add at least one response statement.");
  expect(mutate).not.toHaveBeenCalled();
});
test("retries exactly after an uncertain result and keeps the entered answers", async () => {
  mutate.mockRejectedValueOnce(new Error("Transport unavailable")).mockResolvedValueOnce({ revision: 1 });
  form(); fill();
  fireEvent.click(screen.getByRole("button", { name: "Submit response" }));
  await screen.findByText(/We could not confirm this response/);
  expect(screen.getByLabelText("Supported requirements")).toBeDisabled();
  expect(screen.getByLabelText("Supported requirements")).toHaveValue("Payroll is supported.\nA reviewed setup is required.");
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await screen.findByText(/Your response was received/);
  expect(mutate).toHaveBeenCalledTimes(2);
  expect(mutate.mock.calls[1]![0]).toEqual(mutate.mock.calls[0]![0]);
  expect(mutate.mock.calls[0]![0]).toMatchObject({ organizationId,recipientId,expectedRevision:0,
    response:{supportedRequirements:["Payroll is supported.","A reviewed setup is required."]} });
  expect(options).toHaveBeenCalledWith({ retry: false });
});
test("retains confirmation if page refresh fails", async () => {
  mutate.mockResolvedValue({ revision: 1 }); refresh.mockImplementation(() => { throw new Error("Refresh unavailable"); });
  form(); fill(); fireEvent.click(screen.getByRole("button", { name: "Submit response" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your response was received."));
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
});
test("does not offer submission after the request closes", () => {
  form(true); expect(screen.getByRole("status")).toHaveTextContent("This RFP is closed."); expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
