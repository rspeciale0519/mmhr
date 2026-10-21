import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const bytes = (value: string) => new TextEncoder().encode(value).length;
const text = (limit: number) => z.string().trim().min(1)
  .refine((value) => bytes(value) <= limit && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), "Use bounded plain text.");
// Freeze the supported-code inventory for this schema version. Browser and
// server ICU releases must not silently accept different quote contracts.
export const proposalQuoteCurrencyCodes = [
  "AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT","BGN","BHD","BIF","BMD","BND","BOB","BRL","BSD","BTN","BWP","BYN","BZD",
  "CAD","CDF","CHF","CLP","CNY","COP","CRC","CUC","CUP","CVE","CZK","DJF","DKK","DOP","DZD","EGP","ERN","ETB","EUR","FJD","FKP","GBP","GEL","GHS","GIP","GMD","GNF","GTQ","GYD",
  "HKD","HNL","HRK","HTG","HUF","IDR","ILS","INR","IQD","IRR","ISK","JMD","JOD","JPY","KES","KGS","KHR","KMF","KPW","KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD","LSL","LYD",
  "MAD","MDL","MGA","MKD","MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MYR","MZN","NAD","NGN","NIO","NOK","NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG",
  "QAR","RON","RSD","RUB","RWF","SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE","SLL","SOS","SRD","SSP","STN","SVC","SYP","SZL","THB","TJS","TMT","TND","TOP","TRY","TTD","TWD","TZS",
  "UAH","UGX","USD","UYU","UZS","VES","VND","VUV","WST","XAF","XCD","XCG","XDR","XOF","XPF","XSU","YER","ZAR","ZMW","ZWG","ZWL",
] as const;
export const proposalQuoteCurrencySchema = z.string().trim().toUpperCase().pipe(z.enum(proposalQuoteCurrencyCodes));
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();

export const proposalQuotePricingSchema = z.strictObject({
  currency: proposalQuoteCurrencySchema.nullable(),
  implementationCostMinorUnits: amount,
  recurringCostMinorUnits: amount,
  recurringPeriod: z.enum(["monthly", "quarterly", "annual", "contract_term"]).nullable(),
  recurringCostBasis: text(500).nullable(),
  optionalCostMinorUnits: amount,
  optionalCostDescription: text(1000).nullable(),
  discountMinorUnits: amount,
  discountDescription: text(1000).nullable(),
  termMonths: z.number().int().min(1).max(600).nullable(),
  termsAndAssumptions: z.array(text(1000)).max(30),
  customerRequestedChanges: z.array(text(1000)).max(20),
}).superRefine((value, context) => {
  if (value.currency === null && [value.implementationCostMinorUnits, value.recurringCostMinorUnits,
    value.optionalCostMinorUnits, value.discountMinorUnits].some((cost) => cost !== null)) {
    context.addIssue({ code: "custom", path: ["currency"], message: "Quoted amounts require a currency." });
  }
  if (value.recurringCostMinorUnits !== null && (value.recurringPeriod === null || value.recurringCostBasis === null)) {
    context.addIssue({ code: "custom", path: ["recurringPeriod"], message: "State the recurring period and pricing basis." });
  }
  if (value.optionalCostMinorUnits !== null && value.optionalCostMinorUnits > 0 && value.optionalCostDescription === null) {
    context.addIssue({ code: "custom", path: ["optionalCostDescription"], message: "Describe quoted optional costs." });
  }
  if (value.discountMinorUnits !== null && value.discountMinorUnits > 0 && value.discountDescription === null) {
    context.addIssue({ code: "custom", path: ["discountDescription"], message: "Describe how the discount applies." });
  }
});
export const proposalQuoteSchema = z.strictObject({
  quoteReference: text(200), quoteDate: z.iso.date().nullable(), quoteSummary: text(8000),
  pricing: proposalQuotePricingSchema,
}).refine((value) => bytes(JSON.stringify(value)) <= 32000, "Use no more than 32,000 bytes for one quote.");
export type ProposalQuote = z.output<typeof proposalQuoteSchema>;
export type ProposalQuotePricing = ProposalQuote["pricing"];

const metadata = { organizationId: uuid, correlationId: uuid, idempotencyKey: uuid };
const existing = { ...metadata, proposalVersionId: uuid, expectedRevision: z.number().int().min(1).max(9999) };
export const proposalQuoteCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...metadata, action: z.literal("submit"), recipientId: uuid,
    expectedVersion: z.number().int().min(0).max(9999), quote: proposalQuoteSchema }),
  z.strictObject({ ...existing, action: z.literal("review"), reason: text(2000) }),
  z.strictObject({ ...existing, action: z.literal("approve"), reason: text(2000), approvalReference: text(300) }),
  z.strictObject({ ...existing, action: z.literal("request_revision"), reason: text(2000) }),
  z.strictObject({ ...existing, action: z.literal("withdraw"), reason: text(2000) }),
]);
export const proposalQuoteReadSchema = z.discriminatedUnion("view", [
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("vendor"), recipientId: uuid, afterId: uuid.optional() }),
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("staff"), intakeId: uuid, afterId: uuid.optional() }),
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("customer"), intakeId: uuid, afterId: uuid.optional() }),
]);
export type ProposalQuoteCommand = z.output<typeof proposalQuoteCommandSchema>;
export function proposalQuotePermission(actionOrView: string) {
  if (["submit", "withdraw", "vendor"].includes(actionOrView)) return "portal.vendor.access" as const;
  if (actionOrView === "customer") return "portal.customer.access" as const;
  return "rfp.approve" as const;
}

