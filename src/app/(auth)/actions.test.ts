import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { createLead, LeadCreateError } from "@/server/commands/lead-create";
import { completeAccountSetup } from "@/server/auth/account-setup";

vi.mock("@/server/auth/account-setup", async (original) => ({
  ...await original<typeof import("@/server/auth/account-setup")>(), completeAccountSetup: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/server/commands/lead-create", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/commands/lead-create")>();
  return { ...actual, createLead: vi.fn() };
});

import { signIn, signOut, signUp } from "@/app/(auth)/actions";

function authForm() {
  const form = new FormData();
  form.set("fullName", "Alex Example");
  form.set("company", "Example Co");
  form.set("email", "member@example.test");
  form.set("directCompanyPhone", "+1 (212) 555-0100");
  form.set("password", "local-test-password");
  form.set("consent", "on");
  return form;
}

describe("auth Server Actions", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(redirect).mockReset();
    vi.mocked(headers).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(completeAccountSetup).mockReset().mockResolvedValue(undefined);
    vi.mocked(createLead).mockReset().mockResolvedValue({
      leadId: "11111111-1111-4111-8111-111111111111",
      status: "new",
      ownerIdentityId: null,
      outcomeCode: "created",
      correlationId: "22222222-2222-4222-8222-222222222222",
    });
  });

  test.each([
    ["signUp", () => signUp(null, authForm())],
    ["signIn", () => signIn(null, authForm())],
    ["signOut", () => signOut()],
  ])("denies direct %s execution without an origin", async (_name, action) => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never);

    await expect(action()).rejects.toThrow("Server Action request rejected");
    expect(createClient).not.toHaveBeenCalled();
  });

  test.each([
    ["signUp", () => signUp(null, authForm())],
    ["signIn", () => signIn(null, authForm())],
    ["signOut", () => signOut()],
  ])("denies direct %s execution from a foreign origin", async (_name, action) => {
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "https://evil.example" }) as never,
    );

    await expect(action()).rejects.toThrow("Server Action request rejected");
    expect(createClient).not.toHaveBeenCalled();
  });

  test("allows sign-out from the exact configured origin", async () => {
    const signOutRequest = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signOut: signOutRequest },
    } as never);

    await signOut();

    expect(signOutRequest).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ requireCookieWrites: true });
  });

  test.each(["returned", "thrown", "missing"])("does not report successful sign-out after a %s provider failure", async (failure) => {
    vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
    const request = vi.fn();
    if (failure === "thrown") request.mockRejectedValue(new Error("private provider details"));
    else request.mockResolvedValue(failure === "missing" ? undefined : { error: new Error("private provider details") });
    vi.mocked(createClient).mockResolvedValue({ auth: { signOut: request } } as never);
    await expect(signOut()).rejects.toThrow("Sign-out could not be confirmed. Please try again.");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test("shows confirmation guidance when sign-up creates no session", async () => {
    const signUpRequest = vi.fn().mockResolvedValue({
      data: { session: null, user: { id: "local-user" } },
      error: null,
    });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpRequest },
    } as never);

    await expect(signUp(null, authForm())).resolves.toEqual({
      success: "Check your email to confirm your account. Then sign in.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test("rejects a sign-up response with no user and no provider error", async () => {
    const signUpRequest = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpRequest },
    } as never);

    await expect(signUp(null, authForm())).resolves.toEqual({
      error: "We could not complete registration. Please try again later.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test("rejects a sign-up password shorter than 12 characters before the provider call", async () => {
    const form = authForm();
    form.set("password", "short-pass");
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );

    await expect(signUp(null, form)).resolves.toEqual({
      error: "Use a password with at least 12 characters.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("rejects sign-up without explicit consent before lead or provider calls", async () => {
    const form = authForm();
    form.delete("consent");
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );

    await expect(signUp(null, form)).resolves.toEqual({
      error: "Please agree to the contact and privacy notice.",
    });
    expect(createLead).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  test("blocks the auth provider when lead capture rejects the registration", async () => {
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createLead).mockRejectedValueOnce(new LeadCreateError("UNAVAILABLE"));
    const signUpRequest = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpRequest },
    } as never);

    await expect(signUp(null, authForm())).resolves.toEqual({
      error: "We could not complete registration. Please try again later.",
    });
    expect(signUpRequest).not.toHaveBeenCalled();
  });

  test("sends all registration fields to the shared lead command", async () => {
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    const signUpRequest = vi.fn().mockResolvedValue({
      data: { session: null, user: { id: "local-user" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpRequest },
    } as never);

    await signUp(null, authForm());

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Alex Example",
        company: "Example Co",
        workEmail: "member@example.test",
        directCompanyPhone: "+1 (212) 555-0100",
        source: "registration",
        consentAt: expect.any(String),
        idempotencyKey: expect.any(String),
      }),
      { supabase: expect.anything() },
    );
    expect(signUpRequest).toHaveBeenCalledWith({
      email: "member@example.test",
      password: "local-test-password",
    });
  });

  test.each(["rate_limited", "idempotency_conflict", "invalid_input"] as const)(
    "does not create an Auth account after lead outcome %s", async (outcomeCode) => {
      vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
      vi.mocked(createLead).mockResolvedValue({
        leadId: null, status: null, ownerIdentityId: null, outcomeCode,
        correlationId: "22222222-2222-4222-8222-222222222222",
      });
      const signUpRequest = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
      vi.mocked(createClient).mockResolvedValue({ auth: { signUp: signUpRequest } } as never);
      await expect(signUp(null, authForm())).resolves.toEqual({
        error: "We could not complete registration. Please try again later.",
      });
      expect(signUpRequest).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  test("keeps sign-in provider behavior for an eight-character password", async () => {
    const signInRequest = vi.fn().mockResolvedValue({
      data: { session: { access_token: "test-token" }, user: { id: "local-user" } },
      error: null,
    });
    const form = authForm();
    form.set("password", "eight123");
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword: signInRequest },
    } as never);

    await signIn(null, form);

    expect(signInRequest).toHaveBeenCalledWith({
      email: "member@example.test",
      password: "eight123",
    });
  });

  test.each([
    undefined,
    { data: null, error: null },
    { data: { session: null, user: { id: "local-user" } }, error: null },
    { data: { session: { access_token: "test-token" }, user: null }, error: null },
  ])("rejects a sign-in response without both a user and session %#", async (response) => {
    const signInRequest = vi.fn().mockResolvedValue(response);
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword: signInRequest },
    } as never);

    await expect(signIn(null, authForm())).resolves.toEqual({
      error: "We could not sign you in. Check your email and password, then try again.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test("redacts sign-in provider errors", async () => {
    const signInRequest = vi.fn().mockResolvedValue({
      error: new Error("user enumeration and provider detail"),
    });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword: signInRequest },
    } as never);

    await expect(signIn(null, authForm())).resolves.toEqual({
      error: "We could not sign you in. Check your email and password, then try again.",
    });
  });

  test("redacts thrown sign-in provider errors", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword: vi.fn().mockRejectedValue(new Error("private provider details")) },
    } as never);
    await expect(signIn(null, authForm())).resolves.toEqual({
      error: "We could not sign you in. Check your email and password, then try again.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  test("redacts sign-up provider errors", async () => {
    const signUpRequest = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: new Error("provider internals and account state"),
    });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpRequest },
    } as never);

    await expect(signUp(null, authForm())).resolves.toEqual({
      error: "We could not complete registration. Please try again later.",
    });
  });

  test("redirects sign-up when the provider creates a session", async () => {
    const signUpRequest = vi.fn().mockResolvedValue({
      data: { session: { access_token: "test-token" }, user: { id: "local-user" } },
      error: null,
    });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ origin: "http://localhost:3000" }) as never,
    );
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpRequest },
    } as never);

    await signUp(null, authForm());

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/home");
  });
});
