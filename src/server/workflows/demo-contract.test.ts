import { describe, expect, test } from "vitest";

import {
  createDemoRequest,
  transitionDemoRequest,
} from "./demo-contract";

const base = {
  demoId: "11111111-1111-4111-8111-111111111111",
  dealId: "22222222-2222-4222-8222-222222222222",
  customerOrganizationId: "33333333-3333-4333-8333-333333333333",
  vendorOrganizationId: "44444444-4444-4444-8444-444444444444",
  requestedByIdentityId: "55555555-5555-4555-8555-555555555555",
  requestedAt: "2026-08-31T12:00:00.000Z",
  status: "requested",
  revision: 1,
  scheduledStartAt: null,
  scheduledEndAt: null,
  meetingReference: null,
};

function transition(overrides: Record<string, unknown> = {}) {
  return {
    demoId: base.demoId,
    fromStatus: "requested",
    toStatus: "scheduled",
    expectedRevision: 1,
    actorIdentityId: base.requestedByIdentityId,
    occurredAt: "2026-08-31T13:00:00.000Z",
    reason: "Vendor availability confirmed",
    scheduledStartAt: "2026-09-05T14:00:00.000Z",
    scheduledEndAt: "2026-09-05T15:00:00.000Z",
    meetingReference: "meeting:demo-1",
    correlationId: "66666666-6666-4666-8666-666666666666",
    ...overrides,
  };
}

describe("demo workflow contract", () => {
  test("creates only unscheduled requests between distinct organizations", () => {
    expect(createDemoRequest(base)).toMatchObject({ status: "requested", revision: 1 });
    expect(() => createDemoRequest({ ...base, vendorOrganizationId: base.customerOrganizationId })).toThrow(
      "Invalid demo request",
    );
  });

  test("schedules a request with a bounded meeting window", () => {
    const result = transitionDemoRequest(createDemoRequest(base), transition());
    expect(result).toMatchObject({
      status: "scheduled",
      revision: 2,
      meetingReference: "meeting:demo-1",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects missing or reversed scheduling details", () => {
    const record = createDemoRequest(base);
    expect(() => transitionDemoRequest(record, transition({ meetingReference: null }))).toThrow(
      "Scheduled demos require meeting details",
    );
    expect(() => transitionDemoRequest(record, transition({
      scheduledEndAt: "2026-09-05T13:00:00.000Z",
    }))).toThrow("Demo end must follow its start");
  });

  test("rejects stale revisions and terminal transitions", () => {
    const scheduled = transitionDemoRequest(createDemoRequest(base), transition());
    expect(() => transitionDemoRequest(scheduled, transition({ fromStatus: "scheduled", expectedRevision: 1, toStatus: "completed", scheduledStartAt: null, scheduledEndAt: null, meetingReference: null })))
      .toThrow("Demo revision is stale");
    expect(() => transitionDemoRequest(scheduled, transition({ fromStatus: "scheduled", expectedRevision: 2, toStatus: "completed", scheduledStartAt: null, scheduledEndAt: null, meetingReference: null })))
      .not.toThrow();
    const completed = transitionDemoRequest(scheduled, transition({ fromStatus: "scheduled", expectedRevision: 2, toStatus: "completed", scheduledStartAt: null, scheduledEndAt: null, meetingReference: null }));
    expect(() => transitionDemoRequest(completed, transition({ fromStatus: "completed", expectedRevision: 3, toStatus: "cancelled", scheduledStartAt: null, scheduledEndAt: null, meetingReference: null })))
      .toThrow("Demo transition is not allowed");
  });
});
