import { beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  createRequestScopedClient,
  requireRequestScopedClient,
} from "@/server/auth/request-scoped";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const getClaims = vi.fn();
const rpc = vi.fn();
const authUserId = "11111111-1111-4111-8111-111111111111";
const organizationId = "00000000-0000-4000-8000-000000000000";
const identity = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "active",
  normalized_email: "user@example.com",
  email_verified_at: "2026-08-28T00:00:00.000Z",
};
const organization = {
  id: organizationId,
  name: "Acme",
  type: "customer",
  status: "active",
};

describe("request scoped client", () => {
  beforeEach(() => {
    getClaims.mockReset();
    rpc.mockReset();
    getClaims.mockResolvedValue({
      data: { claims: { sub: authUserId } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getClaims },
      rpc,
    } as never);
  });

  test("rejects malformed organization identifiers before token access", async () => {
    await expect(createRequestScopedClient("not-a-uuid")).resolves.toBeNull();
    expect(getClaims).not.toHaveBeenCalled();
  });

  test.each([null, {}, { sub: "" }])(
    "rejects missing or invalid claims: %j",
    async (claims) => {
      getClaims.mockResolvedValue({ data: { claims }, error: null });
      await expect(createRequestScopedClient(organizationId)).resolves.toBeNull();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  test("rejects verification errors even when claims contain a subject", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: authUserId } },
      error: new Error("Token verification failed"),
    });
    await expect(createRequestScopedClient(organizationId)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("accepts a stable identity ID distinct from the verified Auth ID", async () => {
    rpc
      .mockResolvedValueOnce({ data: [identity], error: null })
      .mockResolvedValueOnce({ data: [organization], error: null });

    const context = await createRequestScopedClient(organizationId);
    expect(context).toMatchObject({
      identity,
      organization,
    });
    expect(identity.id).not.toBe(authUserId);
    expect(context?.identity).not.toHaveProperty("auth_user_id");
    expect(rpc).toHaveBeenNthCalledWith(1, "mmhr_get_my_identity");
    expect(rpc).toHaveBeenNthCalledWith(2, "mmhr_get_organization", {
      organization_id: organizationId,
    });
  });

  test("canonicalizes uppercase organization identifiers before scoped lookup", async () => {
    rpc
      .mockResolvedValueOnce({ data: [identity], error: null })
      .mockResolvedValueOnce({ data: [organization], error: null });

    await expect(createRequestScopedClient(organizationId.toUpperCase())).resolves.toMatchObject({ organization });
    expect(rpc).toHaveBeenNthCalledWith(2, "mmhr_get_organization", {
      organization_id: organizationId,
    });
  });

  test.each([{ data: null }, { data: [] }])(
    "rejects an absent active identity: $data",
    async ({ data }) => {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(createRequestScopedClient(organizationId)).resolves.toBeNull();
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  test("rejects an identity RPC error before organization access", async () => {
    rpc.mockResolvedValueOnce({
      data: [identity],
      error: new Error("Identity lookup failed"),
    });
    await expect(createRequestScopedClient(organizationId)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test.each([
    { data: null },
    { data: [] },
    { data: [{ ...organization, id: "33333333-3333-4333-8333-333333333333" }] },
  ])("rejects an absent or mismatched organization: $data", async ({ data }) => {
    rpc
      .mockResolvedValueOnce({ data: [identity], error: null })
      .mockResolvedValueOnce({ data, error: null });
    await expect(createRequestScopedClient(organizationId)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  test("rejects an organization RPC error", async () => {
    rpc
      .mockResolvedValueOnce({ data: [identity], error: null })
      .mockResolvedValueOnce({
        data: [organization],
        error: new Error("Organization lookup failed"),
      });
    await expect(createRequestScopedClient(organizationId)).resolves.toBeNull();
  });

  test("throws a generic error when the organization is not authorized", async () => {
    rpc
      .mockResolvedValueOnce({ data: [identity], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(requireRequestScopedClient(organizationId)).rejects.toThrow(
      "Request is not authorized for this organization",
    );
  });
});
