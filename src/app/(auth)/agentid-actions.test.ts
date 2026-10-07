import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { AccountSetupError, completeAccountSetup } from "@/server/auth/account-setup";
import { createLead } from "@/server/commands/lead-create";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/account-setup", async original => ({
  ...await original<typeof import("@/server/auth/account-setup")>(), completeAccountSetup: vi.fn(),
}));
vi.mock("@/server/commands/lead-create", async original => ({
  ...await original<typeof import("@/server/commands/lead-create")>(), createLead: vi.fn(),
}));
import { completeAgentIdRegistration, signInWithAgentId } from "./agentid-actions";

const subject = "11111111-1111-4111-8111-111111111111";
const callback = "http://localhost:3000/auth/agentid/callback";
const providerUrl = `https://project.supabase.co/auth/v1/authorize?provider=custom%3Aagentid&redirect_to=${encodeURIComponent(callback)}`;
function form() {
  const data = new FormData();
  Object.entries({ fullName: "Test Agent", company: "Test Company", directCompanyPhone: "+12125550100",
    consent: "on", idempotencyKey: "22222222-2222-4222-8222-222222222222", email: "attacker@example.test",
    role: "staff", organizationId: "other", redirectTo: "https://evil.example" }).forEach(([key, value]) => data.set(key, value));
  return data;
}
const oauth = vi.fn();
const getClaims = vi.fn();
const getUser = vi.fn();
describe("AgentID actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("AGENTID_SIGN_IN_ENABLED", "1");
    vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
    oauth.mockResolvedValue({ data: { url: providerUrl }, error: null });
    getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: subject, email: "verified@agentmail.to",
      email_confirmed_at: "2026-09-30T12:00:00Z", is_anonymous: false, identities: [{ provider: "custom:agentid" }] } }, error: null });
    vi.mocked(createClient).mockResolvedValue({ auth: { signInWithOAuth: oauth, getClaims, getUser } } as never);
    vi.mocked(createLead).mockResolvedValue({ leadId: subject, status: "new", ownerIdentityId: null,
      outcomeCode: "created", correlationId: subject });
    vi.mocked(completeAccountSetup).mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  test.each([null, "https://evil.example"])("denies actions from origin %s", async origin => {
    vi.mocked(headers).mockResolvedValue(new Headers(origin ? { origin } : {}) as never);
    await expect(signInWithAgentId(null, form())).rejects.toThrow("Server Action request rejected");
    await expect(completeAgentIdRegistration(null, form())).rejects.toThrow("Server Action request rejected");
    expect(createClient).not.toHaveBeenCalled();
  });
  test("denies both actions while disabled", async () => {
    vi.stubEnv("AGENTID_SIGN_IN_ENABLED", "0");
    expect(await signInWithAgentId(null, form())).toEqual({ error: "AgentID sign-in is not available yet." });
    expect(await completeAgentIdRegistration(null, form())).toEqual({ error: "AgentID sign-in is not available yet." });
    expect(createClient).not.toHaveBeenCalled();
  });
  test("uses a fixed provider, callback and scopes", async () => {
    await signInWithAgentId(null, form());
    expect(oauth).toHaveBeenCalledExactlyOnceWith({ provider: "custom:agentid",
      options: { redirectTo: callback, scopes: "openid email profile", skipBrowserRedirect: true } });
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ requireCookieWrites: true });
    expect(redirect).toHaveBeenCalledExactlyOnceWith(providerUrl);
    expect(completeAccountSetup).not.toHaveBeenCalled();
  });
  test.each(["provider-error", "foreign-url", "missing-url", "exception"])("rejects OAuth %s without exposing details", async kind => {
    if (kind === "exception") oauth.mockRejectedValue(new Error("private-secret"));
    else oauth.mockResolvedValue({ data: { url: kind === "foreign-url" ? "https://evil.example" : null },
      error: kind === "provider-error" ? new Error("private-secret") : null });
    const result = await signInWithAgentId(null, form());
    expect(result?.error).toBe("We could not sign you in with AgentID. Please try again.");
    expect(redirect).not.toHaveBeenCalled();
  });
  test("requires consent before creating a client", async () => {
    const data = form(); data.delete("consent");
    expect((await completeAgentIdRegistration(null, data))?.error).toContain("agree");
    expect(createClient).not.toHaveBeenCalled();
  });
  test("rejects invalid company details", async () => {
    const data = form(); data.set("directCompanyPhone", "invalid");
    expect((await completeAgentIdRegistration(null, data))?.error).toContain("valid name");
    expect(createLead).not.toHaveBeenCalled();
    expect(completeAccountSetup).not.toHaveBeenCalled();
  });
  test("takes email from the verified user and ignores caller authority fields", async () => {
    await completeAgentIdRegistration(null, form());
    expect(createLead).toHaveBeenCalledWith({ fullName: "Test Agent", company: "Test Company",
      directCompanyPhone: "+12125550100", workEmail: "verified@agentmail.to", source: "registration",
      consentAt: expect.any(String), idempotencyKey: "22222222-2222-4222-8222-222222222222" },
    { supabase: await vi.mocked(createClient).mock.results[0].value });
    expect(completeAccountSetup).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/home");
  });
  test("does not create a workspace if lead creation fails", async () => {
    vi.mocked(createLead).mockResolvedValue({ leadId: null, status: null, ownerIdentityId: null,
      outcomeCode: "rate_limited", correlationId: subject });
    expect((await completeAgentIdRegistration(null, form()))?.error).toContain("could not complete");
    expect(completeAccountSetup).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
  test("denies an unverified identity", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("private-secret") });
    expect((await completeAgentIdRegistration(null, form()))?.error).toContain("could not complete");
    expect(createLead).not.toHaveBeenCalled();
  });
  test("reports failed session cleanup", async () => {
    vi.mocked(completeAccountSetup).mockRejectedValue(new AccountSetupError(true));
    expect((await completeAgentIdRegistration(null, form()))?.error).toContain("Sign out before trying again");
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
