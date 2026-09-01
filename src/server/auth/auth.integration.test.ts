import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, test } from "vitest";

/**
 * Prove the authentication round-trip against the running local stack.
 * This exercises Supabase Auth directly (no Next.js), so a failure here means
 * the stack/env is wrong rather than our UI.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const createdUserIds: string[] = [];

function requireLocalSupabase(value: string | undefined) {
  if (!value) throw new Error("Local Supabase URL is required");

  const { hostname, port } = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("Integration tests require a loopback Supabase URL");
  }
  if (port !== "57021") {
    throw new Error("Integration tests require the MMHR local Supabase API");
  }
}

requireLocalSupabase(url);

if (!serviceRoleKey) {
  throw new Error("Local Supabase service role key is required");
}

const admin = createClient(url!, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createConfirmedUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  createdUserIds.push(data.user!.id);
  return data.user!;
}

describe("supabase auth round-trip (local stack)", () => {
  afterAll(async () => {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("env is wired for the local stack", () => {
    expect(url).toBeTruthy();
    expect(anonKey).toBeTruthy();
    expect(serviceRoleKey).toBeTruthy();
  });

  test("sign-up requires confirmation before it establishes a session", async () => {
    const supabase = createClient(url!, anonKey!);
    const email = `phase0-${Date.now()}@example.com`;
    const password = "phase0-test-password";

    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    expect(signUpError).toBeNull();
    expect(Boolean(signUp.session)).toBe(false);
    expect(signUp.user?.id).toBeTruthy();
    createdUserIds.push(signUp.user!.id);

    const beforeConfirmation = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    expect(beforeConfirmation.error).not.toBeNull();

    const { error: confirmationError } = await admin.auth.admin.updateUserById(
      signUp.user!.id,
      { email_confirm: true },
    );
    expect(confirmationError).toBeNull();

    const { data: signIn, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();
    expect(signIn.session?.access_token).toBeTruthy();

    const { data: claims } = await supabase.auth.getClaims();
    expect(claims?.claims.sub).toBe(signUp.user!.id);

    const { error: signOutError } = await supabase.auth.signOut();
    expect(signOutError).toBeNull();

    const { data: after } = await supabase.auth.getSession();
    expect(Boolean(after.session)).toBe(false);
  });

  test("sign-in works for an existing user", async () => {
    const supabase = createClient(url!, anonKey!);
    const email = `phase0-signin-${Date.now()}@example.com`;
    const password = "phase0-test-password";

    await createConfirmedUser(email, password);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
  });

  test("rejects a password shorter than 12 characters", async () => {
    const supabase = createClient(url!, anonKey!);
    const { data, error } = await supabase.auth.signUp({
      email: `phase0-short-${Date.now()}@example.com`,
      password: "short-pass",
    });

    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
    expect(Boolean(data.session)).toBe(false);
  });

  test("permits local TOTP enrollment", async () => {
    const supabase = createClient(url!, anonKey!);
    const email = `phase0-totp-${Date.now()}@example.com`;
    const password = "phase0-test-password";
    await createConfirmedUser(email, password);
    await supabase.auth.signInWithPassword({ email, password });

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "R1.2 integration test",
    });
    expect(error).toBeNull();
    if (!data) {
      throw new Error("TOTP enrollment did not return factor data");
    }
    expect(data.id).toBeTruthy();
    expect(data.totp.qr_code).toBeTruthy();
  });

  test("rejects malformed and tampered expired tokens", async () => {
    const supabase = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    const email = `phase0-invalid-${Date.now()}@example.com`;
    const password = "phase0-test-password";
    await createConfirmedUser(email, password);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
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
