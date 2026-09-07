"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { createLead, LeadCreateError } from "@/server/commands/lead-create";
import { z } from "zod";

export type AuthState =
  | { error: string; success?: never }
  | { error?: never; success: string }
  | null;

const signUpPasswordSchema = z.string().min(12).max(72);
const signUpFailureMessage = "We could not complete registration. Please try again later.";
const signInFailureMessage = "We could not sign you in. Check your email and password, then try again.";

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

  const supabase = await createClient();
  try {
    await createLead(
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
  } catch (error) {
    if (error instanceof LeadCreateError && error.code === "INVALID_INPUT") {
      return { error: "Enter a valid work email, company, and direct company phone." };
    }
    return { error: "We could not complete registration. Please try again later." };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: signUpFailureMessage };
  if (!data.session) {
    return {
      success: "Check your email to confirm your account. Then sign in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  await requireTrustedOrigin();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: signInFailureMessage };

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function signOut() {
  await requireTrustedOrigin();

  const failureMessage = "Sign-out could not be confirmed. Please try again.";
  let response;
  try {
    const supabase = await createClient();
    response = await supabase.auth.signOut();
  } catch {
    throw new Error(failureMessage);
  }
  if (!response || response.error) throw new Error(failureMessage);

  revalidatePath("/", "layout");
  redirect("/sign-in");
}
