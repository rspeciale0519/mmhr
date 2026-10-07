import { describe, expect, test } from "vitest";
import { demoAvailabilitySchema, demoOutcomeSchema, demoPlanSchema, demoScheduleSchema, validateDemoSchedule } from "./demo-planning";

const availability = { timeZone: "America/New_York", windows: [
  { startAt: "2026-11-02T09:00:00-05:00", endAt: "2026-11-02T11:00:00-05:00" },
], note: null };
const schedule = { window: { startAt: "2026-11-02T14:30:00Z", endAt: "2026-11-02T15:30:00Z" },
  timeZone: "America/New_York", location: "Private meeting room", reminderAt: "2026-11-01T14:30:00Z", confirmationNote: "Both parties confirmed these times." };
const now = new Date("2026-10-01T12:00:00Z");

describe("demo planning and scheduling", () => {
  test("requires a complete plan and rejects injected approval fields", () => {
    const plan = { round: 1, audience: "Payroll team", purpose: "Verify payroll export", format: "remote",
      participants: [{ name: "Synthetic participant", role: "Payroll lead", organization: "customer" }], requiredTopics: ["Daily exports"] };
    expect(demoPlanSchema.parse(plan)).toEqual(plan);
    expect(demoPlanSchema.safeParse({ ...plan, requiredTopics: [] }).success).toBe(false);
    expect(demoPlanSchema.safeParse({ ...plan, approvedByIdentityId: "forged" }).success).toBe(false);
    expect(demoPlanSchema.safeParse({ ...plan, purpose: "😀".repeat(501) }).success).toBe(false);
  });
  test("compares explicit offsets across time zones", () => {
    const vendor = { ...availability, timeZone: "Europe/London", windows: [
      { startAt: "2026-11-02T14:00:00Z", endAt: "2026-11-02T16:00:00Z" },
    ] };
    expect(validateDemoSchedule(schedule, availability, vendor, now)).toEqual(schedule);
  });
  test("rejects invalid zones, empty windows, overlap, reversed and excessive duration", () => {
    for (const input of [{ ...availability, timeZone: "Invalid/Zone" }, { ...availability, timeZone: "+05:00" },
      { ...availability, windows: [] }, { ...availability, windows: [...availability.windows, ...availability.windows] },
      { ...availability, windows: [{ startAt: "2026-11-02T11:00:00Z", endAt: "2026-11-02T10:00:00Z" }] },
      { ...availability, windows: [{ startAt: "2026-11-02T01:00:00Z", endAt: "2026-11-02T10:00:00Z" }] }]) {
      expect(demoAvailabilitySchema.safeParse(input).success).toBe(false);
    }
  });
  test("permits adjacent windows but rejects schedules crossing a gap", () => {
    expect(demoAvailabilitySchema.safeParse({ ...availability, windows: [
      { startAt: "2026-11-02T14:00:00Z", endAt: "2026-11-02T15:00:00Z" },
      { startAt: "2026-11-02T15:00:00Z", endAt: "2026-11-02T16:00:00Z" },
    ] }).success).toBe(true);
    const gap = { ...availability, windows: [
      { startAt: "2026-11-02T14:00:00Z", endAt: "2026-11-02T15:00:00Z" },
      { startAt: "2026-11-02T15:15:00Z", endAt: "2026-11-02T16:00:00Z" },
    ] };
    expect(() => validateDemoSchedule(schedule, availability, gap, now)).toThrow("both accepted time windows");
  });
  test("rejects a reminder at the start, expired reminders, and invalid clocks", () => {
    expect(demoScheduleSchema.safeParse({ ...schedule, reminderAt: schedule.window.startAt }).success).toBe(false);
    expect(() => validateDemoSchedule(schedule, availability, availability, new Date(schedule.reminderAt))).toThrow("future");
    expect(() => validateDemoSchedule(schedule, availability, availability, new Date(NaN))).toThrow("future");
  });
  test("requires outcomes with attendance, a next action, and bounded evidence identifiers", () => {
    const outcome = { attendance: [{ name: "Synthetic attendee", attended: true }], feedback: "Exports matched the request.",
      score: 4, commitments: [], requestedChanges: [], nextAction: "Review the proposal", nextActionAt: "2026-11-03T14:00:00Z", evidenceVersionIds: [] };
    expect(demoOutcomeSchema.parse(outcome)).toEqual(outcome);
    expect(demoOutcomeSchema.safeParse({ ...outcome, attendance: [] }).success).toBe(false);
    expect(demoOutcomeSchema.safeParse({ ...outcome, score: 0 }).success).toBe(false);
    expect(demoOutcomeSchema.safeParse({ ...outcome, evidenceVersionIds: ["https://unsafe.invalid/file"] }).success).toBe(false);
  });
});
