import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAgentIdCallbackUrl, getVerifiedAgentIdUser, isAgentIdSignInEnabled } from "@/server/auth/agentid";
import { synchronizeCallerIdentity } from "@/server/commands/identity-synchronization";

export async function GET(request: Request) {
  const failure = () => NextResponse.json({ error: "AgentID sign-in could not be completed." }, {
    status: 400, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" },
  });
  if (!isAgentIdSignInEnabled()) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const codes = url.searchParams.getAll("code");
  if (url.searchParams.has("error") || codes.length !== 1 || !codes[0] || codes[0].length > 4096) return failure();
  let supabase;
  let sessionCreated = false;
  try {
    const callback = new URL(getAgentIdCallbackUrl());
    if (url.origin !== callback.origin || url.pathname !== callback.pathname) return failure();
    supabase = await createClient({ requireCookieWrites: true });
    // Supabase validates the one-time authorization code against this browser's PKCE verifier.
    const response = await supabase.auth.exchangeCodeForSession(codes[0]);
    sessionCreated = Boolean(response.data?.session);
    if (response.error || !sessionCreated || !response.data.user) throw new Error("Invalid exchange");
    const user = await getVerifiedAgentIdUser(supabase);
    if (user.id !== response.data.user.id) throw new Error("Identity mismatch");
    const identity = await synchronizeCallerIdentity({ supabase });
    // New agents must supply the same customer details and consent as password registrations.
    const destination = identity.status === "pending" ? "/agentid/complete-registration" : "/home";
    const result = NextResponse.redirect(new URL(destination, callback.origin), 303);
    result.headers.set("cache-control", "private, no-store");
    result.headers.set("referrer-policy", "no-referrer");
    return result;
  } catch {
    if (sessionCreated && supabase) {
      try {
        const cleanup = await supabase.auth.signOut({ scope: "local" });
        if (cleanup.error) throw new Error("Sign-out failed");
      } catch {
        return NextResponse.json({ error: "Account setup failed. Sign out before trying again." }, {
          status: 503, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" },
        });
      }
    }
    return failure();
  }
}
