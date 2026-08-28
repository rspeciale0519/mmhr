import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

/**
 * Prove the authentication round-trip against the running local stack.
 * This exercises Supabase Auth directly (no Next.js), so a failure here means
 * the stack/env is wrong rather than our UI.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireLocalSupabase(value: string | undefined) {
  if (!value) throw new Error("Local Supabase URL is required");

  const { hostname, port } = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("Integration tests require a loopback Supabase URL");
  }
  if (port !== "56321") {
    throw new Error("Integration tests require the MMHR local Supabase API");
  }
}

requireLocalSupabase(url);

describe("supabase auth round-trip (local stack)", () => {
  test("env is wired for the local stack", () => {
    expect(url).toBeTruthy();
    expect(anonKey).toBeTruthy();
  });

  test("sign-up establishes a session, then sign-out clears it", async () => {
    const supabase = createClient(url!, anonKey!);
    const email = `phase0-${Date.now()}@example.com`;

    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password: "phase0-test-password",
    });
    expect(signUpError).toBeNull();
    expect(signUp.session?.access_token).toBeTruthy();
    expect(signUp.user?.id).toBeTruthy();

    const { data: claims } = await supabase.auth.getClaims();
    expect(claims?.claims.sub).toBe(signUp.user!.id);

    const { error: signOutError } = await supabase.auth.signOut();
    expect(signOutError).toBeNull();

    const { data: after } = await supabase.auth.getSession();
    expect(after.session).toBeNull();
  });

  test("sign-in works for an existing user", async () => {
    const supabase = createClient(url!, anonKey!);
    const email = `phase0-signin-${Date.now()}@example.com`;
    const password = "phase0-test-password";

    await supabase.auth.signUp({ email, password });
    await supabase.auth.signOut();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
  });

  test("rejects malformed and tampered expired tokens", async () => {
    const supabase = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.auth.signUp({
      email: `phase0-invalid-${Date.now()}@example.com`,
      password: "phase0-test-password",
    });
    expect(error).toBeNull();

    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    const [header, payload, signature] = token!.split(".");
    const expiredPayload = {
      ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      exp: 1,
    };
    const expiredToken = [
      header,
      Buffer.from(JSON.stringify(expiredPayload)).toString("base64url"),
      signature,
    ].join(".");

    for (const untrustedToken of ["malformed-token", expiredToken]) {
      const result = await supabase.auth.getClaims(untrustedToken);
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    }
  });
});
