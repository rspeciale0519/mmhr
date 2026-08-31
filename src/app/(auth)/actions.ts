"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { z } from "zod";

export type AuthState =
  | { error: string; success?: never }
  | { error?: never; success: string }
  | null;

const signUpPasswordSchema = z.string().min(12).max(72);

async function requireTrustedOrigin() {
  const requestHeaders = await headers();
  requireTrustedServerActionOrigin(requestHeaders.get("origin"));
}

/**
 * Foundation auth actions prove the round-trip end to end.
 *
 * The registration gate in FR-MKT-06 through FR-MKT-09 and organization
 * bootstrap remain unimplemented.
 */
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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };
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

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function signOut() {
  await requireTrustedOrigin();

  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/sign-in");
}
