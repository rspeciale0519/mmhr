import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DisclosureBatch, type DisclosureRequest } from "./disclosure-batch";
import type { EvaluationDisclosureReview } from "@/server/commands/evaluation-disclosure";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); refresh.mockReset(); });

const org = "10000000-0000-4000-8000-000000000001", intake = "20000000-0000-4000-8000-000000000001";
type Item = EvaluationDisclosureReview["items"][number];
function item(index: number, overrides: Partial<Item> = {}): Item {
  return { candidateId: `30000000-0000-4000-8000-00000000000${index}`, candidateRevision: 1, source: "initial", state: "selected",
    maskedLabel: `Option ${String.fromCharCode(64 + index)}`, providerName: `Provider ${index}`, productName: `Product ${index}`,
    publicationId: "40000000-0000-4000-8000-000000000001", publicationSequence: 1, reviewDigest: String(index).repeat(64),
    canDisclose: true, lastDisclosureAt: null, ...overrides };
}
function review(items: Item[]): EvaluationDisclosureReview {
  return { organizationId: org, intakeId: intake, correlationId: org, nextCursor: null, items };
}
function fill() {
  fireEvent.change(screen.getByLabelText("Discussion date and time"), { target: { value: "2026-01-05T10:30" } });
  fireEvent.change(screen.getByLabelText("Discussion record"), { target: { value: "Call 2026-01-05" } });
  fireEvent.change(screen.getByLabelText("Commercial conflicts explained to the customer"), { target: { value: "Referral fees explained." } });
  fireEvent.change(screen.getByLabelText("Reason for disclosure"), { target: { value: "Customer chose the options." } });
  fireEvent.click(screen.getByLabelText("I completed the customer discussion and reviewed the provider details for every option listed."));
}
const submit = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("DisclosureBatch", () => {
  test("records one disclosure per option that still needs one, with the same fields", async () => {
    const execute = vi.fn<(input: DisclosureRequest) => Promise<unknown>>().mockResolvedValue({});
    render(<DisclosureBatch review={review([item(1), item(2), item(3, { lastDisclosureAt: "2026-01-01T00:00:00.000Z" }),
      item(4, { canDisclose: false }), item(5)])} execute={execute}/>);
    const list = screen.getByRole("list", { name: "Options in this disclosure" });
    expect(within(list).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Option A Provider 1 · Product 1", "Option B Provider 2 · Product 2", "Option E Provider 5 · Product 5"]);
    fill(); submit(/Record disclosure for 3 options/);
    expect(await screen.findByText("Disclosure recorded for all 3 options.")).toHaveAttribute("role", "status");
    expect(execute.mock.calls.map(([input]) => input.candidateId)).toEqual([item(1).candidateId, item(2).candidateId, item(5).candidateId]);
    const [first, second] = execute.mock.calls.map(([input]) => input);
    expect(first).toMatchObject({ organizationId: org, intakeId: intake, expectedReviewDigest: "1".repeat(64),
      discussionReference: "Call 2026-01-05", conflictDisclosure: "Referral fees explained.", reason: "Customer chose the options.",
      discussionAt: new Date("2026-01-05T10:30").toISOString() });
    expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
    expect(second!.correlationId).not.toBe(first!.correlationId);
    expect(screen.queryByRole("button", { name: /Record disclosure/ })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  test("reports a partial failure and retries only the unknown option with the same request", async () => {
    const execute = vi.fn<(input: DisclosureRequest) => Promise<unknown>>().mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Network failed"))
      .mockRejectedValueOnce(Object.assign(new Error("Refused"), { data: { code: "NOT_FOUND" } }))
      .mockResolvedValueOnce({});
    render(<DisclosureBatch review={review([item(1), item(2), item(3)])} execute={execute}/>);
    fill(); submit(/Record disclosure for 3 options/);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Disclosure recorded for 1 of 3 options. Not recorded: Option B, Option C.");
    expect(alert).toHaveTextContent("Retry the options with an unknown result.");
    expect(screen.getByText("Result unknown. Retry the same request.")).toBeInTheDocument();
    expect(screen.getByText(/Not recorded\. The server refused it\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Discussion record")).toBeDisabled();
    submit(/Retry options with unknown result/);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(4));
    expect(execute.mock.calls[3]![0]).toBe(execute.mock.calls[1]![0]);
    expect(await screen.findByText(/Disclosure recorded for 2 of 3 options\. Not recorded: Option C\. Reload the page/)).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload saved state" })).toBeInTheDocument();
  });

  test("lets staff correct the fields when the server rejects them", async () => {
    const badRequest = Object.assign(new Error("Bad request"), { data: { code: "BAD_REQUEST" } });
    const execute = vi.fn<(input: DisclosureRequest) => Promise<unknown>>().mockRejectedValueOnce(badRequest)
      .mockRejectedValueOnce(badRequest).mockResolvedValue({});
    render(<DisclosureBatch review={review([item(1), item(2)])} execute={execute}/>);
    fill(); submit(/Record disclosure for 2 options/);
    expect(await screen.findByRole("alert")).toHaveTextContent("The server did not accept the disclosure fields.");
    expect(screen.getByLabelText("Discussion record")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Discussion record"), { target: { value: "Call 2026-01-06" } });
    submit(/Record disclosure for remaining options/);
    expect(await screen.findByText("Disclosure recorded for all 2 options.")).toBeInTheDocument();
    expect(execute.mock.calls[2]![0]).toMatchObject({ discussionReference: "Call 2026-01-06" });
    expect(execute.mock.calls[2]![0].idempotencyKey).not.toBe(execute.mock.calls[0]![0].idempotencyKey);
  });

  test("rejects a future discussion time before any request", async () => {
    const execute = vi.fn();
    render(<DisclosureBatch review={review([item(1), item(2)])} execute={execute}/>);
    fill();
    fireEvent.change(screen.getByLabelText("Discussion date and time"), { target: { value: "2999-01-01T10:00" } });
    submit(/Record disclosure for 2 options/);
    expect(await screen.findByRole("alert")).toHaveTextContent("The discussion date and time cannot be in the future.");
    expect(execute).not.toHaveBeenCalled();
  });

  test("shows that nothing is left to disclose", () => {
    render(<DisclosureBatch review={review([item(1, { lastDisclosureAt: "2026-01-01T00:00:00.000Z" }), item(2, { canDisclose: false })])} execute={vi.fn()}/>);
    expect(screen.getByRole("status")).toHaveTextContent("Every selected option on this page has a recorded disclosure.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("renders nothing when no option can be disclosed", () => {
    const { container } = render(<DisclosureBatch review={review([item(1, { canDisclose: false })])} execute={vi.fn()}/>);
    expect(container).toBeEmptyDOMElement();
  });
});
