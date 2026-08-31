import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient,
} from "@/server/auth/authorization";
import {
  PermissionAdministrationError, readPermissionAdministration, type PermissionAdministrationInput,
} from "./permission-administration";

vi.mock("@/server/auth/authorization", () => ({
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor() { super("Request is not authorized"); }
  },
}));

const id = (value: number) => `abcdefab-2222-4222-8222-${value.toString(16).padStart(12, "0")}`;
const organizationId = id(900);
const correlationId = id(901);
const actorId = id(902);
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const options = { supabase, correlationId };
const context: AuthorizationContext = {
  supabase, correlationId, identityId: actorId, scope: { kind: "platform" }, assurance: "aal2",
};
const input: PermissionAdministrationInput = { permissionKey: "org.members.view", organizationId };
const override = {
  record_id: id(10), identity_id: id(903), permission_key: "org.members.view", organization_id: organizationId,
  effect: "allow", state: "active", source_delegation_id: id(2), expires_at_epoch: 1_800_000_000.125,
};
const delegation = {
  record_id: id(20), identity_id: id(904), permission_key: "org.members.view", organization_id: organizationId,
  state: "active", parent_grant_id: id(3), can_view: true, can_grant: false, can_revoke: true,
  can_delegate: false, expires_at_epoch: null,
};
const roles = [
  { stable_key: "super_admin", version: 2, effect: "allow" },
  { stable_key: "viewer", version: 1, effect: "deny" },
];
const page = { overrides: [override], delegations: [delegation], roles };
const emptyPage = { overrides: [], delegations: [], roles: [] };
const invoke = (value: unknown) => readPermissionAdministration(value as PermissionAdministrationInput, options);
const withOverride = (changes: object) => ({ ...page, overrides: [{ ...override, ...changes }] });
const withDelegation = (changes: object) => ({ ...page, delegations: [{ ...delegation, ...changes }] });
const withRole = (changes: object) => ({ ...page, roles: [{ ...roles[0], ...changes }] });

