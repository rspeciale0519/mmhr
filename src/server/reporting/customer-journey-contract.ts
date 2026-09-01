import "server-only";

import { z } from "zod";

import { onboardingSchema, type Onboarding } from "@/server/workflows/onboarding-contract";
import { renewalSchema, type Renewal } from "@/server/workflows/renewal-contract";
import { customerSuccessOutcomeSchema, type CustomerSuccessOutcome } from "@/server/workflows/outcome-contract";

const timestamp = z.string().datetime({ offset: true });

export type CustomerJourneyReportRow = Readonly<{
  organizationId: string;
  onboardingCount: number;
  activeOnboardingCount: number;
  renewalCount: number;
  atRiskRenewalCount: number;
  outcomeCount: number;
  latestOutcomeType: CustomerSuccessOutcome["outcomeType"] | null;
}>;

export type CustomerJourneyReport = Readonly<{
  asOf: string;
  organizations: readonly CustomerJourneyReportRow[];
}>;

function parseAsOf(value: string | Date): string {
  const asOf = value instanceof Date ? value.toISOString() : value;
  if (!timestamp.safeParse(asOf).success) throw new Error("Invalid customer journey as-of timestamp");
  return asOf;
}

function parseUnique<T>(values: readonly unknown[], parse: (value: unknown) => T, label: string, identifier: (value: T) => string): T[] {
  const parsed = values.map(parse);
  const seen = new Set<string>();
  for (const value of parsed) {
    const id = identifier(value);
    if (seen.has(id)) throw new Error(`Duplicate customer journey ${label}`);
    seen.add(id);
  }
  return parsed;
}

/** Reconciles customer journey projections from immutable source snapshots. */
export function summarizeCustomerJourney(input: {
  onboardings: readonly unknown[];
  renewals: readonly unknown[];
  outcomes: readonly unknown[];
}, asOfInput: string | Date): CustomerJourneyReport {
  const asOf = parseAsOf(asOfInput);
  const onboardings = parseUnique(input.onboardings, (value) => onboardingSchema.parse(value), "onboarding", (value) => value.onboardingId);
  const renewals = parseUnique(input.renewals, (value) => renewalSchema.parse(value), "renewal", (value) => value.renewalId);
  const outcomes = parseUnique(input.outcomes, (value) => customerSuccessOutcomeSchema.parse(value), "outcome", (value) => value.outcomeId);
  const asOfMs = Date.parse(asOf);
  if (outcomes.some((outcome) => Date.parse(outcome.recordedAt) > asOfMs)) throw new Error("Customer journey source is after report as-of");
  const organizationIds = new Set<string>([
    ...onboardings.map((onboarding) => onboarding.organizationId),
    ...renewals.map((renewal) => renewal.organizationId),
    ...outcomes.map((outcome) => outcome.customerOrganizationId),
  ]);
  const organizations = [...organizationIds].sort().map((organizationId) => {
    const organizationOnboardings = onboardings.filter((onboarding) => onboarding.organizationId === organizationId);
    const organizationRenewals = renewals.filter((renewal) => renewal.organizationId === organizationId);
    const organizationOutcomes = outcomes.filter((outcome) => outcome.customerOrganizationId === organizationId)
      .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt) || right.outcomeId.localeCompare(left.outcomeId));
    return Object.freeze({
      organizationId,
      onboardingCount: organizationOnboardings.length,
      activeOnboardingCount: organizationOnboardings.filter((onboarding) => onboarding.status === "active" || onboarding.status === "at_risk" || onboarding.status === "reactivated").length,
      renewalCount: organizationRenewals.length,
      atRiskRenewalCount: organizationRenewals.filter((renewal) => renewal.status === "at_risk").length,
      outcomeCount: organizationOutcomes.length,
      latestOutcomeType: organizationOutcomes[0]?.outcomeType ?? null,
    });
  });
  return Object.freeze({ asOf, organizations: Object.freeze(organizations) });
}

export type { Onboarding, Renewal, CustomerSuccessOutcome };
