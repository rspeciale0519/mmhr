import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DemoCoordinationPage } from "@/lib/demo-coordination";
import { DemoPlanForm } from "./demo-plan-form";
import { DemoAvailabilityForm, DemoConfirmationForm, DemoOutcomeForm, DemoStateForm } from "./demo-controls";

const { mutations, options, refresh } = vi.hoisted(() => {
  const names = ["create", "customerAvailability", "vendorAvailability", "confirm", "reopen", "complete", "cancel", "noShow"];
  return { mutations: Object.fromEntries(names.map((name) => [name, vi.fn()])),
    options: Object.fromEntries(names.map((name) => [name, vi.fn()])), refresh: vi.fn() };
});
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ demos: Object.fromEntries(Object.entries(options).map(([name, mutationOptions]) => [name, { mutationOptions }])) }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const id = "11111111-1111-4111-8111-111111111111";
const window = { startAt: "2030-01-02T12:00:00Z", endAt: "2030-01-02T13:00:00Z" };
const availability = { timeZone: "UTC", windows: [window], note: null };
const item: DemoCoordinationPage["items"][number] = { demoId: id, revision: 3, status: "requested", customerName: "Synthetic customer",
  vendorName: "Synthetic vendor", updatedAt: "2026-09-30T20:00:00Z", coordination: {
    plan: { round: 1, audience: "Payroll", purpose: "Verify exports", format: "remote", requiredTopics: ["Export"],
      participants: [{ name: "Synthetic attendee", role: "Payroll lead", organization: "customer" }] },
    customerAvailability: availability, vendorAvailability: availability, schedule: null, outcome: null, reason: null } };
function view(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>); }
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function fillAvailability() { fill("Start", "2030-01-02T12:00"); fill("End", "2030-01-02T13:00"); }
beforeEach(() => {
  refresh.mockReset();
  for (const name of Object.keys(mutations)) {
    mutations[name]!.mockReset().mockResolvedValue({});
    options[name]!.mockReset().mockImplementation((config: object) => ({ mutationFn: mutations[name], ...config }));
  }
});
afterEach(cleanup);

