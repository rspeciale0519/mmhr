import { describe, expect, test } from "vitest";

import {
  parsePipelineEvent,
  projectPipeline,
  summarizePipeline,
} from "./pipeline-contract";

const dealId = "00000000-0000-4000-8000-000000000001";
const secondDealId = "00000000-0000-4000-8000-000000000002";

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "00000000-0000-4000-8000-000000000011",
    dealId,
    occurredAt: "2026-08-31T12:00:00.000Z",
    eventType: "deal.created",
    toStage: "new",
    dimensions: { vendorCategory: "hr_software", ownerRole: "advisor" },
    ...overrides,
  };
}

describe("pipeline reporting contract", () => {
  test("accepts an allowlisted event and preserves safe dimensions", () => {
    expect(parsePipelineEvent(event())).toMatchObject({
      dealId,
      toStage: "new",
      dimensions: { vendorCategory: "hr_software" },
    });
  });

  test("rejects personal data, free text, and unknown dimensions", () => {
    expect(() => parsePipelineEvent(event({ dimensions: { email: "person@example.com" } }))).toThrow(
      "Invalid pipeline event",
    );
    expect(() => parsePipelineEvent(event({ dimensions: { note: "customer wants payroll" } }))).toThrow(
      "Invalid pipeline event",
    );
  });

  test("requires valid creation and stage transition shapes", () => {
    expect(() => parsePipelineEvent(event({ toStage: "qualified" }))).toThrow("Invalid pipeline event");
    expect(() => parsePipelineEvent(event({ eventType: "deal.stage_changed", toStage: "qualified" }))).toThrow(
      "Invalid pipeline event",
    );
    expect(() => parsePipelineEvent(event({
      eventType: "deal.stage_changed",
      fromStage: "new",
      toStage: "new",
    }))).toThrow("Invalid pipeline event");
  });

  test("rebuilds current state in stable order and counts stage age", () => {
    const events = [
      event({
        eventId: "00000000-0000-4000-8000-000000000013",
        dealId: secondDealId,
        occurredAt: "2026-08-31T13:00:00.000Z",
      }),
      event({
        eventId: "00000000-0000-4000-8000-000000000012",
        eventType: "deal.stage_changed",
        fromStage: "new",
        toStage: "qualified",
        occurredAt: "2026-08-31T14:00:00.000Z",
      }),
      event(),
    ];

    expect(projectPipeline(events)).toEqual([
      { dealId, currentStage: "qualified", stageEnteredAt: "2026-08-31T14:00:00.000Z", eventCount: 2 },
      { dealId: secondDealId, currentStage: "new", stageEnteredAt: "2026-08-31T13:00:00.000Z", eventCount: 1 },
    ]);
    expect(summarizePipeline(events, "2026-08-31T16:30:00.000Z")).toEqual({
      asOf: "2026-08-31T16:30:00.000Z",
      totalDeals: 2,
      byStage: {
        new: 1,
        qualified: 1,
        evaluation: 0,
        demo: 0,
        proposal: 0,
        selected: 0,
        contracted: 0,
        closed_lost: 0,
      },
      currentStageAgeHours: [
        { dealId, stage: "qualified", hours: 2 },
        { dealId: secondDealId, stage: "new", hours: 3 },
      ],
    });
  });

  test("rejects duplicate events, invalid history, and future events", () => {
    expect(() => projectPipeline([event(), event()])).toThrow("Duplicate pipeline event");
    expect(() => projectPipeline([event({
      eventType: "deal.stage_changed",
      fromStage: "new",
      toStage: "qualified",
    })])).toThrow("no deal");
    expect(() => summarizePipeline([event()], "2026-08-31T11:59:00.000Z")).toThrow("after report as-of");
  });
});
