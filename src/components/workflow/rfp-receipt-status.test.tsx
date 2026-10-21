import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RfpReceiptPage } from "@/lib/rfp-receipt";
import { RfpReceiptStatus } from "./rfp-receipt-status";
vi.mock("./rfp-receipt-controls", () => ({ RfpReceiptControls: () => <button>Confirm receipt</button> }));
afterEach(cleanup);
const id = "11111111-1111-4111-8111-111111111111";
const page: RfpReceiptPage = { organizationId: id, correlationId: id, view: "customer", intakeId: id, nextCursor: null,
  items: [{ recipientId: id, rfpVersionId: id, title: "Synthetic request", providerName: "Synthetic vendor", version: 1,
    state: "responded", sentAt: "2026-10-04T00:00:00Z", deadlineAt: "2026-10-05T00:00:00Z",
    acknowledgedAt: "2026-10-04T00:10:00Z", respondedAt: "2026-10-04T00:10:00Z", receiptKind: "recorded", canConfirm: false }] };
test("shows existing receipts without claiming explicit vendor confirmation or approval", () => {
  render(<RfpReceiptStatus page={page} nextHref={null}/>);
  expect(screen.getByText(/Receipt recorded/)).toBeInTheDocument();
  expect(screen.queryByText(/Vendor confirmed/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText(/It does not confirm a response or approval/)).toBeInTheDocument();
  expect(screen.queryByText(id)).not.toBeInTheDocument();
});
test("shows explicit receipt and submitted response as separate facts", () => {
  render(<RfpReceiptStatus page={{ ...page, items: [{ ...page.items[0]!, receiptKind: "explicit" }] }} nextHref={null}/>);
  expect(screen.getByText(/Vendor confirmed/)).toBeInTheDocument(); expect(screen.getByText(/Submitted/)).toBeInTheDocument();
});
test("shows vendor controls, safe labels, empty state and pagination", () => {
  const view = render(<RfpReceiptStatus page={{ ...page, view: "vendor", intakeId: null }} nextHref="/vendor?receiptsAfter=next"/>);
  expect(screen.getByRole("button", { name: "Confirm receipt" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Next delivery records" })).toHaveAttribute("href", "/vendor?receiptsAfter=next");
  expect(screen.getByText("Synthetic vendor")).toHaveClass("[overflow-wrap:anywhere]");
  view.rerender(<RfpReceiptStatus page={{ ...page, items: [] }} nextHref={null}/>);
  expect(screen.getByRole("status")).toHaveTextContent("No delivered questionnaires");
});
test("does not request a receipt for a withdrawn delivery without a recorded time", () => {
  render(<RfpReceiptStatus page={{ ...page, items: [{ ...page.items[0]!, state: "withdrawn", receiptKind: "none", acknowledgedAt: null, respondedAt: null }] }} nextHref={null}/>);
  expect(screen.getByText("No receipt recorded")).toBeInTheDocument();
  expect(screen.queryByText("Awaiting vendor receipt")).not.toBeInTheDocument();
  expect(screen.getByText("Withdrawn")).toBeInTheDocument();
});
