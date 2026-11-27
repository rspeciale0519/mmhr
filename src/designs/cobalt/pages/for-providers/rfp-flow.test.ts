import { describe, expect, test } from "vitest";

import {
  FLOW_END_SECONDS,
  RFP_FLOW_STATUSES,
  TRAVEL_SECONDS,
  flowProviders,
  flowStages,
  stageFill,
  stageIndexAt,
  statusAt,
  statusChangeTimes,
  statusStep,
} from "./rfp-flow";

describe("RFP flow timeline", () => {
  test("shows at most five providers, the most a buyer can shortlist", () => {
    expect(flowProviders.length).toBeGreaterThan(0);
    expect(flowProviders.length).toBeLessThanOrEqual(5);
  });

  test("moves each provider through the statuses in order, never backwards", () => {
    for (const provider of flowProviders) {
      let last = -1;
      for (let seconds = 0; seconds <= FLOW_END_SECONDS; seconds += 0.05) {
        const step = statusStep(statusAt(provider, seconds));
        expect(step).toBeGreaterThanOrEqual(last);
        last = step;
      }
      expect(last).toBe(RFP_FLOW_STATUSES.length - 1);
    }
  });

  test("starts with nothing sent and ends with every answer back", () => {
    expect(flowProviders.map((provider) => statusAt(provider, 0))).toEqual(flowProviders.map(() => "Not sent"));
    expect(flowProviders.map((provider) => statusAt(provider, Number.POSITIVE_INFINITY))).toEqual(
      flowProviders.map(() => "Answered"),
    );
    const lastAnswer = Math.max(...flowProviders.map((provider) => provider.answeredAt));
    expect(FLOW_END_SECONDS).toBe(lastAnswer + TRAVEL_SECONDS);
  });

  test("brings the answers back at different times", () => {
    const answerTimes = flowProviders.map((provider) => provider.answeredAt);
    expect(new Set(answerTimes).size).toBe(answerTimes.length);
  });

  test("lists each status change once, earliest first", () => {
    const times = statusChangeTimes();
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    for (const provider of flowProviders) {
      expect(times).toEqual(expect.arrayContaining([provider.sentAt, provider.openedAt, provider.answeringAt, provider.answeredAt]));
    }
  });

  test("each stage is the moment every provider has reached it", () => {
    expect(flowStages.map((stage) => stage.status)).toEqual(["Sent", "Opened", "Answering", "Answered"]);
    for (const stage of flowStages) {
      const steps = flowProviders.map((provider) => statusStep(statusAt(provider, stage.at)));
      expect(Math.min(...steps)).toBe(statusStep(stage.status));
    }
    expect(flowStages.at(-1)?.at).toBe(FLOW_END_SECONDS);
  });

  test("knows the stage of any moment, and how full each stepper bar is", () => {
    expect(stageIndexAt(0)).toBe(-1);
    expect(stageIndexAt(flowStages[1].at)).toBe(1);
    expect(stageIndexAt(Number.POSITIVE_INFINITY)).toBe(flowStages.length - 1);
    expect(stageFill(0)).toEqual([0, 0, 0, 0]);
    expect(stageFill(flowStages[1].at)).toEqual([1, 1, 0, 0]);
    expect(stageFill(Number.POSITIVE_INFINITY)).toEqual([1, 1, 1, 1]);
    const half = stageFill(flowStages[0].at / 2);
    expect(half[0]).toBeCloseTo(0.5);
  });
});
