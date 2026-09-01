import { describe, expect, test } from "vitest";

import {
  detectDuplicateCandidates,
  DuplicateDetectionError,
} from "./duplicate-contract";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";

const row = (recordId: string, overrides: Record<string, unknown> = {}) => ({
  recordId,
  organizationId,
  resource: "contact",
  dedupeKey: "email:fingerprint-1",
  ...overrides,
});

describe("CRM duplicate detection contract", () => {
  test("creates deterministic review candidates without merging records", () => {
    const candidates = detectDuplicateCandidates([
      row("00000000-0000-4000-8000-000000000002"),
      row("00000000-0000-4000-8000-000000000001"),
      row("00000000-0000-4000-8000-000000000003", { dedupeKey: "email:fingerprint-2" }),
    ]);

    expect(candidates).toEqual([{
      candidateKey: "duplicate:contact:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002",
      organizationId,
      resource: "contact",
      leftRecordId: "00000000-0000-4000-8000-000000000001",
      rightRecordId: "00000000-0000-4000-8000-000000000002",
      signal: "normalized_key",
      state: "open",
    }]);
    expect(candidates).toHaveLength(1);
  });

  test("keeps organizations and resource types isolated", () => {
    expect(detectDuplicateCandidates([
      row("00000000-0000-4000-8000-000000000001"),
      row("00000000-0000-4000-8000-000000000002", { organizationId: otherOrganizationId }),
    ])).toEqual([]);
    expect(detectDuplicateCandidates([
      row("00000000-0000-4000-8000-000000000001"),
      row("00000000-0000-4000-8000-000000000002", { resource: "vendor" }),
    ])).toEqual([]);
  });

  test("rejects malformed rows before producing candidates", () => {
    expect(() => detectDuplicateCandidates([
      row("not-a-uuid"),
    ])).toThrow(DuplicateDetectionError);
  });

  test("rejects duplicate record identities instead of creating self-pairs", () => {
    expect(() => detectDuplicateCandidates([
      row("00000000-0000-4000-8000-000000000001"),
      row("00000000-0000-4000-8000-000000000001"),
    ])).toThrow(DuplicateDetectionError);
  });
});
