import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { AccountSetupError, completeAccountSetup } from "@/server/auth/account-setup";
import { signedInDestination } from "@/server/auth/workspace-entry";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/account-setup", async (original) => ({
  ...await original<typeof import("@/server/auth/account-setup")>(), completeAccountSetup: vi.fn(),
}));
vi.mock("@/server/auth/workspace-entry", () => ({ signedInDestination: vi.fn() }));
import { GET } from "./route";

const exchange = vi.fn();
const supabase = { auth: { exchangeCodeForSession: exchange } };
const request = (query: string, origin = "http://localhost:3000") => new Request(`${origin}/auth/confirm${query}`);
const signInNotice = (notice: string) => `http://localhost:3000/sign-in?notice=${notice}`;

describe("email confirmation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    exchange.mockResolvedValue({ data: { session: {}, user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(completeAccountSetup).mockResolvedValue(undefined);
    vi.mocked(signedInDestination).mockResolvedValue("/customer");
  });
  afterEach(() => vi.unstubAllEnvs());

  test("exchanges the code, completes setup, and opens the signed-in destination", async () => {
    const response = await GET(request("?code=one-time-code&next=https://evil.example"));
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ requireCookieWrites: true });
    expect(exchange).toHaveBeenCalledExactlyOnceWith("one-time-code");
    expect(completeAccountSetup).toHaveBeenCalledExactlyOnceWith(supabase);
    expect(signedInDestination).toHaveBeenCalledExactlyOnceWith(supabase);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/customer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("redirects to the configured origin, not the request host", async () => {
    const response = await GET(request("?code=one-time-code", "https://evil.example"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/customer");
  });

  test.each([
    "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    "?error_code=otp_expired",
    "",
    "?code=",
    "?code=first&code=second",
    `?code=${"a".repeat(4097)}`,
  ])("sends an expired, used, or malformed link %# to sign-in without an exchange", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(signInNotice("confirmation-link-invalid"));
    expect(createClient).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("expired");
  });

  test.each([
    { data: { session: null, user: null }, error: new Error("code verifier not found") },
    { data: { session: null, user: { id: "user" } }, error: null },
  ])("sends a failed code exchange %# to sign-in without setup", async (result) => {
    exchange.mockResolvedValue(result);
    const response = await GET(request("?code=one-time-code"));
    expect(response.headers.get("location")).toBe(signInNotice("confirmation-incomplete"));
    expect(completeAccountSetup).not.toHaveBeenCalled();
    expect(signedInDestination).not.toHaveBeenCalled();
  });

  test("treats a thrown exchange as an incomplete confirmation", async () => {
    exchange.mockRejectedValue(new Error("private provider details"));
    const response = await GET(request("?code=one-time-code"));
    expect(response.headers.get("location")).toBe(signInNotice("confirmation-incomplete"));
  });

  test("asks the confirmed customer to sign in when account setup fails", async () => {
    vi.mocked(completeAccountSetup).mockRejectedValue(new AccountSetupError(false));
    const response = await GET(request("?code=one-time-code"));
    expect(response.headers.get("location")).toBe(signInNotice("email-confirmed"));
    expect(signedInDestination).not.toHaveBeenCalled();
  });
});
