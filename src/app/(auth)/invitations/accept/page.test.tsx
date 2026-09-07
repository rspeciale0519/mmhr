import { beforeEach, expect, test, vi } from "vitest";

import { requirePageIdentity } from "@/server/auth/page-guards";
import { getMyInvitations, InvitationReadError } from "@/server/commands/invitation-read";
import InvitationAcceptancePage from "./page";

vi.mock("@/server/auth/page-guards", () => ({ requirePageIdentity: vi.fn() }));
vi.mock("@/server/commands/invitation-read", () => ({
  getMyInvitations: vi.fn(),
  InvitationReadError: class InvitationReadError extends Error {},
}));

beforeEach(() => {
  vi.mocked(requirePageIdentity).mockReset().mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" });
  vi.mocked(getMyInvitations).mockReset();
});

test("renders the empty invitation state", async () => {
  vi.mocked(getMyInvitations).mockResolvedValue([]);
  await expect(InvitationAcceptancePage()).resolves.toMatchObject({ type: "main" });
  const page = await InvitationAcceptancePage();
  expect(JSON.stringify(page)).toContain("No pending invitations");
});

test("renders safe invitation details and an acceptance form", async () => {
  vi.mocked(getMyInvitations).mockResolvedValue([{
    invitation_id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    organization_name: "Example Organization",
    role_key: "organization_admin",
    expires_at: "2026-09-06T12:00:00.000Z",
  }]);
  const page = await InvitationAcceptancePage();
  expect(JSON.stringify(page)).toContain("Example Organization");
  expect(JSON.stringify(page)).toContain("11111111-1111-4111-8111-111111111111");
  expect(JSON.stringify(page)).not.toContain("member@example.test");
});

test("returns a generic load error", async () => {
  vi.mocked(getMyInvitations).mockRejectedValue(new InvitationReadError("UNAVAILABLE"));
  const page = await InvitationAcceptancePage();
  expect(JSON.stringify(page)).toContain("Invitations unavailable");
});
