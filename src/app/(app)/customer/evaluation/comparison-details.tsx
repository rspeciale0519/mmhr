import type {
  AnnualCostEstimate, MaskedEvidence, PublishedFeatureDetail, SetupEstimate,
} from "@/server/matching/masked-publication-details";

const moduleLabels = {
  hr: "HR records", payroll: "Payroll", time: "Time tracking", benefits: "Benefits",
  recruiting: "Recruiting", performance: "Performance", learning: "Learning",
  expenses: "Expenses", compensation: "Compensation", analytics: "Analytics",
};
const assumptionLabels = {
  standard_configuration: "Standard configuration", customer_data_ready: "Customer data ready",
  single_entity: "One legal entity", multiple_entities: "Multiple legal entities",
  annual_billing: "Annual billing", monthly_billing: "Monthly billing", remote_training: "Remote training",
  standard_integrations: "Standard integrations", custom_integration_required: "Custom integration required",
};
const exclusionLabels = {
  taxes: "Taxes", implementation: "Implementation", migration: "Data migration",
  training: "Training", third_party_fees: "Third-party fees", optional_modules: "Optional modules",
};
const coverageLabels = {
  native: "Native", add_on: "Add-on", partner: "Partner", limited: "Limited",
  not_supported: "Not supported", unknown: "Delivery type unknown",
};
const outcomeLabels = { match: "Match confirmed", mismatch: "Does not match", unknown: "Needs confirmation" };
const scopeLabels = {
  initial_implementation: "Initial implementation", payroll_migration: "Payroll migration", module_addition: "Module addition",
};

export function evidenceDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function EvidenceDates({ evidence }: { evidence: MaskedEvidence }) {
  return <div className="space-y-1 text-xs leading-5 text-muted-foreground">
    <p>{evidence.basis === "override" ? "Approved staff override" : "Approved source evidence"}
      {evidence.version !== null ? `, version ${evidence.version}` : ""}.</p>
    <p>Captured: <time dateTime={evidence.capturedAt}>{evidenceDate(evidence.capturedAt)} UTC</time>.</p>
    <p>Reviewed: <time dateTime={evidence.reviewedAt}>{evidenceDate(evidence.reviewedAt)} UTC</time>.</p>
    <p>Review due: <time dateTime={evidence.validUntil}>{evidenceDate(evidence.validUntil)} UTC</time>.</p>
  </div>;
}

export function FeatureDetail({ feature }: { feature: PublishedFeatureDetail }) {
  return <div className="space-y-2">
    <p className={feature.outcome === "match" ? "font-medium text-teal-800 dark:text-teal-200" : "font-medium"}>
      {outcomeLabels[feature.outcome]}
    </p>
    <p className="text-xs text-muted-foreground">{coverageLabels[feature.coverage]}</p>
  </div>;
}

function estimateRange(range: { minimum: number; maximum: number }, format: (value: number) => string) {
  return range.minimum === range.maximum ? format(range.minimum) : `${format(range.minimum)} – ${format(range.maximum)}`;
}

export function AnnualCost({ estimate }: { estimate?: AnnualCostEstimate | null }) {
  if (!estimate) return <span className="text-muted-foreground">Unknown</span>;
  const money = (value: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: estimate.currency, currencyDisplay: "code", maximumFractionDigits: 2,
  }).format(value);
  return <div className="space-y-3 leading-6">
    <p className="font-semibold tabular-nums">{estimateRange(estimate.recurring, money)} / year</p>
    <p className="text-xs">Estimate for {estimate.employeeCount.toLocaleString("en-US")} employees.</p>
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium underline underline-offset-4 focus-visible:outline-2">Cost assumptions</summary>
      <div className="space-y-3">
    <p className="text-xs">Includes: {estimate.includedModules.map((item) => moduleLabels[item]).join(", ")}.</p>
    <p className="text-xs">Assumes: {estimate.assumptions.map((item) => assumptionLabels[item]).join(", ")}.</p>
    <p className="text-xs">Excludes: {estimate.exclusions.length
      ? estimate.exclusions.map((item) => exclusionLabels[item]).join(", ") : "None recorded"}.</p>
    <p className="text-xs">One-time charges: {estimate.oneTime ? estimateRange(estimate.oneTime, money) : "Unknown"}.</p>
    <EvidenceDates evidence={estimate.evidence} />
      </div>
    </details>
  </div>;
}

export function Setup({ estimate }: { estimate?: SetupEstimate | null }) {
  if (!estimate) return <span className="text-muted-foreground">Unknown</span>;
  return <div className="space-y-3 leading-6">
    <p className="font-semibold tabular-nums">{estimateRange(estimate.duration, (value) => value.toLocaleString("en-US"))} {estimate.unit}</p>
    <p className="text-xs">{scopeLabels[estimate.scope]}. Estimate, subject to the recorded assumptions.</p>
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium underline underline-offset-4 focus-visible:outline-2">Setup assumptions</summary>
      <div className="space-y-3">
    <p className="text-xs">Includes: {estimate.includedModules.map((item) => moduleLabels[item]).join(", ")}.</p>
    <p className="text-xs">Assumes: {estimate.assumptions.map((item) => assumptionLabels[item]).join(", ")}.</p>
    <EvidenceDates evidence={estimate.evidence} />
      </div>
    </details>
  </div>;
}