describe("caller-scoped permission administration reads", () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockReset().mockResolvedValue({ data: page, error: null });
  });

  test("uses platform command authority and an exact organization target", async () => {
    await expect(invoke(input)).resolves.toEqual({
      overrides: [{
        recordId: override.record_id, identityId: override.identity_id, permissionKey: input.permissionKey,
        organizationId, effect: "allow", state: "active", sourceDelegationId: id(2), expiresAtEpoch: 1_800_000_000.125,
      }],
      delegations: [{
        recordId: delegation.record_id, identityId: delegation.identity_id, permissionKey: input.permissionKey,
        organizationId, state: "active", parentGrantId: id(3), canView: true, canGrant: false,
        canRevoke: true, canDelegate: false, expiresAtEpoch: null,
      }],
      roles: [
        { stableKey: "super_admin", version: 2, effect: "allow" },
        { stableKey: "viewer", version: 1, effect: "deny" },
      ],
      nextPage: null,
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("permissions.view", { kind: "platform" }, options);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_read_permission_administration", {
      permission_key: input.permissionKey, organization_id: organizationId, limit_count: 50,
      after_override_id: null, after_delegation_id: null,
    });
  });

  test("supports an explicit platform target without assuming organization access", async () => {
    rpc.mockResolvedValue({ data: { ...emptyPage, roles: roles.slice(0, 1) }, error: null });
    await expect(readPermissionAdministration({ permissionKey: "admin.access", organizationId: null }))
      .resolves.toMatchObject({ nextPage: null });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("permissions.view", { kind: "platform" }, {});
    expect(rpc.mock.calls[0][1]).toEqual({
      permission_key: "admin.access", organization_id: null, limit_count: 50,
      after_override_id: null, after_delegation_id: null,
    });
  });

  test("uses only the client returned by the authorization check", async () => {
    const requestRpc = vi.fn().mockResolvedValue({ data: emptyPage, error: null });
    vi.mocked(requirePermission).mockResolvedValue({
      ...context, supabase: { rpc: requestRpc } as unknown as RequestSupabaseClient,
    });
    await invoke(input);
    expect(requestRpc).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("normalizes UUIDs without changing the requested key or independent cursors", async () => {
    rpc.mockResolvedValue({ data: withOverride({
      record_id: override.record_id.toUpperCase(), identity_id: override.identity_id.toUpperCase(),
      organization_id: organizationId.toUpperCase(), source_delegation_id: id(2).toUpperCase(),
    }), error: null });
    const result = await invoke({
      ...input, organizationId: organizationId.toUpperCase(), limit: 3,
      afterOverrideId: id(9).toUpperCase(), afterDelegationId: id(19).toUpperCase(),
    });
    expect(result.overrides[0]).toMatchObject({
      recordId: id(10), identityId: id(903), organizationId, sourceDelegationId: id(2),
    });
    expect(rpc.mock.calls[0][1]).toEqual({
      permission_key: input.permissionKey, organization_id: organizationId, limit_count: 3,
      after_override_id: id(9), after_delegation_id: id(19),
    });
  });

  test.each([
    null, undefined, [], {}, "all", { ...input, permissionKey: "unknown.permission" },
    { ...input, permissionKey: "ORG.MEMBERS.VIEW" }, { ...input, permissionKey: " org.members.view" },
    { permissionKey: input.permissionKey }, { ...input, organizationId: "invalid" },
    { ...input, organizationId: null }, { ...input, permissionKey: "admin.access" },
    { ...input, scope: { kind: "platform" } }, { ...input, actorId }, { ...input, actor_id: actorId },
    { ...input, identityId: actorId }, { ...input, supabase }, { ...input, correlationId },
    { ...input, rpc: "mmhr_other_function" },
    ...[null, 0, -1, 101, 1.5, "10", NaN, Infinity].map((limit) => ({ ...input, limit })),
    ...["invalid", "", 1, true, {}].flatMap((cursor) => [
      { ...input, afterOverrideId: cursor }, { ...input, afterDelegationId: cursor },
    ]),
  ])("rejects invalid scope, keys, cursors, limits, and caller metadata: %j", async (value) => {
    await expect(invoke(value)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("does not call the read RPC without current platform permission", async () => {
    const denial = new AuthorizationError();
    vi.mocked(requirePermission).mockRejectedValue(denial);
    await expect(invoke(input)).rejects.toBe(denial);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("sanitizes an unexpected authorization failure", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error("private authentication detail"));
    const result = invoke(input);
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Permission information could not be read" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).not.toHaveBeenCalled();
  });

  test("does not retry or expose a transport failure", async () => {
    rpc.mockRejectedValue(new Error("private connection detail"));
    const result = invoke(input);
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Permission information could not be read" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });

  test("respects the SQL can_view ceiling and discards data returned with an error", async () => {
    rpc.mockResolvedValue({ data: page, error: { code: "42501", message: "private ceiling detail" } });
    const result = invoke(input);
    await expect(result).rejects.toMatchObject({ code: "REJECTED", message: "Permission information could not be read" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });

  test.each([null, undefined])("rejects a missing transport response: %j", async (response) => {
    rpc.mockResolvedValue(response);
    await expect(invoke(input)).rejects.toMatchObject({ code: "REJECTED" });
  });

  test.each([
    null, undefined, [], [page], {}, { ...page, roles: null }, { ...page, debug: "private" },
    withOverride({ record_id: "invalid" }), withOverride({ identity_id: "invalid" }),
    withOverride({ permission_key: "unknown.permission" }), withOverride({ organization_id: "invalid" }),
    withOverride({ state: "suspended" }), withOverride({ effect: "grant" }),
    withOverride({ source_delegation_id: "invalid" }), withOverride({ source_delegation_id: undefined }),
    ...["1800000000", NaN, Infinity, -Infinity, 1e100, -1e100, undefined].map((expires_at_epoch) =>
      withOverride({ expires_at_epoch })),
    withOverride({ issue_reason: "private reason" }), withOverride({ email: "private@example.test" }),
    withDelegation({ parent_grant_id: "invalid" }), withDelegation({ parent_grant_id: delegation.record_id }),
    withDelegation({ token: "private" }), withDelegation({ expires_at_epoch: "infinity" }),
    ...["can_view", "can_grant", "can_revoke", "can_delegate"].flatMap((key) => [
      withDelegation({ [key]: "true" }), withDelegation({ [key]: undefined }),
    ]),
    withRole({ stable_key: "new_custom_role" }), withRole({ stable_key: "SUPER_ADMIN" }),
    ...[0, -1, 1.5, 2_147_483_648, "2", NaN, Infinity].map((version) => withRole({ version })),
    withRole({ effect: "permit" }), withRole({ description: "private" }),
    { ...page, roles: [roles[0], { ...roles[0], version: 3 }] },
    { ...page, roles: Array.from({ length: 7 }, () => roles[0]) },
  ])("rejects invalid or excessive response metadata without exposing it: %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    const result = invoke(input);
    await expect(result).rejects.toBeInstanceOf(PermissionAdministrationError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_RESPONSE", message: "Permission information could not be read" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });

  test.each([withOverride, withDelegation])("rejects another organization, platform scope, or permission in either collection", async (replace) => {
    for (const change of [
      { organization_id: id(999) }, { organization_id: null }, { permission_key: "org.members.invite" },
    ]) {
      rpc.mockResolvedValue({ data: replace(change), error: null });
      await expect(invoke(input)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  test("rejects organization rows and organization roles in a platform response", async () => {
    const platformInput = { permissionKey: "workspace.access", organizationId: null };
    for (const data of [
      { ...emptyPage, overrides: [{ ...override, permission_key: "workspace.access" }] },
      { ...emptyPage, delegations: [{ ...delegation, permission_key: "workspace.access" }] },
      { ...emptyPage, roles: roles.slice(1) },
    ]) {
      rpc.mockResolvedValue({ data, error: null });
      await expect(invoke(platformInput)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  test("keeps historical states, expiry, and four independent capability flags", async () => {
    for (const expires_at_epoch of [null, -1, 0, 1_800_000_000.125]) {
      rpc.mockResolvedValue({ data: {
        overrides: [{ ...override, state: "revoked", effect: "deny", source_delegation_id: null, expires_at_epoch }],
        delegations: [{ ...delegation, state: "revoked", parent_grant_id: null, can_view: false, can_grant: true,
          can_revoke: false, can_delegate: true, expires_at_epoch }], roles: [],
      }, error: null });
      await expect(invoke(input)).resolves.toMatchObject({
        overrides: [{ state: "revoked", effect: "deny", expiresAtEpoch: expires_at_epoch }],
        delegations: [{ state: "revoked", parentGrantId: null, canView: false, canGrant: true, canRevoke: false,
          canDelegate: true, expiresAtEpoch: expires_at_epoch }],
      });
    }
  });

  test.each([1, 100])("accepts the page limit boundary %i and empty results", async (limit) => {
    rpc.mockResolvedValue({ data: emptyPage, error: null });
    await expect(invoke({ ...input, limit })).resolves.toEqual({ ...emptyPage, nextPage: null });
    expect(rpc.mock.calls[0][1].limit_count).toBe(limit);
  });

  test.each(["overrides", "delegations"] as const)("bounds and orders the %s page", async (collection) => {
    const record = collection === "overrides" ? override : delegation;
    const cursorKey = collection === "overrides" ? "afterOverrideId" : "afterDelegationId";
    for (const { rows, afterId } of [
      { afterId: null, rows: [record, record] },
      { afterId: null, rows: [{ ...record, record_id: id(31) }, { ...record, record_id: id(30) }] },
      { afterId: record.record_id, rows: [record] },
      { afterId: record.record_id, rows: [{ ...record, record_id: id(1) }] },
      { afterId: null, rows: Array.from({ length: 3 }, (_, index) => ({ ...record, record_id: id(30 + index) })) },
      { afterId: null, rows: Array.from({ length: 101 }, (_, index) => ({ ...record, record_id: id(30 + index) })) },
    ]) {
      rpc.mockResolvedValue({ data: { ...emptyPage, [collection]: rows }, error: null });
      await expect(invoke({ ...input, limit: 2, [cursorKey]: afterId }))
        .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  test("preserves both independent cursors when each collection fills its limit", async () => {
    const result = await invoke({ ...input, limit: 1 });
    expect(result.nextPage).toEqual({
      ...input, limit: 1, afterOverrideId: override.record_id, afterDelegationId: delegation.record_id,
    });
  });

  test("advances the shorter collection and retains its cursor while the other continues", async () => {
    rpc.mockResolvedValueOnce({ data: {
      ...page, delegations: [delegation, { ...delegation, record_id: id(21) }],
    }, error: null });
    const first = await invoke({ ...input, limit: 2 });
    expect(first.nextPage).toEqual({ ...input, limit: 2, afterOverrideId: id(10), afterDelegationId: id(21) });
    rpc.mockResolvedValueOnce({ data: {
      ...emptyPage, delegations: [22, 23].map((value) => ({ ...delegation, record_id: id(value) })),
    }, error: null });
    const second = await invoke(first.nextPage);
    expect(second.nextPage).toEqual({ ...input, limit: 2, afterOverrideId: id(10), afterDelegationId: id(23) });
    rpc.mockResolvedValueOnce({ data: emptyPage, error: null });
    await expect(invoke(second.nextPage)).resolves.toEqual({ ...emptyPage, nextPage: null });
    expect(requirePermission).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[2][1]).toEqual({
      permission_key: input.permissionKey, organization_id: organizationId, limit_count: 2,
      after_override_id: id(10), after_delegation_id: id(23),
    });
  });

  test("retains an empty delegation cursor while overrides continue", async () => {
    rpc.mockResolvedValue({ data: { ...emptyPage, overrides: [override] }, error: null });
    const result = await invoke({ ...input, limit: 1, afterDelegationId: id(5) });
    expect(result.nextPage).toEqual({ ...input, limit: 1, afterOverrideId: id(10), afterDelegationId: id(5) });
  });

  test("allows the full 100-row boundary without a speculative extra RPC", async () => {
    rpc.mockResolvedValue({ data: {
      ...emptyPage, overrides: Array.from({ length: 100 }, (_, index) => ({ ...override, record_id: id(index + 1) })),
    }, error: null });
    const result = await invoke({ ...input, limit: 100 });
    expect(result.overrides).toHaveLength(100);
    expect(result.nextPage).toMatchObject({ afterOverrideId: id(100), afterDelegationId: null });
    expect(rpc).toHaveBeenCalledOnce();
  });
});
