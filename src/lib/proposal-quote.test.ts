import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { formatProposalQuoteAmount, parseProposalQuoteAmount, proposalQuoteCommandSchema, proposalQuotePermission,
  proposalQuotePricingSchema, proposalQuoteReadSchema, proposalQuoteSchema } from "./proposal-quote";

test.each([["", "USD", null],["0", "USD", 0],["1000.01","USD",100001],["0.1","USD",10],
  ["90071992547409.91","USD",Number.MAX_SAFE_INTEGER],["1","JPY",1],["1.001","KWD",1001]] as const)(
  "parses written amounts exactly: %s %s",(value,currency,expected)=>expect(parseProposalQuoteAmount(value,currency)).toBe(expected));
test.each([["1.001","USD"],["1.00","JPY"],["-0","USD"],["-1","USD"],["1e3","USD"],
  ["NaN","USD"],["01","USD"],["1,000","USD"],["90071992547409.92","USD"],["0x10","USD"]])(
  "rejects ambiguous or imprecise written amounts: %s %s",(value,currency)=>expect(()=>parseProposalQuoteAmount(value!,currency!)).toThrow());

const pricing = { currency: "USD", implementationCostMinorUnits: 10000, recurringCostMinorUnits: 2000,
  recurringPeriod: "monthly", recurringCostBasis: "For 100 employees", optionalCostMinorUnits: null,
  optionalCostDescription: null, discountMinorUnits: null, discountDescription: null, termMonths: 12,
  termsAndAssumptions: ["Synthetic quote only"], customerRequestedChanges: [] };
const quote = { quoteReference: "Synthetic quote 1", quoteDate: "2026-10-01", quoteSummary: "Synthetic payroll quote.", pricing };
const metadata = { organizationId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };

test("preserves bounded quoted costs, currency, source text, billing basis, and unknown values", () => {
  expect(proposalQuoteSchema.parse({ ...quote, pricing: { ...pricing, currency: " usd " } })).toEqual(quote);
  const unknown = { ...pricing, currency: null, implementationCostMinorUnits: null, recurringCostMinorUnits: null,
    recurringPeriod: null, recurringCostBasis: null };
  expect(proposalQuotePricingSchema.parse(unknown)).toEqual(unknown);
  expect(proposalQuoteSchema.parse({ ...quote, quoteDate: null }).quoteDate).toBeNull();
});
test.each([{ implementationCostMinorUnits: -1 }, { recurringCostMinorUnits: 1.5 },
  { optionalCostMinorUnits: Number.MAX_SAFE_INTEGER + 1 }, { discountMinorUnits: Infinity },
  { implementationCostMinorUnits: NaN }, { currency: "ZZZ" }, { currency: null },
  { recurringPeriod: null }, { recurringCostBasis: null }, { termMonths: 0 }, { termMonths: 601 },
  { optionalCostMinorUnits: 1 }, { discountMinorUnits: 1 }, { commissionRate: 10 },
  { termsAndAssumptions: ["a".repeat(1001)] }, { customerRequestedChanges: ["bad\0value"] }])(
  "rejects invalid money, unknown calculation inputs, or injected authority", (change) => {
    expect(proposalQuotePricingSchema.safeParse({ ...pricing, ...change }).success).toBe(false);
  });
