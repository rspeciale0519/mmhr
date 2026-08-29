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

describe("request scoped client", () => {
  beforeEach(() => {
    getClaims.mockReset();
    rpc.mockReset();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getClaims },
      rpc,
    } as never);
  });

  test("rejects malformed organization identifiers before token access", async () => {
    await expect(createRequestScopedClient("not-a-uuid")).resolves.toBeNull();
    expect(getClaims).not.toHaveBeenCalled();
  });

  test("rejects missing or invalid claims", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    await expect(
      createRequestScopedClient("00000000-0000-4000-8000-000000000000"),
    ).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("requires both fixed identity and organization checks", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            id: "user-1",
            status: "active",
            normalized_email: "user@example.com",
            email_verified_at: "2026-08-28T00:00:00.000Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000000",
            name: "Acme",
            type: "customer",
            status: "active",
          },
        ],
        error: null,
      });

    await expect(
      createRequestScopedClient("00000000-0000-4000-8000-000000000000"),
    ).resolves.toMatchObject({
      identity: { id: "user-1" },
      organization: { name: "Acme" },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "mmhr_get_my_identity");
    expect(rpc).toHaveBeenNthCalledWith(2, "mmhr_get_organization", {
      organization_id: "00000000-0000-4000-8000-000000000000",
    });
  });

  test("throws a generic error when the organization is not authorized", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(
      requireRequestScopedClient("00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow("Request is not authorized for this organization");
  });
});
