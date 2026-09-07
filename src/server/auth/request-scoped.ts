import { createClient } from "@/lib/supabase/server";
import { parseVerifiedIdentity } from "./verified-identity";

export type RequestIdentity = {
  id: string;
  status: "active";
  normalized_email: string | null;
  email_verified_at: string;
};

export type RequestOrganization = {
  id: string;
  name: string | null;
  type: "internal" | "customer" | "vendor";
  status: "active";
};

export type RequestScopedContext = {
  identity: RequestIdentity;
  organization: RequestOrganization;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstRow<T>(value: T[] | null | undefined): T | null {
  return value?.[0] ?? null;
}

/**
 * Creates a data client only after Supabase verifies the token and the fixed
 * database functions confirm an active identity and organization membership.
 */
export async function createRequestScopedClient(
  organizationId: string,
): Promise<RequestScopedContext | null> {
  if (!uuidPattern.test(organizationId)) return null;
  const normalizedOrganizationId = organizationId.toLowerCase();

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const verified = parseVerifiedIdentity(claims?.claims);
  if (claimsError || !verified) return null;

  const { data: identityRows, error: identityError } = await supabase.rpc(
    "mmhr_get_my_identity",
  );
  if (identityError) return null;
  const identity = firstRow(identityRows as RequestIdentity[] | null);
  // The fixed RPC binds auth.uid() to the stored identity. Its stable ID is
  // separate from the Auth user ID in the verified JWT subject.
  if (!identity) return null;

  const { data: organizationRows, error: organizationError } =
    await supabase.rpc("mmhr_get_organization", {
      organization_id: normalizedOrganizationId,
    });
  if (organizationError) return null;
  const organization = firstRow(
    organizationRows as RequestOrganization[] | null,
  );
  if (!organization || organization.id.toLowerCase() !== normalizedOrganizationId) return null;

  return { supabase, identity, organization };
}

/**
 * Enforces the selected organization boundary before a caller can run data
 * access code. Callers must not fall back to the direct server database pool.
 */
export async function requireRequestScopedClient(
  organizationId: string,
): Promise<RequestScopedContext> {
  const context = await createRequestScopedClient(organizationId);
  if (!context) {
    throw new Error("Request is not authorized for this organization");
  }
  return context;
}
