import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import { searchCrm } from "./crm-search-database";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error {
    constructor() {
      super("Request is not authorized");
      this.name = "AuthorizationError";
    }
  }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = {
  supabase,
  identityId: actorId,
  scope: { kind: "organization", organizationId },
  assurance: "aal1",
  correlationId,
} as const satisfies AuthorizationContext;

describe("CRM search database boundary", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  });

  test("calls the fixed RPC and redacts database rows", async () => {
    rpc.mockResolvedValue({
      data: [{
        recordId,
        organizationId,
        resource: "contact",
        label: "Alex Example",
        status: "active",
        normalizedEmail: "private@example.com",
      }],
      error: null,
    });

    await expect(searchCrm({ organizationId, resource: "contact" }, { supabase }))
      .resolves.toEqual([{
        recordId,
        organizationId,
        resource: "contact",
        label: "Alex Example",
        status: "active",
      }]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_search_crm", {
      payload: {
        organizationId,
        resource: "contact",
        statuses: [],
        limit: 25,
        cursor: null,
      },
    });
  });

  test("rejects a mismatched authorization scope", async () => {
    vi.mocked(requirePermission).mockResolvedValue({
      ...context,
      scope: { kind: "organization", organizationId: actorId },
    });
    await expect(searchCrm({ organizationId, resource: "contact" }, { supabase }))
      .rejects.toThrow("CRM search scope is invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  test("preserves authorization denials", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(searchCrm({ organizationId, resource: "contact" }, { supabase }))
      .rejects.toBeInstanceOf(AuthorizationError);
  });

  test("rejects malformed or cross-organization RPC rows", async () => {
    rpc.mockResolvedValue({
      data: [{ recordId, organizationId: actorId, resource: "contact", label: "Other", status: "active" }],
      error: null,
    });
    await expect(searchCrm({ organizationId, resource: "contact" }, { supabase }))
      .rejects.toThrow("CRM search scope is invalid");
    rpc.mockResolvedValue({ data: null, error: new Error("private detail") });
    await expect(searchCrm({ organizationId, resource: "contact" }, { supabase }))
      .rejects.toThrow("CRM search result is invalid");
  });
});
