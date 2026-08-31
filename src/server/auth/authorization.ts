import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  assuranceLevelSchema,
  isPermissionKey,
  isPermissionScopeAllowed,
  parsePermissionScope,
  permissionRegistry,
  type AssuranceLevel,
  type PermissionKey,
  type PermissionScope,
} from "./permission-registry";

export type RequestSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AuthorizationContext = {
  supabase: RequestSupabaseClient;
  identityId: string;
  scope: PermissionScope;
  assurance: AssuranceLevel;
  correlationId: string;
};

export type AuthorizationOptions = {
  // Only server composition roots can supply an existing request client.
  supabase?: RequestSupabaseClient;
  correlationId?: string;
};

const verifiedClaimsSchema = z.object({
  sub: z.uuid(),
  aal: assuranceLevelSchema,
});

const authorizationRowsSchema = z.array(z.object({
  identity_id: z.uuid(),
  authorized_organization_id: z.uuid().nullable(),
  assurance: assuranceLevelSchema,
})).max(1);

export class AuthorizationError extends Error {
  constructor() {
    super("Request is not authorized");
    this.name = "AuthorizationError";
  }
}

/**
 * Rechecks the caller on each use. SQL binds auth.uid() to the stable identity
 * and evaluates current stored authority; the client cannot supply an actor.
 */
export async function authorizePermission(
  permission: PermissionKey,
  scope: PermissionScope,
  options: AuthorizationOptions = {},
): Promise<AuthorizationContext | null> {
  if (!isPermissionKey(permission)) return null;
  const parsedScope = parsePermissionScope(scope);
  if (!parsedScope || !isPermissionScopeAllowed(permission, parsedScope)) return null;

  const correlation = z.uuid().safeParse(
    options.correlationId === undefined ? randomUUID() : options.correlationId,
  );
  if (!correlation.success) return null;

  const supabase = options.supabase ?? await createClient();
  const { data: verified, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) return null;
  const claims = verifiedClaimsSchema.safeParse(verified?.claims);
  if (!claims.success) return null;
  if (
    permissionRegistry[permission].minimumAssurance === "aal2" &&
    claims.data.aal !== "aal2"
  ) return null;

  const organizationId = parsedScope.kind === "organization"
    ? parsedScope.organizationId
    : null;
  const { data, error } = await supabase.rpc("mmhr_authorize", {
    permission_key: permission,
    organization_id: organizationId,
  });
  if (error) return null;
  const result = authorizationRowsSchema.safeParse(data);
  if (!result.success || result.data.length !== 1) return null;
  const row = result.data[0];
  if ((row.authorized_organization_id?.toLowerCase() ?? null) !== organizationId) return null;
  if (row.assurance !== claims.data.aal) return null;

  return {
    supabase,
    identityId: row.identity_id.toLowerCase(),
    scope: parsedScope,
    assurance: row.assurance,
    correlationId: correlation.data.toLowerCase(),
  };
}

export async function requirePermission(
  permission: PermissionKey,
  scope: PermissionScope,
  options: AuthorizationOptions = {},
): Promise<AuthorizationContext> {
  const context = await authorizePermission(permission, scope, options);
  if (!context) throw new AuthorizationError();
  return context;
}
