/**
 * The timeline behind the "RFP out, answers back" illustration on
 * /for-providers.
 *
 * This is an illustration, not live data: five sample providers, each with
 * made-up moments (in seconds after the replay starts) when its status
 * changes. The status names mirror what MMHR staff really track for each
 * provider on the RFP tracking card
 * (src/app/(admin)/admin/rfp-forms/tracking-card.tsx and
 * src/lib/rfp-vendor-form.ts):
 * - "Not sent"  = the form state `prepared` ("Not sent").
 * - "Sent"      = the form state `sent`: the RFP email went out.
 * - "Opened"    = `openedAt` is set: the provider opened the private link.
 * - "Answering" = `answeredCount` is above zero: answers are saving.
 * - "Answered"  = the form state `submitted`, or `replied` when staff record
 *                 an email reply.
 *
 * Both the 3D stage and the text status list read from this one file, so
 * the picture and the words can never disagree.
 */

/** The statuses in the order a provider moves through them. */
export const RFP_FLOW_STATUSES = ["Not sent", "Sent", "Opened", "Answering", "Answered"] as const;
export type RfpFlowStatus = (typeof RFP_FLOW_STATUSES)[number];

/** One sample provider and the second at which each status starts. */
export type FlowProvider = {
  /** A masked letter, as buyers see providers before the advisor review. */
  readonly id: string;
  readonly sentAt: number;
  readonly openedAt: number;
  readonly answeringAt: number;
  readonly answeredAt: number;
};

/** Seconds a packet takes to travel along one line, out or back. */
export const TRAVEL_SECONDS = 0.9;

/**
 * Five sample providers: the most a buyer can shortlist. The RFP leaves for
 * all of them within about a second, but each answers at its own pace, so
 * the answers come back at different times.
 */
export const flowProviders: readonly FlowProvider[] = [
  { id: "A", sentAt: 0.3, openedAt: 1.4, answeringAt: 2.2, answeredAt: 4.4 },
  { id: "B", sentAt: 0.5, openedAt: 2.1, answeringAt: 3.0, answeredAt: 6.6 },
  { id: "C", sentAt: 0.7, openedAt: 1.7, answeringAt: 2.6, answeredAt: 5.3 },
  { id: "D", sentAt: 0.9, openedAt: 3.1, answeringAt: 4.1, answeredAt: 7.8 },
  { id: "E", sentAt: 1.1, openedAt: 2.5, answeringAt: 3.5, answeredAt: 7.0 },
];

/** The second when the last answer has arrived back at the buyer. */
export const FLOW_END_SECONDS =
  Math.max(...flowProviders.map((provider) => provider.answeredAt)) + TRAVEL_SECONDS;

/**
 * A provider's status at a moment in the replay. `seconds` can be
 * Infinity, which means "the finished state" (used before any replay, for
 * reduced motion, and when the page cannot animate).
 */
export function statusAt(provider: FlowProvider, seconds: number): RfpFlowStatus {
  if (seconds >= provider.answeredAt) return "Answered";
  if (seconds >= provider.answeringAt) return "Answering";
  if (seconds >= provider.openedAt) return "Opened";
  if (seconds >= provider.sentAt) return "Sent";
  return "Not sent";
}

/** How far along a status is, from 0 ("Not sent") to 4 ("Answered"). */
export function statusStep(status: RfpFlowStatus): number {
  return RFP_FLOW_STATUSES.indexOf(status);
}

/**
 * Every moment when at least one status changes, earliest first, without
 * repeats. The page sets a timer for each one to update the text list.
 */
export function statusChangeTimes(): number[] {
  const times = flowProviders.flatMap((provider) => [
    provider.sentAt,
    provider.openedAt,
    provider.answeringAt,
    provider.answeredAt,
  ]);
  return [...new Set(times)].sort((a, b) => a - b);
}
