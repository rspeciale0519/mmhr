import "server-only";

import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

export const agentIdProvider = "custom:agentid" as const;
export const agentIdCallbackPath = "/auth/agentid/callback";
export const agentIdFailureMessage = "We could not sign you in with AgentID. Please try again.";

type RequestClient = Awaited<ReturnType<typeof createClient>>;
const subject = z.uuid();
const claimsSchema = z.object({ sub: subject, aal: z.enum(["aal1", "aal2"]) });
const agentUserSchema = z.object({
  id: subject,
  email: z.email().max(254),
  email_confirmed_at: z.iso.datetime({ offset: true }),
  is_anonymous: z.literal(false),
  identities: z.array(z.object({ provider: z.string() })),
});

export function isAgentIdSignInEnabled(): boolean {
  return process.env.AGENTID_SIGN_IN_ENABLED === "1";
}

/** Uses configured origins; request hosts and caller-supplied return URLs are not trusted. */
export function getAgentIdCallbackUrl(): string {
  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname);
  if (appUrl.username || appUrl.password || appUrl.search || appUrl.hash
    || appUrl.pathname !== "/" || (appUrl.protocol !== "https:" && !(local && appUrl.protocol === "http:"))) {
    throw new Error(agentIdFailureMessage);
  }
  return new URL(agentIdCallbackPath, appUrl.origin).href;
}

export function validateAgentIdAuthorizationUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error(agentIdFailureMessage);
  const url = new URL(value);
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(supabaseUrl.hostname);
  if (supabaseUrl.username || supabaseUrl.password || supabaseUrl.search || supabaseUrl.hash
    || supabaseUrl.pathname !== "/" || (supabaseUrl.protocol !== "https:" && !(local && supabaseUrl.protocol === "http:"))
    || url.origin !== supabaseUrl.origin || url.username || url.password || url.hash
    || url.pathname !== "/auth/v1/authorize" || url.searchParams.getAll("provider").length !== 1
    || url.searchParams.get("provider") !== agentIdProvider
    || url.searchParams.getAll("redirect_to").length !== 1
    || url.searchParams.get("redirect_to") !== getAgentIdCallbackUrl()) {
    throw new Error(agentIdFailureMessage);
  }
  return url.href;
}

/** Agent identity does not grant membership, staff roles, or any permission. */
export async function getVerifiedAgentIdUser(supabase: RequestClient) {
  const verified = await supabase.auth.getClaims();
  const claims = claimsSchema.safeParse(verified.error ? null : verified.data?.claims);
  if (!claims.success) throw new Error(agentIdFailureMessage);
  const response = await supabase.auth.getUser();
  const user = agentUserSchema.safeParse(response.error ? null : response.data?.user);
  if (!user.success || user.data.id !== claims.data.sub
    || !user.data.identities.some(identity => identity.provider === agentIdProvider)) {
    throw new Error(agentIdFailureMessage);
  }
  return { id: user.data.id, email: user.data.email.trim().toLowerCase() };
}
