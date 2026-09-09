import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { startCustomerWorkspace } from "@/server/commands/customer-registration";
import { synchronizeCallerIdentity } from "@/server/commands/identity-synchronization";
import { completeAccountSetup } from "./account-setup";

vi.mock("node:crypto", () => ({ randomUUID: vi.fn() }));
vi.mock("@/server/commands/customer-registration", () => ({ startCustomerWorkspace: vi.fn() }));
vi.mock("@/server/commands/identity-synchronization", () => ({ synchronizeCallerIdentity: vi.fn() }));

const correlationId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const signOut = vi.fn();
const supabase = { auth: { signOut } } as unknown as RequestSupabaseClient;
const identity = { identityId, status: "pending" as const, outcome: "created" as const, correlationId };
const createdWorkspace = { identityId, organizationId, outcome: "created" as const, correlationId };

describe("completeAccountSetup", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { randomUUID } = await import("node:crypto");
    vi.mocked(randomUUID).mockReturnValue(correlationId);
    vi.mocked(synchronizeCallerIdentity).mockResolvedValue(identity);
    vi.mocked(startCustomerWorkspace).mockResolvedValue(createdWorkspace);
    signOut.mockResolvedValue({ error: null });
  });

  test.each([
    [identity, createdWorkspace],
    [{ ...identity, status: "active" as const, outcome: "unchanged" as const },
      { ...createdWorkspace, outcome: "existing" as const }],
    [{ ...identity, status: "active" as const, outcome: "synchronized" as const },
      { identityId, organizationId: null, outcome: "existing_access" as const, correlationId }],
  ])("uses one client and correlation for valid outcomes %#", async (identityResult, workspaceResult) => {
    vi.mocked(synchronizeCallerIdentity).mockResolvedValue(identityResult);
    vi.mocked(startCustomerWorkspace).mockResolvedValue(workspaceResult);

    await expect(completeAccountSetup(supabase)).resolves.toBeUndefined();

    expect(synchronizeCallerIdentity).toHaveBeenCalledOnce();
    expect(startCustomerWorkspace).toHaveBeenCalledOnce();
    const identityOptions = vi.mocked(synchronizeCallerIdentity).mock.calls[0][0];
    const workspaceOptions = vi.mocked(startCustomerWorkspace).mock.calls[0][0];
    expect(identityOptions).toEqual({ supabase, correlationId });
    expect(workspaceOptions).toEqual({ supabase, correlationId });
    expect(identityOptions?.supabase).toBe(supabase);
    expect(workspaceOptions?.supabase).toBe(supabase);
    expect(vi.mocked(synchronizeCallerIdentity).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(startCustomerWorkspace).mock.invocationCallOrder[0]);
    expect(signOut).not.toHaveBeenCalled();
  });

  test("stops before workspace setup when identity synchronization fails", async () => {
    vi.mocked(synchronizeCallerIdentity).mockRejectedValue(new Error("private identity failure"));

    await expect(completeAccountSetup(supabase)).rejects.toMatchObject({
      name: "AccountSetupError",
      message: "Account setup could not be completed",
      cleanupFailed: false,
    });
    expect(startCustomerWorkspace).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(vi.mocked(synchronizeCallerIdentity).mock.invocationCallOrder[0])
      .toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  test("cleans up when workspace setup fails", async () => {
    vi.mocked(startCustomerWorkspace).mockRejectedValue(new Error("private workspace failure"));

    await expect(completeAccountSetup(supabase)).rejects.toMatchObject({ cleanupFailed: false });
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(vi.mocked(startCustomerWorkspace).mock.invocationCallOrder[0])
      .toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  test("cleans up when correlation ID generation fails", async () => {
    const { randomUUID } = await import("node:crypto");
    vi.mocked(randomUUID).mockImplementationOnce(() => {
      throw new Error("private random failure");
    });

    await expect(completeAccountSetup(supabase)).rejects.toMatchObject({ cleanupFailed: false });
    expect(synchronizeCallerIdentity).not.toHaveBeenCalled();
    expect(startCustomerWorkspace).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  test("rejects mismatched identity results and cleans up", async () => {
    vi.mocked(startCustomerWorkspace).mockResolvedValue({
      ...createdWorkspace,
      identityId: "44444444-4444-4444-8444-444444444444",
    });

    await expect(completeAccountSetup(supabase)).rejects.toMatchObject({
      name: "AccountSetupError",
      message: "Account setup could not be completed",
      cleanupFailed: false,
    });
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  test("marks cleanup failure when local sign-out returns an error", async () => {
    signOut.mockResolvedValue({ error: new Error("private sign-out failure") });
    vi.mocked(startCustomerWorkspace).mockRejectedValue(new Error("private workspace failure"));

    await expect(completeAccountSetup(supabase)).rejects.toMatchObject({ cleanupFailed: true });
  });

  test.each([{}, { error: undefined }, null, { error: false }])(
    "marks cleanup failure for malformed local sign-out response %#",
    async (response) => {
      signOut.mockResolvedValue(response);
      vi.mocked(startCustomerWorkspace).mockRejectedValue(new Error("private workspace failure"));

      await expect(completeAccountSetup(supabase)).rejects.toMatchObject({ cleanupFailed: true });
    },
  );

  test("marks cleanup failure when local sign-out throws", async () => {
    signOut.mockRejectedValue(new Error("private sign-out failure"));
    vi.mocked(startCustomerWorkspace).mockRejectedValue(new Error("private workspace failure"));

    await expect(completeAccountSetup(supabase)).rejects.toMatchObject({ cleanupFailed: true });
  });
});