test.each(["customer", "vendor"] as const)("%s availability uses its own procedure and explicit time zone", async (role) => {
  view(<DemoAvailabilityForm organizationId={id} item={item} view={role} />); fillAvailability();
  fill("Time zone for all entered times", "America/New_York");
  fireEvent.click(screen.getByRole("button", { name: "Save acceptable times", hidden: true }));
  await screen.findByText("Your acceptable times are saved. MMHR must confirm the meeting.");
  expect(mutations[`${role}Availability`]!.mock.calls[0]![0]).toMatchObject({ action: `${role}_availability`, organizationId: id,
    expectedRevision: 3, availability: { timeZone: "America/New_York", windows: [{ startAt: "2030-01-02T17:00:00.000Z", endAt: "2030-01-02T18:00:00.000Z" }] } });
  expect(mutations.confirm).not.toHaveBeenCalled();
});
test("rejects invalid time zones before it sends availability", () => {
  view(<DemoAvailabilityForm organizationId={id} item={item} view="customer" />); fillAvailability(); fill("Time zone for all entered times", "Invalid/Zone");
  fireEvent.submit(screen.getByLabelText("Start").closest("form")!);
  expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Use a named time zone, such as America/New_York.");
  expect(screen.getByRole("alert", { hidden: true })).not.toHaveTextContent('"code"'); expect(mutations.customerAvailability).not.toHaveBeenCalled();
});
test("locks an uncertain availability save and retries the exact request", async () => {
  mutations.vendorAvailability!.mockRejectedValueOnce(new Error("Unknown transport outcome"));
  view(<DemoAvailabilityForm organizationId={id} item={item} view="vendor" />); fillAvailability();
  fireEvent.submit(screen.getByLabelText("Start").closest("form")!);
  await screen.findByText(/We could not confirm this action/); expect(screen.getByLabelText("Start")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry unchanged request", hidden: true }));
  await screen.findByText("Your acceptable times are saved. MMHR must confirm the meeting.");
  expect(mutations.vendorAvailability!.mock.calls[1]![0]).toEqual(mutations.vendorAvailability!.mock.calls[0]![0]);
});
test("blocks confirmation before both parties supply times and rejects a time outside their agreement", () => {
  const missing = view(<DemoConfirmationForm organizationId={id} item={{ ...item, coordination: { ...item.coordination, customerAvailability: null } }} />);
  expect(screen.getByText("Wait for both customer and vendor acceptable times.")).toBeInTheDocument(); missing.unmount();
  view(<DemoConfirmationForm organizationId={id} item={item} />);
  fill("Meeting start", "2030-01-02T14:00"); fill("Meeting end", "2030-01-02T15:00"); fill("Reminder time", "2030-01-01T12:00");
  fill("Meeting location or link", "Synthetic meeting"); fill("Confirmation note for all participants", "Agreed time"); fill("Reason", "Both parties agreed");
  fireEvent.submit(screen.getByLabelText("Meeting start").closest("form")!);
  expect(screen.getByRole("alert", { hidden: true })).toBeInTheDocument(); expect(mutations.confirm).not.toHaveBeenCalled();
});
test("preserves saved confirmation when the page refresh fails", async () => {
  refresh.mockImplementation(() => { throw new Error("Refresh unavailable"); });
  view(<DemoConfirmationForm organizationId={id} item={item} />);
  fill("Meeting start", "2030-01-02T12:00"); fill("Meeting end", "2030-01-02T13:00"); fill("Reminder time", "2030-01-01T12:00");
  fill("Meeting location or link", "Synthetic meeting"); fill("Confirmation note for all participants", "Agreed time"); fill("Reason", "Both parties agreed");
  fireEvent.submit(screen.getByLabelText("Meeting start").closest("form")!);
  await screen.findByText("Your action is saved. Reload this page to read the current demo.");
  expect(mutations.confirm).toHaveBeenCalledTimes(1); expect(screen.queryByText("Retry unchanged request")).not.toBeInTheDocument();
});
test("omits changes for terminal demos", () => {
  const terminal = { ...item, status: "completed" as const };
  view(<><DemoAvailabilityForm organizationId={id} item={terminal} view="vendor" /><DemoConfirmationForm organizationId={id} item={terminal} />
    <DemoStateForm organizationId={id} item={terminal} /><DemoOutcomeForm organizationId={id} item={terminal} meetingEnded={true} /></>);
  expect(screen.queryByRole("button", { hidden: true })).not.toBeInTheDocument();
});
test("creates a plan from an eligible product without a client actor", async () => {
  view(<DemoPlanForm organizationId={id} choices={[{ candidateId: id, recipientId: id, providerName: "Synthetic vendor", productName: "Synthetic payroll", requestTitle: "Synthetic RFP" }]} />);
  fill("Audience", "Payroll team"); fill("Purpose", "Check payroll exports"); fill("Required topics, one per line", "Daily exports\nMultiple companies");
  fill("Participant 1 name", "Synthetic attendee"); fill("Role", "Payroll lead");
  fireEvent.submit(screen.getByLabelText("Audience").closest("form")!); await screen.findByText("Your demo action is saved.");
  const command = mutations.create!.mock.calls[0]![0];
  expect(command).toMatchObject({ candidateId: id, recipientId: id, plan: { requiredTopics: ["Daily exports", "Multiple companies"] } });
  expect(command).not.toHaveProperty("actorIdentityId");
});
test("records attendance against the plan and preserves commitments and next actions", async () => {
  view(<DemoOutcomeForm organizationId={id} meetingEnded={true} item={{ ...item, status: "scheduled", coordination: { ...item.coordination,
    schedule: { window: { startAt: "2020-01-02T12:00:00Z", endAt: "2020-01-02T13:00:00Z" }, timeZone: "UTC", location: "Synthetic meeting",
      reminderAt: "2020-01-02T11:00:00Z", confirmationNote: "Earlier synthetic meeting" } } }} />);
  fireEvent.click(screen.getByLabelText("Synthetic attendee attended")); fill("Feedback shared with participants", "The synthetic export worked");
  fill("Score from 1 to 5", "4"); fill("Commitments, one per line", "Send sample\nDocument exports"); fill("Requested changes, one per line", "Add company");
  fill("Next action", "Review sample"); fill("Next action due", "2030-01-03T12:00"); fill("Reason", "Reviewed synthetic meeting");
  fireEvent.submit(screen.getByLabelText("Next action").closest("form")!); await screen.findByText("Your demo action is saved.");
  expect(mutations.complete!.mock.calls[0]![0]).toMatchObject({ action: "complete", outcome: { attendance: [{ name: "Synthetic attendee", attended: true }],
    commitments: ["Send sample", "Document exports"], requestedChanges: ["Add company"], nextActionAt: "2030-01-03T12:00:00.000Z" } });
});
test("does not offer an outcome before the confirmed meeting ends", () => {
  view(<DemoOutcomeForm organizationId={id} meetingEnded={false} item={{ ...item, status: "scheduled", coordination: { ...item.coordination,
    schedule: { window, timeZone: "UTC", location: "Synthetic meeting", reminderAt: "2030-01-02T11:00:00Z", confirmationNote: "Synthetic meeting" } } }} />);
  expect(screen.getByText("Record the outcome after the confirmed meeting ends.")).toBeInTheDocument();
  expect(screen.queryByText("Record meeting outcome")).not.toBeInTheDocument(); expect(mutations.complete).not.toHaveBeenCalled();
});
