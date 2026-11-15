import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { completeAccountSetup } from "@/server/auth/account-setup";
import { emailConfirmationUrl, type EmailConfirmationNotice } from "@/server/auth/email-confirmation";
import { signedInDestination } from "@/server/auth/workspace-entry";

/**
 * Every exit is a fixed path on the configured application origin. Neither the
 * link nor the request host can choose a destination.
 */
function redirectTo(path: string) {
  const response = NextResponse.redirect(new URL(path, emailConfirmationUrl()), 303);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function signInWith(notice: EmailConfirmationNotice) {
  return redirectTo(`/sign-in?notice=${notice}`);
}

/**
 * Lands the sign-up confirmation link. Supabase verifies the email first and
 * then sends a one-time PKCE code, or error parameters for an expired or used link.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const codes = url.searchParams.getAll("code");
  if (url.searchParams.has("error") || url.searchParams.has("error_code")
    || codes.length !== 1 || !codes[0] || codes[0].length > 4096) {
    return signInWith("confirmation-link-invalid");
  }

  let supabase;
  try {
    supabase = await createClient({ requireCookieWrites: true });
    // Supabase checks the code against this browser's PKCE verifier from sign-up.
    const exchange = await supabase.auth.exchangeCodeForSession(codes[0]);
    if (exchange.error || !exchange.data?.session || !exchange.data.user) {
      return signInWith("confirmation-incomplete");
    }
  } catch {
    return signInWith("confirmation-incomplete");
  }

  try {
    // Setup signs the browser out again when it fails; sign-in repeats setup.
    await completeAccountSetup(supabase);
  } catch {
    return signInWith("email-confirmed");
  }
  return redirectTo(await signedInDestination(supabase));
}