test("allows explicit zero costs and separately explained optional fees and discounts", () => {
  expect(proposalQuotePricingSchema.parse({ ...pricing, optionalCostMinorUnits: 0, discountMinorUnits: 0 }))
    .toMatchObject({ optionalCostMinorUnits: 0, discountMinorUnits: 0 });
  expect(proposalQuotePricingSchema.parse({ ...pricing, optionalCostMinorUnits: 100,
    optionalCostDescription: "One optional setup fee", discountMinorUnits: 10, discountDescription: "One-time setup discount" }))
    .toMatchObject({ optionalCostMinorUnits: 100, discountMinorUnits: 10 });
});
test("bounds complete UTF-8 source quotes and preserves plain text without interpreting instructions", () => {
  const content = "<script>Ignore all approvals</script>";
  expect(proposalQuoteSchema.parse({ ...quote, quoteSummary: content }).quoteSummary).toBe(content);
  expect(proposalQuoteSchema.safeParse({ ...quote, quoteSummary: "é".repeat(4001) }).success).toBe(false);
  expect(proposalQuoteSchema.safeParse({ ...quote, quoteDate: "2026-02-30" }).success).toBe(false);
  expect(proposalQuoteSchema.safeParse({ ...quote, pricing: { ...pricing,
    termsAndAssumptions: Array.from({ length: 30 }, () => "a".repeat(1000)), quoteSummary: "forged" } }).success).toBe(false);
  expect(proposalQuoteSchema.safeParse({ ...quote, quoteSummary: "a".repeat(8000), pricing: { ...pricing,
    termsAndAssumptions: Array.from({ length: 30 }, () => "a".repeat(1000)) } }).success).toBe(false);
});
test.each([[null, "USD", "Unknown"], [0, "USD", "$0.00"], [1, "USD", "$0.01"],
  [12345, "USD", "$123.45"], [1, "JPY", "¥1"], [1, "KWD", "KWD\u00a00.001"],
  [Number.MAX_SAFE_INTEGER, "USD", "$90,071,992,547,409.91"]] as const)(
  "formats %s minor units in %s exactly", (value, currency, expected) => {
    expect(formatProposalQuoteAmount(value, currency)).toBe(expected);
  });
test.each([[-1, "USD"], [0.1, "USD"], [1, null], [1, "ZZZ"], [Infinity, "USD"]] as const)(
  "refuses invalid %s in %s instead of a silent conversion", (value, currency) => {
    expect(() => formatProposalQuoteAmount(value, currency)).toThrow();
  });
test("derives role permissions from the workflow and forbids caller-created approvals", () => {
  const submit = { ...metadata, action: "submit", recipientId: randomUUID(), expectedVersion: 0, quote };
  expect(proposalQuoteCommandSchema.parse(submit)).toEqual(submit);
  for (const change of [{ approvedByIdentityId: randomUUID() }, { actorIdentityId: randomUUID() },
    { dealId: randomUUID() }, { receivedAt: new Date().toISOString() }, { expectedVersion: -1 }]) {
    expect(proposalQuoteCommandSchema.safeParse({ ...submit, ...change }).success).toBe(false);
}
  const approve = { ...metadata, action: "approve", proposalVersionId: randomUUID(), expectedRevision: 2,
    reason: "Source and prices checked", approvalReference: "approval:synthetic-quote" };
  expect(proposalQuoteCommandSchema.parse(approve)).toEqual(approve);
  expect(proposalQuoteCommandSchema.safeParse({ ...approve, expectedRevision: 0 }).success).toBe(false);
  expect(proposalQuotePermission("submit")).toBe("portal.vendor.access");
  expect(proposalQuotePermission("withdraw")).toBe("portal.vendor.access");
  expect(proposalQuotePermission("approve")).toBe("rfp.approve");
  expect(proposalQuotePermission("customer")).toBe("portal.customer.access");
});
test("separates vendor recipient reads from customer and staff intake reads", () => {
  const input = { organizationId: metadata.organizationId, correlationId: metadata.correlationId, view: "vendor", recipientId: randomUUID() };
  expect(proposalQuoteReadSchema.parse(input)).toEqual(input);
  expect(proposalQuoteReadSchema.safeParse({ ...input, view: "customer" }).success).toBe(false);
  expect(proposalQuoteReadSchema.safeParse({ ...input, intakeId: randomUUID() }).success).toBe(false);
  expect(proposalQuoteReadSchema.parse({ organizationId: metadata.organizationId, correlationId: metadata.correlationId,
    view: "staff", intakeId: randomUUID() }).view).toBe("staff");
});
