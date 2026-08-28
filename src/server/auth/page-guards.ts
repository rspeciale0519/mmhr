import { redirect } from "next/navigation";

import {
  getVerifiedIdentity,
  type VerifiedIdentity,
} from "@/server/auth/verified-identity";

/**
 * Requires a verified identity before a Server Component can return content.
 * Permission and organization checks must run after this identity boundary.
 */
export async function requirePageIdentity(): Promise<VerifiedIdentity> {
  const identity = await getVerifiedIdentity();

  if (!identity) redirect("/sign-in");

  return identity;
}
