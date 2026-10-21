import { describe, expect, test } from "vitest";

import { aggregateScorecard, createScorecard, recordScoreEntry, scorecardInputSchema } from "./scorecard-contract";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { scorecardId: id(1), organizationId: id(2), intakeId: id(3), candidateId: "candidate:one", configurationId: id(4), configurationVersion: 2, criteria: [{ key: "fit", weight: 2 }, { key: "risk", weight: 1 }], entries: [], status: "draft", revision: 1, correlationId: id(5), createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" };
const entry = (n: number, overrides: Record<string, unknown> = {}) => ({ scoreId: id(10 + n), criterionKey: "fit", scorerIdentityId: id(20 + n), value: 80, comment: null, evidenceReferences: ["evidence:one"], enteredAt: "2026-09-01T11:00:00.000Z", ...overrides });
const command = (record: ReturnType<typeof createScorecard>, value: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({ scorecardId: record.scorecardId, organizationId: record.organizationId, expectedRevision: record.revision, entry: value, actorIdentityId: id(50), correlationId: id(5), ...overrides });

describe("R3 scorecard contract", () => {
  test("creates immutable draft scorecards with approved criteria only", () => {
    const record = createScorecard(base);
    expect(record.status).toBe("draft");
    expect(Object.isFrozen(record)).toBe(true);
    expect(scorecardInputSchema.safeParse({ ...base, entries: [entry(1, { criterionKey: "unknown" })] }).success).toBe(false);
  });

  test("rejects duplicate criteria and scorer entries", () => {
    expect(scorecardInputSchema.safeParse({ ...base, criteria: [{ key: "fit", weight: 1 }, { key: "fit", weight: 2 }] }).success).toBe(false);
    expect(scorecardInputSchema.safeParse({ ...base, entries: [entry(1), entry(2, { scoreId: id(12), scorerIdentityId: id(21) })] }).success).toBe(false);
  });

  test("records concurrent scorer entries and preserves history", () => {
    const first = recordScoreEntry(createScorecard(base), command(createScorecard(base), entry(1)));
    const second = recordScoreEntry(first, command(first, entry(2, { criterionKey: "risk", value: 30 })));
    expect(second.entries).toHaveLength(2);
    expect(second.entryHistory).toHaveLength(2);
    expect(Object.isFrozen(second.entryHistory)).toBe(true);
  });

  test("rejects stale or cross-organization score commands", () => {
    const record = createScorecard(base);
    const first = recordScoreEntry(record, command(record, entry(1)));
    expect(() => recordScoreEntry(first, command(record, entry(2)))).toThrow("conflict");
    expect(() => recordScoreEntry(record, command(record, entry(2), { organizationId: id(99) }))).toThrow("scope");
  });

  test("replaces one scorer entry without losing immutable history", () => {
    const record = createScorecard(base);
    const first = recordScoreEntry(record, command(record, entry(1)));
    const updated = recordScoreEntry(first, command(first, entry(1, { scoreId: id(12), value: 95 })));
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].value).toBe(95);
    expect(updated.entryHistory).toHaveLength(2);
  });

  test("aggregates weighted criterion averages deterministically", () => {
    const record = createScorecard(base);
    const first = recordScoreEntry(record, command(record, entry(1, { value: 80 })));
    const second = recordScoreEntry(first, command(first, entry(2, { value: 60 })));
    const third = recordScoreEntry(second, command(second, entry(3, { criterionKey: "risk", value: 30 })));
    expect(aggregateScorecard(third)).toMatchObject({ criterionAverages: { fit: 70, risk: 30 }, overallScore: 57, scorerCount: 3 });
  });
});
