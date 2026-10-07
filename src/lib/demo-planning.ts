import { z } from "zod";

const text = (bytes: number) => z.string().trim().min(1).refine(
  (value) => new TextEncoder().encode(value).length <= bytes,
  `Use no more than ${bytes} UTF-8 bytes.`,
);
const date = z.iso.datetime({ offset: true });
export const demoTimeZoneSchema = z.string().min(1).max(100).refine((value) => {
  if (!/^(?:UTC|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}, "Use a named time zone, such as America/New_York.");

export const demoPlanSchema = z.strictObject({
  round: z.number().int().min(1).max(20),
  audience: text(500),
  purpose: text(2000),
  format: z.enum(["remote", "onsite", "hybrid"]),
  participants: z.array(z.strictObject({ name: text(200), role: text(200),
    organization: z.enum(["customer", "vendor", "mmhr"]) })).min(1).max(30),
  requiredTopics: z.array(text(500)).min(1).max(20),
});
export const demoTimeWindowSchema = z.strictObject({ startAt: date, endAt: date })
  .superRefine((value, context) => {
    const duration = Date.parse(value.endAt) - Date.parse(value.startAt);
    if (duration < 15 * 60000 || duration > 8 * 3600000) {
      context.addIssue({ code: "custom", path: ["endAt"], message: "Use a window from 15 minutes to 8 hours." });
    }
  });
export const demoAvailabilitySchema = z.strictObject({ timeZone: demoTimeZoneSchema,
  windows: z.array(demoTimeWindowSchema).min(1).max(10), note: text(2000).nullable(),
}).superRefine((value, context) => {
  const sorted = [...value.windows].sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
  for (let index = 1; index < sorted.length; index++) {
    if (Date.parse(sorted[index]!.startAt) < Date.parse(sorted[index - 1]!.endAt)) {
      context.addIssue({ code: "custom", path: ["windows"], message: "Time windows must not overlap." });
      break;
    }
  }
});
export const demoScheduleSchema = z.strictObject({
  window: demoTimeWindowSchema, timeZone: demoTimeZoneSchema,
  location: text(500), reminderAt: date, confirmationNote: text(2000),
}).superRefine((value, context) => {
  if (Date.parse(value.reminderAt) >= Date.parse(value.window.startAt)) {
    context.addIssue({ code: "custom", path: ["reminderAt"], message: "The reminder must precede the meeting." });
  }
});
export const demoOutcomeSchema = z.strictObject({
  attendance: z.array(z.strictObject({ name: text(200), attended: z.boolean() })).min(1).max(30),
  feedback: text(5000), score: z.number().int().min(1).max(5),
  commitments: z.array(text(1000)).max(20), requestedChanges: z.array(text(1000)).max(20),
  nextAction: text(2000), nextActionAt: date,
  evidenceVersionIds: z.array(z.uuid()).max(20),
});
export type DemoAvailability = z.infer<typeof demoAvailabilitySchema>;
export type DemoSchedule = z.infer<typeof demoScheduleSchema>;

/** Availability expresses acceptable windows. It never authorizes confirmation. */
export function validateDemoSchedule(
  value: unknown, customerInput: unknown, vendorInput: unknown, now: Date,
): DemoSchedule {
  const schedule = demoScheduleSchema.parse(value);
  const customer = demoAvailabilitySchema.parse(customerInput);
  const vendor = demoAvailabilitySchema.parse(vendorInput);
  const start = Date.parse(schedule.window.startAt), end = Date.parse(schedule.window.endAt);
  if (!Number.isFinite(now.getTime()) || start <= now.getTime() || Date.parse(schedule.reminderAt) <= now.getTime()) {
    throw new Error("The meeting and reminder must be in the future.");
  }
  const covers = (availability: DemoAvailability) => availability.windows.some(
    (window) => Date.parse(window.startAt) <= start && Date.parse(window.endAt) >= end,
  );
  if (!covers(customer) || !covers(vendor)) throw new Error("The meeting must fit both accepted time windows.");
  return schedule;
}
