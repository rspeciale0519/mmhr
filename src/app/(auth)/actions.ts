"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { AccountSetupError, completeAccountSetup } from "@/server/auth/account-setup";
import { emailConfirmationUrl } from "@/server/auth/email-confirmation";
import { signedInDestination } from "@/server/auth/workspace-entry";
import { createLead, LeadCreateError } from "@/server/commands/lead-create";
import { z } from "zod";

export type AuthState =
  | { error: string; success?: never }
  | { error?: never; success: string }
  | null;

const signUpPasswordSchema = z.string().min(12).max(72);
const signUpFailureMessage = "We could not complete registration. Please try again later.";
const signInFailureMessage = "We could not sign you in. Check your email and password, then try again.";

function authenticationFailure(error: unknown, fallback: string) {
  if (error instanceof AccountSetupError) {
    return { error: error.cleanupFailed
      ? "We could not finish account setup or confirm sign-out. Please sign out before trying again."
      : "We could not finish account setup. Please sign in again." };
  }
  return { error: fallback };
}

async function requireTrustedOrigin() {
  const requestHeaders = await headers();
  requireTrustedServerActionOrigin(requestHeaders.get("origin"));
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  await requireTrustedOrigin();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!signUpPasswordSchema.safeParse(password).success) {
    return { error: "Use a password with at least 12 characters." };
  }

  if (formData.get("consent") !== "on") {
    return { error: "Please agree to the contact and privacy notice." };
  }

  let supabase;
  try {
    supabase = await createClient({ requireCookieWrites: true });
    const lead = await createLead(
      {
        fullName: String(formData.get("fullName") ?? ""),
        company: String(formData.get("company") ?? ""),
        workEmail: email,
        directCompanyPhone: String(formData.get("directCompanyPhone") ?? ""),
        source: "registration",
        consentAt: new Date().toISOString(),
        idempotencyKey: randomUUID(),
      },
      { supabase },
    );
    if (lead.outcomeCode !== "created" && lead.outcomeCode !== "replayed") {
      return { error: signUpFailureMessage };
    }
  } catch (error) {
    if (error instanceof LeadCreateError && error.code === "INVALID_INPUT") {
      return { error: "Enter a valid work email, company, and direct company phone." };
    }
    return { error: "We could not complete registration. Please try again later." };
  }

  let destination;
  try {
    const response = await supabase.auth.signUp({
      email, password, options: { emailRedirectTo: emailConfirmationUrl() },
    });
    if (!response || response.error || !response.data?.user) return { error: signUpFailureMessage };
    if (!response.data.session) {
      return { success: "Check your email to confirm your account. Then sign in." };
    }
    await completeAccountSetup(supabase);
    destination = await signedInDestination(supabase);
  } catch (error) {
    return authenticationFailure(error, signUpFailureMessage);
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  await requireTrustedOrigin();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  let destination;
  try {
    const supabase = await createClient({ requireCookieWrites: true });
    const response = await supabase.auth.signInWithPassword({ email, password });
    if (!response || response.error || !response.data?.user || !response.data.session) {
      return { error: signInFailureMessage };
    }
    await completeAccountSetup(supabase);
    destination = await signedInDestination(supabase);
  } catch (error) {
    return authenticationFailure(error, signInFailureMessage);
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signOut() {
  await requireTrustedOrigin();

  const failureMessage = "Sign-out could not be confirmed. Please try again.";
  let response;
  try {
    const supabase = await createClient({ requireCookieWrites: true });
    response = await supabase.auth.signOut();
  } catch {
    throw new Error(failureMessage);
  }
  if (!response || response.error) throw new Error(failureMessage);

  revalidatePath("/", "layout");
  redirect("/sign-in");
}
