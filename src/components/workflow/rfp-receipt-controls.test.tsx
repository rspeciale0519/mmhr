import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { RfpReceiptRow } from "@/lib/rfp-receipt";
import { RfpReceiptControls } from "./rfp-receipt-controls";
const execute = vi.fn(), refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: execute }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ rfps: { confirmReceipt: { mutationOptions: vi.fn() } } }) }));
const id = "11111111-1111-4111-8111-111111111111";
const item: RfpReceiptRow = { recipientId: id, rfpVersionId: id, title: "Synthetic questionnaire", providerName: "Synthetic vendor", version: 1,
  state: "distributed", sentAt: "2026-10-04T00:00:00Z", deadlineAt: "2026-10-05T00:00:00Z",
  acknowledgedAt: null, respondedAt: null, receiptKind: "none", canConfirm: true };
beforeEach(() => { execute.mockReset().mockResolvedValue({}); refresh.mockReset(); });
afterEach(cleanup);
test("confirms the exact delivered version and explains that answers remain separate", async () => {
  render(<RfpReceiptControls organizationId={id} item={item}/>);
  fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
  await screen.findByText("Receipt confirmed. This does not submit a vendor response.");
  expect(execute.mock.calls[0][0]).toMatchObject({ organizationId: id, recipientId: id, rfpVersionId: id });
  expect(execute.mock.calls[0][0]).not.toHaveProperty("actorIdentityId"); expect(refresh).toHaveBeenCalledOnce();
});
test("retries unknown replies with identical IDs and no repeated automatic request", async () => {
  execute.mockRejectedValueOnce(new Error("Network reply lost"));
  const view = render(<RfpReceiptControls organizationId={id} item={item}/>);
  fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
  await screen.findByRole("button", { name: "Retry unchanged request" });
  view.rerender(<RfpReceiptControls organizationId={id} item={{ ...item, providerName: "Updated visible label" }}/>);
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request" }));
  await screen.findByText("Receipt confirmed. This does not submit a vendor response.");
  expect(execute).toHaveBeenCalledTimes(2); expect(execute.mock.calls[1][0]).toEqual(execute.mock.calls[0][0]);
});
test.each(["CONFLICT", "NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"])("offers reload without retry for known %s", async code => {
  execute.mockRejectedValue({ data: { code }, message: "Private details" });
  render(<RfpReceiptControls organizationId={id} item={item}/>);
  fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
  await screen.findByRole("button", { name: "Reload saved status" });
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
  expect(screen.queryByText("Private details")).not.toBeInTheDocument(); expect(execute).toHaveBeenCalledOnce();
});
test("blocks duplicate interaction while a response is pending", async () => {
  let resolve!: (value: unknown) => void;
  execute.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<RfpReceiptControls organizationId={id} item={item}/>);
  fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
  expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Confirming…" }));
  expect(execute).toHaveBeenCalledOnce(); resolve({});
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Receipt confirmed"));
});
test("hides confirmation when an implicit receipt or newer response exists", () => {
  render(<RfpReceiptControls organizationId={id} item={{ ...item, canConfirm: false, receiptKind: "recorded", acknowledgedAt: item.sentAt }}/>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
test("retains known success when page refresh fails", async () => {
  refresh.mockImplementationOnce(() => { throw new Error("Private refresh failure"); });
  render(<RfpReceiptControls organizationId={id} item={item}/>);
  fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
  await screen.findByText("Receipt confirmed. Reload the page to read the current status.");
  expect(screen.queryByRole("button", { name: "Retry unchanged request" })).not.toBeInTheDocument();
});
