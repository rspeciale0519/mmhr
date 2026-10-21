"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { AccountSetupError, completeAccountSetup } from "@/server/auth/account-setup";
import { createLead, leadCreateInputSchema } from "@/server/commands/lead-create";
import {
  agentIdFailureMessage, agentIdProvider, getAgentIdCallbackUrl,
  getVerifiedAgentIdUser, isAgentIdSignInEnabled, validateAgentIdAuthorizationUrl,
} from "@/server/auth/agentid";
import type { AuthState } from "./actions";

export async function signInWithAgentId(_previous: AuthState, _formData: FormData): Promise<AuthState> {
  // Caller fields cannot select the OAuth provider or the return URL.
  void _previous;
  void _formData;
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  if (!isAgentIdSignInEnabled()) return { error: "AgentID sign-in is not available yet." };
  let authorizationUrl: string;
  try {
    const supabase = await createClient({ requireCookieWrites: true });
    const response = await supabase.auth.signInWithOAuth({
      provider: agentIdProvider,
      options: { redirectTo: getAgentIdCallbackUrl(), scopes: "openid email profile", skipBrowserRedirect: true },
    });
    if (response.error) return { error: agentIdFailureMessage };
    authorizationUrl = validateAgentIdAuthorizationUrl(response.data.url);
  } catch {
    return { error: agentIdFailureMessage };
  }
  redirect(authorizationUrl);
}

export async function completeAgentIdRegistration(_previous: AuthState, formData: FormData): Promise<AuthState> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  if (!isAgentIdSignInEnabled()) return { error: "AgentID sign-in is not available yet." };
  if (formData.get("consent") !== "on") return { error: "Please agree to the contact and privacy notice." };
  let supabase;
  try {
    supabase = await createClient({ requireCookieWrites: true });
    const user = await getVerifiedAgentIdUser(supabase);
    const parsed = leadCreateInputSchema.safeParse({
      fullName: formData.get("fullName"), company: formData.get("company"),
      workEmail: user.email, directCompanyPhone: formData.get("directCompanyPhone"),
      source: "registration", consentAt: new Date().toISOString(),
      idempotencyKey: formData.get("idempotencyKey"),
    });
    if (!parsed.success) return { error: "Enter a valid name, company, and direct company phone." };
    const lead = await createLead(parsed.data, { supabase });
    if (!["created", "replayed"].includes(lead.outcomeCode)) {
      return { error: "We could not complete registration. Please try again." };
    }
    await completeAccountSetup(supabase);
  } catch (error) {
    if (error instanceof AccountSetupError && error.cleanupFailed) {
      return { error: "Account setup failed. Sign out before trying again." };
    }
    return { error: "We could not complete registration. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect("/home");
}
