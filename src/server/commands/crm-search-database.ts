import "server-only";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationOptions,
} from "@/server/auth/authorization";
import {
  CrmSearchError,
  parseCrmSearchInput,
  redactCrmSearchResults,
  type CrmSearchResult,
} from "@/server/crm/search-contract";

export type CrmSearchOptions = AuthorizationOptions;

export async function searchCrm(
  input: unknown,
  options: CrmSearchOptions = {},
): Promise<readonly CrmSearchResult[]> {
  const parsed = parseCrmSearchInput(input);
  let context;
  try {
    context = await requirePermission(
      "workspace.access",
      { kind: "organization", organizationId: parsed.organizationId },
      options,
    );
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new CrmSearchError("INVALID_RESULT");
  }
  if (
    context.scope.kind !== "organization"
    || context.scope.organizationId !== parsed.organizationId
  ) {
    throw new CrmSearchError("CROSS_ORGANIZATION");
  }

  const response = await context.supabase.rpc("mmhr_search_crm", { payload: parsed });
  if (response.error || !Array.isArray(response.data)) {
    throw new CrmSearchError("INVALID_RESULT");
  }
  return redactCrmSearchResults(
    response.data,
    parsed.organizationId,
    parsed.resource,
    parsed.limit,
  );
}