const state = z.enum(["received", "under_review", "revision_requested", "approved_for_comparison", "superseded", "withdrawn"]);
const time = z.iso.datetime({ offset: true });
export const proposalQuoteResultSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  proposalVersionId: uuid, revision: z.number().int().min(1).max(10000), state,
  outcomeCode: z.enum(["recorded", "replayed"]) });
export const proposalQuotePageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  items: z.array(z.strictObject({ proposalVersionId: uuid, recipientId: uuid, intakeId: uuid,
    versionNumber: z.number().int().min(1).max(10000), revision: z.number().int().min(1).max(10000), state,
    quote: proposalQuoteSchema, receivedAt: time, reviewedAt: time.nullable(), approvedAt: time.nullable(),
    vendorName: text(200), current: z.boolean(), latest: z.boolean(), reason: text(2000).nullable(),
    canSubmit: z.boolean(), canReview: z.boolean(), canApprove: z.boolean() })).max(25),
  nextCursor: uuid.nullable(),
  submission: z.strictObject({ eligible: z.boolean(), expectedVersion: z.number().int().nonnegative().max(2147483647).nullable() }).nullable(),
});
const comparisonMetadata = { ...metadata, reason: text(2000) };
const comparisonDecision = { ...comparisonMetadata, comparisonId: uuid, expectedRevision: z.literal(1),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/) };
export const proposalComparisonCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...comparisonMetadata, action: z.literal("prepare"), intakeId: uuid,
    proposalVersionIds: z.array(uuid).min(2).max(5).refine((ids) => new Set(ids).size === ids.length, "Choose different quotes.") }),
  z.strictObject({ ...comparisonDecision, action: z.literal("approve"), approvalReference: text(300) }),
  z.strictObject({ ...comparisonDecision, action: z.literal("reject") }),
]);
export const proposalComparisonReadSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  intakeId: uuid, view: z.enum(["staff", "customer"]), afterId: uuid.optional() });
export const proposalComparisonResultSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  comparisonId: uuid, revision: z.union([z.literal(1), z.literal(2)]), state: z.enum(["draft", "approved", "rejected"]),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), outcomeCode: z.enum(["recorded", "replayed"]) });
export const proposalComparisonPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  items: z.array(z.strictObject({ comparisonId: uuid, intakeId: uuid, state: z.enum(["draft", "approved", "rejected"]),
    revision: z.union([z.literal(1), z.literal(2)]), createdAt: time, decidedAt: time.nullable(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(), current: z.boolean(), canApprove: z.boolean(), canReject:z.boolean(), reason: text(2000).nullable(),
    sources: z.array(z.strictObject({ proposalVersionId: uuid, versionNumber: z.number().int().min(1).max(10000),
      vendorName: text(200), quote: proposalQuoteSchema, receivedAt: time, approvedAt: time })).min(2).max(5) })).max(5),
  nextCursor: uuid.nullable(),
});

/** Formats exact nonnegative minor units without float division or conversion. */
export function formatProposalQuoteAmount(value: number | null, currency: string | null): string {
  if (value === null) return "Unknown";
  const code = proposalQuoteCurrencySchema.parse(currency);
  const parsed = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(value);
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: code });
  const digits = formatter.resolvedOptions().maximumFractionDigits!;
  const scale = BigInt(10) ** BigInt(digits), integer = BigInt(parsed);
  const fraction = (integer % scale).toString().padStart(digits, "0");
  return formatter.formatToParts(integer / scale).map((part) => part.type === "fraction" ? fraction : part.value).join("");
}

/** Parse a written currency amount without rounding or floating-point division. */
export function parseProposalQuoteAmount(value: string, currency: string): number | null {
  const input=value.trim();
  if(input==="")return null;
  const code=proposalQuoteCurrencySchema.parse(currency);
  const digits=new Intl.NumberFormat("en-US",{style:"currency",currency:code}).resolvedOptions().maximumFractionDigits!;
  const match=/^(0|[1-9][0-9]{0,15})(?:\.([0-9]+))?$/.exec(input);
  if(!match||(match[2]?.length??0)>digits)throw new Error("Use a nonnegative amount with the currency's exact decimal places.");
  const minor=BigInt(match[1]!)*(BigInt(10)**BigInt(digits))+BigInt((match[2]??"").padEnd(digits,"0")||"0");
  if(minor>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("The quoted amount is too large.");
  return Number(minor);
}
