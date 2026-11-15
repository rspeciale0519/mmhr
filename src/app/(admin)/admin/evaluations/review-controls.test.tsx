import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RfpControls, approvalReferenceInvalidMessage } from "./review-controls";
import type { RfpWorkflow } from "@/server/commands/rfp-portal";

const state = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("./rfp-notification-controls", () => ({ RfpNotificationControls: ({ organizationId, rfpId, version }: {
  organizationId: string; rfpId: string; version: number;
}) => <div aria-label="Vendor email notifications" data-organization={organizationId} data-rfp={rfpId} data-version={version}/> }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: state.mutate }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ rfps: {
  create: { mutationOptions: vi.fn() }, approve: { mutationOptions: vi.fn() }, deliver: { mutationOptions: vi.fn() },
} }) }));
afterEach(() => { cleanup(); state.mutate.mockReset(); });
const author = "10000000-0000-4000-8000-000000000001";
function workflow(requiresSeparateApproval: boolean): RfpWorkflow {
  return { organizationId: author, intakeId: author, correlationId: author, requiresSeparateApproval,
    readyToDeliver: false, selectedCount: 0, rfps: [{ rfpId: author, version: 1, title: "Payroll RFP",
      content: "Describe payroll processing.", status: "draft", createdByIdentityId: author,
      approvedByIdentityId: null, approvedAt: null, recipientCount: 0, deliveryDigest: "a".repeat(64) }] };
}
describe("RFP separate approval policy", () => {
  test("offers the author an explicit approval when separate approval is off", () => {
    render(<RfpControls workflow={workflow(false)} revision={1} identityId={author}/>);
    expect(screen.getByRole("button", { name: "Approve RFP" })).toBeEnabled();
    expect(screen.getByText(/Separate staff approval is off/)).toBeInTheDocument();
    expect(screen.getByLabelText("Approval record reference")).toBeRequired();
    expect(screen.queryByRole("button", { name: "Deliver to vendor portals" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Vendor email notifications")).not.toBeInTheDocument();
  });
  test("blocks the author when separate approval is on", () => {
    render(<RfpControls workflow={workflow(true)} revision={1} identityId={author}/>);
    expect(screen.queryByRole("button", { name: "Approve RFP" })).not.toBeInTheDocument();
    expect(screen.getByText("A different MMHR staff member must approve this draft.")).toBeInTheDocument();
  });
  test("offers a different reviewer approval when separate approval is on", () => {
    render(<RfpControls workflow={workflow(true)} revision={1} identityId="10000000-0000-4000-8000-000000000002"/>);
    expect(screen.getByRole("button", { name: "Approve RFP" })).toBeEnabled();
  });
  test("exposes notifications only after delivery to vendor portals", () => {
    const value = workflow(false);
    value.rfps[0].status = "distributed"; value.rfps[0].version = 2; value.rfps[0].recipientCount = 1;
    render(<RfpControls workflow={value} revision={1} identityId={author}/>);
    const controls = screen.getByLabelText("Vendor email notifications");
    expect(controls).toHaveAttribute("data-organization", value.organizationId);
    expect(controls).toHaveAttribute("data-rfp", value.rfps[0].rfpId);
    expect(controls).toHaveAttribute("data-version", "2");
    expect(screen.getByText("Delivered to 1 vendor portal.")).toBeInTheDocument();
  });
  test("keeps approved but undelivered requests outside notification controls", () => {
    const value = workflow(false); value.rfps[0].status = "approved";
    render(<RfpControls workflow={value} revision={1} identityId={author}/>);
    expect(screen.queryByLabelText("Vendor email notifications")).not.toBeInTheDocument();
  });
});

describe("RFP approval record reference", () => {
  function approvalForm(reference: string) {
    render(<RfpControls workflow={workflow(false)} revision={1} identityId={author}/>);
    const input = screen.getByLabelText("Approval record reference") as HTMLInputElement;
    fireEvent.change(input, { target: { value: reference } });
    fireEvent.click(screen.getByLabelText("I reviewed the full questionnaire and approve this version."));
    return input;
  }
  test("states the accepted characters before submit", () => {
    const input = approvalForm("");
    expect(input).toHaveAccessibleDescription(/letters, numbers, and \. _ : \/ - only\. No spaces\./);
    expect(input).toHaveAttribute("title", expect.stringContaining("No spaces"));
  });
  test("uses a pattern the browser compiles, so spaces fail browser validation", () => {
    // jsdom compiles `pattern` with the `v` flag, as browsers do; an invalid pattern never mismatches.
    const input = approvalForm("Trim task 3 local test approval");
    expect(input.validity.patternMismatch).toBe(true);
    fireEvent.change(input, { target: { value: "ticket-1042/review:2.a_b" } });
    expect(input.validity.patternMismatch).toBe(false);
  });
  test("stops a reference with spaces before the request when browser validation is skipped", async () => {
    const input = approvalForm("Trim task 3 local test approval");
    fireEvent.submit(input.form!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the approval record reference. Use 1 to 256 characters");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  test("shows the field rule, not a connection message, when the server rejects the reference", async () => {
    state.mutate.mockRejectedValueOnce(Object.assign(new Error("Bad request"), { data: { code: "BAD_REQUEST", httpStatus: 400 } }));
    const input = approvalForm("ticket-1042");
    fireEvent.submit(input.form!);
    expect(await screen.findByRole("alert")).toHaveTextContent(approvalReferenceInvalidMessage);
    expect(screen.queryByText(/could not confirm/)).not.toBeInTheDocument();
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ approvalReference: "approval:ticket-1042" }));
    expect(input).toBeEnabled();
  });
});
