import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DemoHistory } from "./demo-history";
import { getDemoCoordinationHistory } from "@/server/commands/demo-coordination";

vi.mock("@/server/commands/demo-coordination", () => ({ getDemoCoordinationHistory: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
afterEach(cleanup);
test("shows the preserved plan, earlier schedule, and outcome through a scoped history read", async () => {
  vi.mocked(getDemoCoordinationHistory).mockResolvedValue({ organizationId: id, correlationId: id, demoId: id, nextRevision: null,
    items: [{ revision: 6, action: "complete", status: "completed", occurredAt: "2026-09-30T20:00:00Z", coordination: {
      plan: { round: 1, audience: "Synthetic payroll team", purpose: "Verify exports", format: "remote", requiredTopics: ["Daily exports"],
        participants: [{ name: "Synthetic attendee", role: "Payroll lead", organization: "customer" }] }, customerAvailability: null, vendorAvailability: null,
      schedule: { timeZone: "America/New_York", window: { startAt: "2026-09-30T14:00:00Z", endAt: "2026-09-30T15:00:00Z" },
        location: "Synthetic private meeting", reminderAt: "2026-09-29T14:00:00Z", confirmationNote: "Approved synthetic meeting" },
      outcome: { attendance: [{ name: "Synthetic attendee", attended: true }], feedback: "Synthetic export worked", score: 4,
        commitments: ["Send sample"], requestedChanges: ["Add company"], nextAction: "Review sample", nextActionAt: "2026-10-01T14:00:00Z", evidenceVersionIds: [] },
      reason: "Reviewed the synthetic outcome" } }] });
  const supabase = {} as never;
  render(await DemoHistory({ organizationId: id, view: "vendor", demoId: id, afterRevision: 5, basePath: "/vendor/demos", options: { supabase } }));
  expect(getDemoCoordinationHistory).toHaveBeenCalledWith(expect.objectContaining({ organizationId: id, view: "vendor", demoId: id, afterRevision: 5 }), { supabase });
  expect(screen.getByText("Synthetic payroll team")).toBeInTheDocument(); expect(screen.getByText("Daily exports")).toBeInTheDocument();
  expect(screen.getByText("Synthetic attendee · Payroll lead · customer")).toBeInTheDocument();
  expect(screen.getByText(/Sep 30, 2026, 10:00 AM to Sep 30, 2026, 11:00 AM/)).toBeInTheDocument();
  expect(screen.getByText(/Synthetic export worked/)).toBeInTheDocument(); expect(screen.getByText("Commitment: Send sample")).toBeInTheDocument();
  expect(screen.getByText("Requested change: Add company")).toBeInTheDocument();
});
