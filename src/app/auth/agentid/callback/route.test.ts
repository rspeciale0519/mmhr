import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { synchronizeCallerIdentity } from "@/server/commands/identity-synchronization";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/commands/identity-synchronization", () => ({ synchronizeCallerIdentity: vi.fn() }));
import { GET } from "./route";

const subject = "11111111-1111-4111-8111-111111111111";
const exchange = vi.fn(); const getClaims = vi.fn(); const getUser = vi.fn(); const signOut = vi.fn();
const request = (query = "?code=one-time-code", origin = "http://localhost:3000") => new Request(`${origin}/auth/agentid/callback${query}`);
describe("AgentID callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AGENTID_SIGN_IN_ENABLED", "1"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    exchange.mockResolvedValue({ data: { session: {}, user: { id: subject } }, error: null });
    getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: subject, email: "agent@agentmail.to", is_anonymous: false,
      email_confirmed_at: "2026-09-30T12:00:00Z", identities: [{ provider: "custom:agentid" }] } }, error: null });
    signOut.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({ auth: { exchangeCodeForSession: exchange, getClaims, getUser, signOut } } as never);
    vi.mocked(synchronizeCallerIdentity).mockResolvedValue({ identityId: subject, status: "pending", outcome: "created", correlationId: subject });
  });
  afterEach(() => vi.unstubAllEnvs());
  test("returns 404 when disabled", async () => {
    vi.stubEnv("AGENTID_SIGN_IN_ENABLED", "0");
    expect((await GET(request())).status).toBe(404); expect(createClient).not.toHaveBeenCalled();
  });
  test.each(["", "?code=", "?code=first&code=second", "?error=private-provider-details&code=value", `?code=${"a".repeat(4097)}`])(
    "denies invalid callback %# before exchanging", async query => {
      const response = await GET(request(query)); expect(response.status).toBe(400);
      expect(createClient).not.toHaveBeenCalled(); expect(await response.text()).not.toContain("private-provider-details");
    });
  test("denies a foreign host", async () => {
    expect((await GET(request("?code=value", "https://evil.example"))).status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });
  test("exchanges the code using strict browser cookies and sends new agents to registration", async () => {
    const response = await GET(request("?code=one-time-code&next=https://evil.example"));
    expect(exchange).toHaveBeenCalledExactlyOnceWith("one-time-code");
    expect(createClient).toHaveBeenCalledWith({ requireCookieWrites: true });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/agentid/complete-registration");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  test("uses the existing workspace for active identities", async () => {
    vi.mocked(synchronizeCallerIdentity).mockResolvedValue({ identityId: subject, status: "active", outcome: "unchanged", correlationId: subject });
    expect((await GET(request())).headers.get("location")).toBe("http://localhost:3000/home");
  });
  test("denies an expired or invalid PKCE exchange", async () => {
    exchange.mockResolvedValue({ data: { session: null, user: null }, error: new Error("private-secret") });
    const response = await GET(request()); expect(response.status).toBe(400);
    expect(synchronizeCallerIdentity).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private-secret");
  });
  test.each(["claims", "user", "synchronization"])("cleans up the new session after failed %s", async failure => {
    if (failure === "claims") getClaims.mockResolvedValue({ data: null, error: new Error("private-secret") });
    if (failure === "user") exchange.mockResolvedValue({ data: { session: {}, user: { id: "another" } }, error: null });
    if (failure === "synchronization") vi.mocked(synchronizeCallerIdentity).mockRejectedValue(new Error("private-secret"));
    const response = await GET(request()); expect(response.status).toBe(400);
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(response.headers.get("location")).toBeNull();
  });
  test("reports a cleanup failure without confirming sign-out", async () => {
    vi.mocked(synchronizeCallerIdentity).mockRejectedValue(new Error("private-secret"));
    signOut.mockResolvedValue({ error: new Error("private-secret") });
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Account setup failed. Sign out before trying again." });
  });
});
