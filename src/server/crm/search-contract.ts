import "server-only";

import { z } from "zod";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const label = z.string().trim().min(1).max(200);

export const crmSearchResources = [
  "customer",
  "vendor",
  "product",
  "contact",
  "deal",
  "activity",
] as const;
export type CrmSearchResource = (typeof crmSearchResources)[number];

export const crmSearchStatuses = [
  "prospect",
  "active",
  "paused",
  "closed",
  "draft",
  "lead",
  "discovery",
  "qualified",
  "evaluation",
  "proposal",
  "selected",
  "contracted",
  "selection",
  "contracting",
  "won",
  "lost",
  "archived",
] as const;
export type CrmSearchStatus = (typeof crmSearchStatuses)[number];

export const crmSearchInputSchema = z.strictObject({
  organizationId: uuid,
  resource: z.enum(crmSearchResources),
  query: z.string().trim().max(200).optional(),
  statuses: z.array(z.enum(crmSearchStatuses)).max(10).default([]),
  limit: z.int().min(1).max(100).default(25),
  cursor: uuid.nullable().default(null),
});
export type CrmSearchInput = z.input<typeof crmSearchInputSchema>;
export type ParsedCrmSearchInput = z.output<typeof crmSearchInputSchema>;

/** Search rows contain only fields approved for a CRM result list. */
// This schema intentionally strips unknown database columns before returning a
// result. Search input remains strict; result redaction is an output boundary.
export const crmSearchResultSchema = z.object({
  recordId: uuid,
  organizationId: uuid,
  resource: z.enum(crmSearchResources),
  label,
  status: z.enum(crmSearchStatuses),
});
export type CrmSearchResult = z.output<typeof crmSearchResultSchema>;

export class CrmSearchError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "CROSS_ORGANIZATION" | "INVALID_RESULT") {
    super(code === "INVALID_INPUT"
      ? "CRM search input is invalid"
      : code === "CROSS_ORGANIZATION"
        ? "CRM search scope is invalid"
        : "CRM search result is invalid");
    this.name = "CrmSearchError";
  }
}

export function parseCrmSearchInput(input: unknown): ParsedCrmSearchInput {
  const parsed = crmSearchInputSchema.safeParse(input);
  if (!parsed.success) throw new CrmSearchError("INVALID_INPUT");
  return parsed.data;
}

/**
 * Filters already-authorized rows without exposing fields that are not part of
 * the result contract. Database access and permission evaluation stay outside.
 */
export function redactCrmSearchResults(
  rows: readonly unknown[],
  scopeOrganizationId: string,
  resource: CrmSearchResource,
  limit = 25,
): readonly CrmSearchResult[] {
  const scope = uuid.safeParse(scopeOrganizationId);
  if (!scope.success) throw new CrmSearchError("CROSS_ORGANIZATION");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new CrmSearchError("INVALID_INPUT");
  }

  const results = rows.map((row) => {
    const parsed = crmSearchResultSchema.safeParse(row);
    if (!parsed.success) throw new CrmSearchError("INVALID_RESULT");
    if (parsed.data.organizationId !== scope.data || parsed.data.resource !== resource) {
      throw new CrmSearchError("CROSS_ORGANIZATION");
    }
    return parsed.data;
  });

  return results
    .sort((left, right) => left.recordId.localeCompare(right.recordId))
    .slice(0, limit)
    .map(({ recordId, organizationId, resource: rowResource, label: rowLabel, status }) => ({
      recordId,
      organizationId,
      resource: rowResource,
      label: rowLabel,
      status,
    }));
}
