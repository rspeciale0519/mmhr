import { criteria, vendors, type Criterion } from "./data";

/** How much one requirement counts, from 0 (ignore) to 4 (must have). */
export type Weight = 0 | 1 | 2 | 3 | 4;
export type Weights = Record<string, Weight>;

export const MAX_WEIGHT = 4;
export const weightNames = ["Ignore", "Nice to have", "Useful", "Important", "Must have"] as const;

const defaultWeight: Record<Criterion["weight"], Weight> = { "Must have": 4, Important: 3, "Nice to have": 1 };

export function initialWeights(): Weights {
  return Object.fromEntries(criteria.map((criterion) => [criterion.id, defaultWeight[criterion.weight]]));
}

/**
 * Weighted fit from 0 to 100 for every vendor. Unknown scores count as zero
 * until verified, so missing evidence never helps a vendor. With every weight
 * at zero there is nothing to compare, and every vendor scores zero.
 */
export function weightedFit(weights: Weights): Record<string, number> {
  const total = criteria.reduce((sum, criterion) => sum + (weights[criterion.id] ?? 0), 0);
  return Object.fromEntries(
    vendors.map((vendor) => {
      if (total === 0) return [vendor.id, 0];
      const earned = criteria.reduce((sum, criterion) => {
        const score = criterion.scores[vendor.id] ?? null;
        return sum + (weights[criterion.id] ?? 0) * ((score ?? 0) / 5);
      }, 0);
      return [vendor.id, Math.round((earned / total) * 100)];
    }),
  );
}

/** Vendor ids from best to worst fit. Ties keep the original vendor order. */
export function rankVendors(fit: Record<string, number>): string[] {
  return vendors
    .map((vendor, index) => ({ id: vendor.id, index, fit: fit[vendor.id] ?? 0 }))
    .sort((a, b) => b.fit - a.fit || a.index - b.index)
    .map((item) => item.id);
}
