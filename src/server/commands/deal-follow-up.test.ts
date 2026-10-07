import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { recordDealFollowUp, TaskRevisionConflict, TaskInputError } from "./deal-follow-up";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const rpc = vi.fn(), supabase = { rpc } as never, actor = randomUUID();
const command = { organizationId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID(), taskId: randomUUID(),
  action: "complete", expectedRevision: 4, reason: "Synthetic command verification" };
const receipt = { organizationId: command.organizationId, correlationId: command.correlationId, taskId: command.taskId,
  action: command.action, state: "completed", revision: 5, outcomeCode: "recorded" };
const context = { supabase, identityId: actor, assurance: "aal2" as const, correlationId: command.correlationId };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: receipt, error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_key, scope) => ({ ...context, scope }));
});
test("checks internal AAL2 and exact workspace before the request-scoped RPC", async () => {
  expect(await recordDealFollowUp(command, { supabase })).toEqual(receipt);
  expect(requirePermission).toHaveBeenNthCalledWith(1, "admin.access", { kind: "platform" }, { supabase, correlationId: command.correlationId });
  expect(requirePermission).toHaveBeenNthCalledWith(2, "workspace.access", { kind: "organization", organizationId: command.organizationId },
    { supabase, correlationId: command.correlationId });
  expect(rpc).toHaveBeenCalledWith("mmhr_record_deal_follow_up", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
});
test.each([{ assurance: "aal1" }, { correlationId: randomUUID() }, { scope: { kind: "organization", organizationId: randomUUID() } }])(
  "rejects changed internal authority before writes %#", async change => {
    vi.mocked(requirePermission).mockResolvedValueOnce({ ...context, scope: { kind: "platform" }, ...change } as never);
    await expect(recordDealFollowUp(command)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
  });
test.each([{ identityId: randomUUID() }, { scope: { kind: "organization", organizationId: randomUUID() } },
  { correlationId: randomUUID() }, { assurance: "aal1" }])("rejects changed scoped authority before writes %#", async change => {
  vi.mocked(requirePermission).mockResolvedValueOnce({ ...context, scope: { kind: "platform" } })
    .mockResolvedValueOnce({ ...context, scope: { kind: "organization", organizationId: command.organizationId }, ...change } as never);
  await expect(recordDealFollowUp(command)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
});
test("accepts an immutable original result without using the later revision", async () => {
  const original = { ...command, action: "edit", expectedRevision: 1, title: "Original title" };
  rpc.mockResolvedValue({ data: { ...receipt, action: "edit", revision: 2, state: "open", outcomeCode: "replayed" }, error: null });
  await expect(recordDealFollowUp(original)).resolves.toMatchObject({ revision: 2, state: "open", outcomeCode: "replayed" });
});
test.each([{ taskId: randomUUID() }, { organizationId: randomUUID() }, { correlationId: randomUUID() },
  { action: "cancel" }, { revision: 8 }, { state: "fabricated" }, { privateField: "private" }])("rejects altered results %#", async change => {
  rpc.mockResolvedValue({ data: { ...receipt, ...change }, error: null }); await expect(recordDealFollowUp(command)).rejects.toThrow();
});
test("keeps provider errors private and identifies scope denial and stale revisions", async () => {
  rpc.mockResolvedValueOnce({ error: { code: "42501", message: "Private row" } });
  await expect(recordDealFollowUp(command)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValueOnce({ error: { code: "40001", message: "Private row" } });
  await expect(recordDealFollowUp(command)).rejects.toBeInstanceOf(TaskRevisionConflict);
  rpc.mockResolvedValueOnce({ error: { code: "22023", message: "Private invalid field" } });
  await expect(recordDealFollowUp(command)).rejects.toBeInstanceOf(TaskInputError);
  rpc.mockRejectedValueOnce(new Error("Private transport configuration"));
  await expect(recordDealFollowUp(command)).rejects.toThrow("Task request failed");
});
test("rejects unknown actors and malformed commands before authorization", async () => {
  await expect(recordDealFollowUp({ ...command, actorIdentityId: actor })).rejects.toThrow();
  expect(requirePermission).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
