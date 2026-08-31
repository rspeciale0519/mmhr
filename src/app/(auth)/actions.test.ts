import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

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

import { signIn, signOut, signUp } from "@/app/(auth)/actions";

function authForm() {
  const form = new FormData();
  form.set("email", "member@example.test");
  form.set("password", "local-test-password");
  return form;
}

describe("auth Server Actions", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(redirect).mockReset();
    vi.mocked(headers).mockReset();
    vi.mocked(createClient).mockReset();
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

  test("keeps sign-in provider behavior for an eight-character password", async () => {
    const signInRequest = vi.fn().mockResolvedValue({ error: null });
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
