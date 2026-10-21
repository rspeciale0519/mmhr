import { describe, expect, test } from "vitest";

import {
  availabilityTargetPercent,
  calculateAvailability,
  parseAvailabilityObservation,
} from "./availability-contract";

const serviceId = "mmhr-web";
const start = "2026-08-01T00:00:00Z";
const end = "2026-09-01T00:00:00Z";

const observation = {
  observationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  serviceId,
  observedAt: "2026-08-15T12:00:00Z",
  durationSeconds: 60,
  outcome: "available" as const,
  maintenance: false,
  source: "synthetic" as const,
};

describe("availability contract", () => {
  test("parses a strict redacted observation", () => {
    expect(parseAvailabilityObservation(observation)).toEqual(observation);
  });

  test.each([
    { ...observation, actorEmail: "private@example.test" },
    { ...observation, message: "private incident detail" },
    { ...observation, durationSeconds: 0 },
  ])("rejects personal, free-text, or invalid fields: %j", (value) => {
    expect(() => parseAvailabilityObservation(value)).toThrow("Invalid availability observation");
  });

  test("calculates weighted uptime and excludes maintenance", () => {
    const report = calculateAvailability(
      [
        observation,
        { ...observation, observationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", durationSeconds: 30, outcome: "unavailable" },
        { ...observation, observationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", durationSeconds: 900, outcome: "unavailable", maintenance: true },
      ],
      serviceId,
      start,
      end,
    );

    expect(report.observedSeconds).toBe(90);
    expect(report.unavailableSeconds).toBe(30);
    expect(report.availabilityPercent).toBeCloseTo(66.6667, 3);
    expect(report.meetsTarget).toBe(false);
  });

  test("meets the 99.9 percent target when downtime stays below the threshold", () => {
    const report = calculateAvailability(
      [
        { ...observation, durationSeconds: 86_400 },
        { ...observation, observationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", durationSeconds: 86, outcome: "unavailable" },
      ],
      serviceId,
      start,
      end,
    );

    expect(report.availabilityPercent).toBeGreaterThanOrEqual(availabilityTargetPercent);
    expect(report.meetsTarget).toBe(true);
  });

  test("fails closed when there are no non-maintenance observations", () => {
    const report = calculateAvailability(
      [{ ...observation, maintenance: true }],
      serviceId,
      start,
      end,
    );

    expect(report.availabilityPercent).toBeNull();
    expect(report.meetsTarget).toBe(false);
  });

  test("rejects duplicates, foreign services, and out-of-window observations", () => {
    expect(() => calculateAvailability([observation, observation], serviceId, start, end)).toThrow("Duplicate");
    expect(() => calculateAvailability([{ ...observation, serviceId: "mmhr-api" }], serviceId, start, end)).toThrow("another service");
    expect(() => calculateAvailability([{ ...observation, observedAt: "2026-09-01T00:00:00Z" }], serviceId, start, end)).toThrow("outside");
  });

  test("rejects a reversed reporting window", () => {
    expect(() => calculateAvailability([], serviceId, end, start)).toThrow("must end after");
  });
});
