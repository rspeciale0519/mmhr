import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

/**
 * Prove the authentication round-trip against the running local stack.
 * This exercises Supabase Auth directly (no Next.js), so a failure here means
 * the stack/env is wrong rather than our UI.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
});
