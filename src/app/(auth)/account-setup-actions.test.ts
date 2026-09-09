import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { beforeEach, expect, test, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { AccountSetupError, completeAccountSetup } from "@/server/auth/account-setup";
import { signIn, signUp } from "./actions";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/account-setup", async (original) => ({
  ...await original<typeof import("@/server/auth/account-setup")>(), completeAccountSetup: vi.fn(),
}));
vi.mock("@/server/commands/lead-create", async (original) => ({
  ...await original<typeof import("@/server/commands/lead-create")>(),
  createLead: vi.fn().mockResolvedValue({ outcomeCode: "created" }),
}));

const authResponse = { data: { user: { id: "11111111-1111-4111-8111-111111111111" }, session: {} }, error: null };
const provider = vi.fn();
const supabase = { auth: { signUp: provider, signInWithPassword: provider } };
function form() {
  const data = new FormData();
  data.set("email", "member@example.test");
  data.set("password", "local-test-password");
  data.set("consent", "on");
  data.set("organizationId", "22222222-2222-4222-8222-222222222222");
  data.set("role", "super_admin");
  data.set("redirectTo", "https://outside.example");
  return data;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.mocked(headers).mockReset().mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
  vi.mocked(createClient).mockReset().mockResolvedValue(supabase as never);
  vi.mocked(completeAccountSetup).mockReset().mockResolvedValue(undefined);
  vi.mocked(redirect).mockReset().mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  vi.mocked(revalidatePath).mockReset();
  provider.mockReset().mockResolvedValue(authResponse);
});

for (const [name, action] of [["sign-in", signIn], ["sign-up", signUp]] as const) {
  test(`${name} completes setup before its fixed redirect without form authority`, async () => {
    await expect(action(null, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(completeAccountSetup).toHaveBeenCalledExactlyOnceWith(supabase);
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ requireCookieWrites: true });
    expect(vi.mocked(completeAccountSetup).mock.invocationCallOrder[0]).toBeGreaterThan(provider.mock.invocationCallOrder[0]!);
    expect(vi.mocked(revalidatePath).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(completeAccountSetup).mock.invocationCallOrder[0]!,
    );
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/home");
  });

  test.each([false, true])(`${name} stops on setup failure and reports cleanup uncertainty: %s`, async (cleanupFailed) => {
    vi.mocked(completeAccountSetup).mockRejectedValue(new AccountSetupError(cleanupFailed));
    await expect(action(null, form())).resolves.toEqual({ error: cleanupFailed
      ? "We could not finish account setup or confirm sign-out. Please sign out before trying again."
      : "We could not finish account setup. Please sign in again." });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test.each(["provider", "client"])(`${name} redacts thrown %s failures before setup`, async (failure) => {
    if (failure === "provider") provider.mockRejectedValue(new Error("private connection details"));
    else vi.mocked(createClient).mockRejectedValue(new Error("private configuration details"));
    const result = await action(null, form());
    expect(result?.error).toMatch(/We could not/);
    expect(result?.error).not.toMatch(/private|configuration|connection/);
    expect(completeAccountSetup).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test(`${name} waits for setup instead of redirecting while it is pending`, async () => {
    let finish: (() => void) | undefined;
    vi.mocked(completeAccountSetup).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = action(null, form());
    const result = expect(pending).rejects.toThrow("NEXT_REDIRECT");
    await vi.waitFor(() => expect(completeAccountSetup).toHaveBeenCalledOnce());
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    finish!();
    await result;
  });
}

test("sessionless registration keeps confirmation guidance without setup or redirect", async () => {
  provider.mockResolvedValue({ data: { user: authResponse.data.user, session: null }, error: null });
  await expect(signUp(null, form())).resolves.toEqual({ success: "Check your email to confirm your account. Then sign in." });
  expect(completeAccountSetup).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
