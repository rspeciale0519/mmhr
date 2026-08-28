import { createClient } from "@/lib/supabase/server";

export type VerifiedIdentity = {
  id: string;
};

function hasClaims(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseVerifiedIdentity(claims: unknown): VerifiedIdentity | null {
  if (!hasClaims(claims)) return null;

  const subject = claims.sub;
  if (typeof subject !== "string" || subject.trim().length === 0) return null;

  return { id: subject };
}

/**
 * Reads one verified JWT and returns only its stable subject identifier.
 * Stored identity, membership, and permission checks remain separate controls.
 */
export async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) return null;

  return parseVerifiedIdentity(data?.claims);
}
