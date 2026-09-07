import { beforeEach, describe, expect, test, vi } from "vitest";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePageIdentity } from "@/server/auth/page-guards";
import { acceptCallerInvitation } from "@/server/commands/invitation-database";

import { acceptInvitationAction } from "./actions";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ requirePageIdentity: vi.fn() }));
vi.mock("@/server/commands/invitation-database", () => ({
  acceptCallerInvitation: vi.fn(),
  InvitationDatabaseCommandError: class InvitationDatabaseCommandError extends Error {},
}));

const invitationId = "11111111-1111-4111-8111-111111111111";
const subjectId = "33333333-3333-4333-8333-333333333333";
const email = "member@example.test";
const providerUser = { id: subjectId, email, email_confirmed_at: "2026-09-03T00:00:00.000Z", is_anonymous: false };

function form(id = invitationId) {
  const value = new FormData();
  value.set("invitationId", id);
  return value;
}

describe("invitation acceptance action", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
    vi.mocked(requirePageIdentity).mockResolvedValue({ id: subjectId });
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(acceptCallerInvitation).mockReset();
  });

  test("accepts a pending caller without requiring an active workspace identity read", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: providerUser }, error: null });
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser }, rpc } as never);
    vi.mocked(acceptCallerInvitation).mockResolvedValue({
      invitationId, status: "accepted", outcome: "accepted", correlationId: "44444444-4444-4444-8444-444444444444",
    });

    await expect(acceptInvitationAction(null, form())).resolves.toEqual({
      success: "Invitation accepted. You can now open your workspace.",
    });
    expect(acceptCallerInvitation).toHaveBeenCalledWith(expect.objectContaining({
      invitationId, verifiedEmail: email,
    }), { supabase: expect.anything() });
    expect(vi.mocked(acceptCallerInvitation).mock.calls[0]![0]).not.toHaveProperty("identityId");
    expect(rpc).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/home");
  });

  test.each([
    ["invalid identifier", form("bad-id"), { data: { user: providerUser }, error: null }],
    ["missing provider user", form(), { data: { user: null }, error: null }],
    ["provider failure", form(), { data: { user: providerUser }, error: new Error("private") }],
    ["different provider subject", form(), { data: { user: { ...providerUser, id: "22222222-2222-4222-8222-222222222222" } }, error: null }],
    ["unverified email", form(), { data: { user: { ...providerUser, email_confirmed_at: null } }, error: null }],
    ["anonymous provider", form(), { data: { user: { ...providerUser, is_anonymous: true } }, error: null }],
  ])("returns generic failure for %s", async (_name, value, response) => {
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue(response) } } as never);
    await expect(acceptInvitationAction(null, value)).resolves.toEqual({
      error: "We could not accept that invitation. Refresh the page and try again.",
    });
    expect(acceptCallerInvitation).not.toHaveBeenCalled();
  });

  test("rejects an untrusted origin before provider lookup or acceptance", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ origin: "https://untrusted.example" }) as never);
    await expect(acceptInvitationAction(null, form())).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
    expect(acceptCallerInvitation).not.toHaveBeenCalled();
  });

  test("retains the operation key after a lost response and accepts its replay", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: providerUser }, error: null }) },
    } as never);
    vi.mocked(acceptCallerInvitation)
      .mockRejectedValueOnce(new Error("Response lost after commit"))
      .mockResolvedValueOnce({ invitationId, status: "accepted", outcome: "replayed", correlationId: subjectId });

    await expect(acceptInvitationAction(null, form())).resolves.toHaveProperty("error");
    await expect(acceptInvitationAction(null, form())).resolves.toHaveProperty("success");
    const [first, second] = vi.mocked(acceptCallerInvitation).mock.calls.map(([input]) => input);
    expect(first?.idempotencyKey).toBe(invitationId);
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(second?.correlationId).not.toBe(first?.correlationId);
  });

  test("uses a distinct operation key for a different invitation", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: providerUser }, error: null }) },
    } as never);
    vi.mocked(acceptCallerInvitation).mockRejectedValue(new Error("Unavailable"));
    await acceptInvitationAction(null, form());
    await acceptInvitationAction(null, form(subjectId));
    expect(vi.mocked(acceptCallerInvitation).mock.calls.map(([input]) => input.idempotencyKey))
      .toEqual([invitationId, subjectId]);
  });

  test("rejects duplicate invitation fields before provider access", async () => {
    const value = form();
    value.append("invitationId", subjectId);
    await expect(acceptInvitationAction(null, value)).resolves.toHaveProperty("error");
    expect(createClient).not.toHaveBeenCalled();
    expect(acceptCallerInvitation).not.toHaveBeenCalled();
  });
});
