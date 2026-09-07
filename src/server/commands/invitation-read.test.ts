import { beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { getMyInvitations, InvitationReadError } from "./invitation-read";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const row = {
  invitation_id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  organization_name: "Example Organization",
  role_key: "viewer",
  expires_at: "2026-09-06T12:00:00.000Z",
};

describe("invitation read command", () => {
  beforeEach(() => vi.mocked(createClient).mockReset());

  test("reads only the fixed current-caller RPC and validates safe fields", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    await expect(getMyInvitations()).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith("mmhr_get_my_invitations");
  });

  test.each([
    [{ data: null, error: null }, "INVALID_RESPONSE"],
    [{ data: [{ ...row, organization_name: "" }], error: null }, "INVALID_RESPONSE"],
    [{ data: [row], error: new Error("denied") }, "REJECTED"],
  ])("rejects an unsafe response", async (response, code) => {
    vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue(response) } as never);
    await expect(getMyInvitations()).rejects.toMatchObject({ code });
  });

  test("maps client transport failures to a safe error", async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockRejectedValue(new Error("provider details")),
    } as never);
    await expect(getMyInvitations()).rejects.toBeInstanceOf(InvitationReadError);
  });
});
