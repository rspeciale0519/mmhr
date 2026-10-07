import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getAgentIdCallbackUrl, getVerifiedAgentIdUser, isAgentIdSignInEnabled,
  validateAgentIdAuthorizationUrl } from "./agentid";

const subject = "11111111-1111-4111-8111-111111111111";
const user = { id: subject, email: "agent@example.test", email_confirmed_at: "2026-09-30T12:00:00Z",
  is_anonymous: false, identities: [{ provider: "custom:agentid" }] };
function client(claims: unknown = { sub: subject, aal: "aal1" }, profile: unknown = user) {
  return { auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: profile }, error: null }) } };
}
function authorizationUrl() {
  const url = new URL("https://project.supabase.co/auth/v1/authorize");
  url.searchParams.set("provider", "custom:agentid");
  url.searchParams.set("redirect_to", getAgentIdCallbackUrl());
  return url;
}

describe("AgentID identity boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://mmhr.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("AGENTID_SIGN_IN_ENABLED", "0");
  });
  afterEach(() => vi.unstubAllEnvs());

  test.each([undefined, "", "true", "0", "false"])("stays disabled for %s", value => {
    vi.stubEnv("AGENTID_SIGN_IN_ENABLED", value);
    expect(isAgentIdSignInEnabled()).toBe(false);
  });
  test("requires an explicit enable flag", () => {
    vi.stubEnv("AGENTID_SIGN_IN_ENABLED", "1");
    expect(isAgentIdSignInEnabled()).toBe(true);
  });
  test.each(["http://localhost:3000", "http://127.0.0.1:3012", "http://[::1]:3000", "https://mmhr.example.test"])(
    "accepts configured safe origin %s", origin => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
      expect(getAgentIdCallbackUrl()).toBe(`${origin}/auth/agentid/callback`);
    });
  test.each(["", "http://evil.example", "https://user:password@mmhr.example.test", "https://mmhr.example.test/other",
    "https://mmhr.example.test?return=evil", "https://mmhr.example.test#evil", "ftp://localhost"])(
    "rejects unsafe app configuration %s", origin => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
      expect(() => getAgentIdCallbackUrl()).toThrow();
    });
  test("accepts only the configured provider authorization URL", () => {
    const url = authorizationUrl();
    expect(validateAgentIdAuthorizationUrl(url.href)).toBe(url.href);
  });
  test.each(["origin", "path", "provider", "duplicate-provider", "redirect", "duplicate-redirect", "credentials", "fragment"])(
    "denies authorization URL with changed %s", change => {
      const url = authorizationUrl();
      if (change === "origin") url.hostname = "evil.example";
      if (change === "path") url.pathname = "/other";
      if (change === "provider") url.searchParams.set("provider", "google");
      if (change === "duplicate-provider") url.searchParams.append("provider", "custom:agentid");
      if (change === "redirect") url.searchParams.set("redirect_to", "https://evil.example");
      if (change === "duplicate-redirect") url.searchParams.append("redirect_to", getAgentIdCallbackUrl());
      if (change === "credentials") url.username = "private";
      if (change === "fragment") url.hash = "private";
      expect(() => validateAgentIdAuthorizationUrl(url.href)).toThrow();
    });
  test.each([null, undefined, {}, "not-a-url"])("rejects malformed provider response %s", value => {
    expect(() => validateAgentIdAuthorizationUrl(value)).toThrow();
  });
  test("uses verified claims and the matching live Auth user", async () => {
    const supabase = client();
    await expect(getVerifiedAgentIdUser(supabase as never)).resolves.toEqual({ id: subject, email: user.email });
    expect(supabase.auth.getClaims).toHaveBeenCalledOnce();
    expect(supabase.auth.getUser).toHaveBeenCalledOnce();
  });
  test.each([null, {}, { sub: "invalid", aal: "aal1" }, { sub: subject, aal: "aal0" }])(
    "rejects invalid claims before reading user", async claims => {
      const supabase = client(claims);
      await expect(getVerifiedAgentIdUser(supabase as never)).rejects.toThrow();
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    });
  test.each([
    { ...user, id: "22222222-2222-4222-8222-222222222222" },
    { ...user, email_confirmed_at: null }, { ...user, is_anonymous: true },
    { ...user, identities: [{ provider: "email" }] },
    { ...user, identities: [], user_metadata: { provider: "custom:agentid", role: "staff" } },
  ])("rejects unverified or mismatched live user %#", async profile => {
    await expect(getVerifiedAgentIdUser(client(undefined, profile) as never)).rejects.toThrow();
  });
  test("does not return caller metadata as authority", async () => {
    const supabase = client(undefined, { ...user, user_metadata: { role: "staff", organization_id: "other" } });
    expect(await getVerifiedAgentIdUser(supabase as never)).toEqual({ id: subject, email: user.email });
  });
});
