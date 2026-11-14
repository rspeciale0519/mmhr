import { describe, expect, test } from "vitest";
import { contractValueFactSchema, managedFinanceCommandSchema, managedFinanceCommandResultSchema,
  managedFinanceDetailSchema, managedFinanceReadSchema, verifyManagedFinanceResult } from "./managed-finance-workflow";

const ids = Array.from({ length: 12 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const metadata = { organizationId: ids[0], correlationId: ids[1], idempotencyKey: ids[2], reason: "Synthetic finance review" };
const source = { organizationId: ids[0], documentId: ids[3], versionId: ids[4], sha256: "a".repeat(64) };
const agreement = { ...metadata, action: "prepare_agreement", agreementId: ids[5], versionId: ids[6],
  vendorOrganizationId: ids[7], expectedSeriesRevision: 0, predecessorVersionId: null,
  source, effectiveFrom: "2026-10-01T00:00:00.123456Z", statedEffectiveEnd: null,
  replacementSourceReference: null, rule: { kind: "flat_amount", amountMinorUnits: 12000, currency: "USD" }, conditionReferences: [] };
const facts = { ...metadata, action: "prepare_contract_facts", contractId: ids[5], handoffId: ids[6], versionId: ids[7],
  predecessorVersionId: null, expectedFactsRevision: 0, source,
  contractValue: { amountMinorUnits: null, currency: null }, sourceReference: "contract:synthetic-original" };
const decision = { ...metadata, action: "approve_agreement", agreementId: ids[5], versionId: ids[6], expectedRevision: 1,
  expectedSourceDigest: "b".repeat(64), reviewedAccessId: ids[8], contentsReviewed: true,
  reviewReference: "review:synthetic", expectedSeriesRevision: 0, predecessorVersionId: null };
const calculation = { ...metadata, action: "prepare_calculation", commissionEventId: ids[5], calculationId: ids[6],
  expectedEventRevision: 1, expectedSourceDigest: "b".repeat(64) };

describe("Managed finance input boundaries", () => {
  test.each(["x".repeat(501), "https://example.test/source", "api_key=synthetic-private-value"])("rejects unsafe audit reasons", reason => {
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, reason }).success).toBe(false);
  });
  test("retains exact original references and microsecond effective times", () => {
    expect(managedFinanceCommandSchema.parse(agreement)).toEqual(agreement);
  });
  test("preserves unknown value without inventing zero or currency", () => {
    expect(managedFinanceCommandSchema.parse(facts)).toEqual(facts);
    expect(contractValueFactSchema.parse({ amountMinorUnits: null, currency: "USD" })).toEqual({ amountMinorUnits: null, currency: "USD" });
  });
  test("accepts confirmed zero and supported upper monetary bounds", () => {
    expect(contractValueFactSchema.safeParse({ amountMinorUnits: 0, currency: "USD" }).success).toBe(true);
    expect(contractValueFactSchema.safeParse({ amountMinorUnits: Number.MAX_SAFE_INTEGER, currency: "USD" }).success).toBe(true);
  });
  test.each([
    { amountMinorUnits: 1, currency: null }, { amountMinorUnits: -1, currency: "USD" },
    { amountMinorUnits: 1.5, currency: "USD" }, { amountMinorUnits: Number.MAX_SAFE_INTEGER + 1, currency: "USD" },
    { amountMinorUnits: 1, currency: "usd" }, { amountMinorUnits: "1", currency: "USD" },
    { amountMinorUnits: 1, currency: "ZZZ" },
  ])("rejects invalid or incomplete monetary facts: %j", input => {
    expect(contractValueFactSchema.safeParse(input).success).toBe(false);
  });
  test("requires amendment predecessor and exact replacement evidence", () => {
    const amendment = { ...agreement, expectedSeriesRevision: 1, predecessorVersionId: ids[9], replacementSourceReference: "amendment:synthetic" };
    expect(managedFinanceCommandSchema.safeParse(amendment).success).toBe(true);
    expect(managedFinanceCommandSchema.safeParse({ ...amendment, predecessorVersionId: null }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...amendment, replacementSourceReference: null }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, replacementSourceReference: "invented" }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...amendment, predecessorVersionId: amendment.versionId }).success).toBe(false);
  });
  test("requires correction lineage for contract facts", () => {
    expect(managedFinanceCommandSchema.safeParse({ ...facts, expectedFactsRevision: 1, predecessorVersionId: ids[9] }).success).toBe(true);
    expect(managedFinanceCommandSchema.safeParse({ ...facts, expectedFactsRevision: 1 }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...facts, predecessorVersionId: ids[9] }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...facts, expectedFactsRevision: 1, predecessorVersionId: facts.versionId }).success).toBe(false);
  });
  test("rejects foreign source ownership and a vendor-owned internal agreement", () => {
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, source: { ...source, organizationId: ids[10] } }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...facts, source: { ...source, organizationId: ids[10] } }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, vendorOrganizationId: ids[0] }).success).toBe(false);
  });
  test.each(["actorIdentityId", "approvedByIdentityId", "approvedAt", "signedAt", "commissionAmountMinorUnits", "state"])(
    "rejects client-defined authority or derived data: %s", field => {
      for (const input of [agreement, facts, decision, calculation]) {
        expect(managedFinanceCommandSchema.safeParse({ ...input, [field]: ids[11] }).success).toBe(false);
      }
    },
  );
  test("requires source access, source digest and explicit review acknowledgment", () => {
    expect(managedFinanceCommandSchema.parse(decision)).toEqual(decision);
    for (const field of ["reviewedAccessId", "contentsReviewed", "expectedSourceDigest", "reviewReference"]) {
      const input = { ...decision } as Record<string, unknown>; delete input[field];
      expect(managedFinanceCommandSchema.safeParse(input).success).toBe(false);
    }
    expect(managedFinanceCommandSchema.safeParse({ ...decision, contentsReviewed: false }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...decision, expectedSeriesRevision: 1 }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...decision, predecessorVersionId: ids[9] }).success).toBe(false);
  });
  test("keeps positive agreement intervals exact at a microsecond boundary", () => {
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, statedEffectiveEnd: "2026-10-01T00:00:00.123457Z" }).success).toBe(true);
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, statedEffectiveEnd: agreement.effectiveFrom }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, statedEffectiveEnd: "2026-10-01T00:00:00.123455Z" }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...agreement, statedEffectiveEnd: "2026-10-01T01:00:00.123456+01:00" }).success).toBe(false);
  });
  test("requires matching correction decision lineage", () => {
    const input = { ...decision, action: "approve_contract_facts", contractId: ids[5], expectedFactsRevision: 0 } as Record<string, unknown>;
    delete input.agreementId; delete input.expectedSeriesRevision;
    expect(managedFinanceCommandSchema.safeParse(input).success).toBe(true);
    expect(managedFinanceCommandSchema.safeParse({ ...input, expectedFactsRevision: 1 }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...input, expectedFactsRevision: 1, predecessorVersionId: ids[9] }).success).toBe(true);
  });
  test("keeps unsupported rules and conditions visible for server review", () => {
    const input = { ...agreement, rule: { kind: "unsupported", sourceTermReference: "terms:manual-rule" }, conditionReferences: ["terms:milestone"] };
    expect(managedFinanceCommandSchema.parse(input)).toEqual(input);
  });
  test.each(["2026-10-01T00:00:00.1234567Z", "2026-10-01T00:00:00", "2026-02-30T00:00:00Z"])(
    "rejects unsupported finance timestamps: %s", effectiveFrom => {
      expect(managedFinanceCommandSchema.safeParse({ ...agreement, effectiveFrom }).success).toBe(false);
    },
  );
  test("requires an existing source and event revision for deterministic calculations", () => {
    expect(managedFinanceCommandSchema.parse(calculation)).toEqual(calculation);
    expect(managedFinanceCommandSchema.safeParse({ ...calculation, expectedEventRevision: 0 }).success).toBe(false);
    expect(managedFinanceCommandSchema.safeParse({ ...calculation, expectedSourceDigest: "c".repeat(63) }).success).toBe(false);
  });
  test("accepts only the declared read views and normalized identifiers", () => {
    expect(managedFinanceReadSchema.parse({ organizationId: ids[0]!.toUpperCase(), correlationId: ids[1], view: "agreements" }).organizationId).toBe(ids[0]);
    expect(managedFinanceReadSchema.safeParse({ organizationId: ids[0], correlationId: ids[1], view: "payments" }).success).toBe(false);
    expect(managedFinanceDetailSchema.safeParse({ organizationId: ids[0], correlationId: ids[1], view: "agreement", entityId: ids[5] }).success).toBe(true);
  });
  test("strictly binds command results without financial approval claims", () => {
    const result = { organizationId: ids[0], correlationId: ids[1], entityId: ids[9], contractId: ids[5], handoffId: ids[6],
      action: "resolve_eligibility", revision: 1, outcomeCode: "recorded" };
    expect(managedFinanceCommandResultSchema.parse(result)).toEqual(result);
    expect(managedFinanceCommandResultSchema.safeParse({ ...result, commissionAmountMinorUnits: 0 }).success).toBe(false);
    expect(managedFinanceCommandResultSchema.safeParse({ ...result, revision: 2_147_483_647 }).success).toBe(true);
    expect(managedFinanceCommandResultSchema.safeParse({ ...result, revision: 2_147_483_648 }).success).toBe(false);
  });
  test("binds generated eligibility results to the requested contract and handoff", () => {
    const input = { ...metadata, action: "resolve_eligibility", contractId: ids[5], handoffId: ids[6] };
    const result = { organizationId: ids[0], correlationId: ids[1], entityId: ids[9], contractId: ids[5], handoffId: ids[6],
      action: "resolve_eligibility", revision: 1, outcomeCode: "recorded" };
    expect(verifyManagedFinanceResult(result, input)).toEqual(result);
    expect(verifyManagedFinanceResult({ ...result, outcomeCode: "replayed" }, input)).toEqual({ ...result, outcomeCode: "replayed" });
    expect(() => verifyManagedFinanceResult({ ...result, revision: 2 }, input)).toThrow("Invalid finance result revision");
    for (const field of ["organizationId", "correlationId", "contractId", "handoffId"]) {
      expect(() => verifyManagedFinanceResult({ ...result, [field]: ids[11] }, input)).toThrow();
    }
  });
  test("binds agreement, facts and calculation responses to their exact targets and revisions", () => {
    const results = [
      [agreement, { entityId: agreement.versionId, agreementId: agreement.agreementId, revision: 1 }],
      [decision, { entityId: decision.versionId, agreementId: decision.agreementId, revision: 2 }],
      [facts, { entityId: facts.versionId, contractId: facts.contractId, revision: 1 }],
      [calculation, { entityId: calculation.calculationId, commissionEventId: calculation.commissionEventId, revision: 1 }],
    ] as const;
    for (const [input, fields] of results) {
      const result = { ...fields, organizationId: input.organizationId, correlationId: input.correlationId, action: input.action, outcomeCode: "recorded" };
      expect(verifyManagedFinanceResult(result, input)).toEqual(result);
      expect(() => verifyManagedFinanceResult({ ...result, entityId: ids[11] }, input)).toThrow();
      expect(() => verifyManagedFinanceResult({ ...result, revision: fields.revision + 1 }, input)).toThrow();
    }
  });
});
