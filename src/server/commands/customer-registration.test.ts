import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { startCustomerWorkspace } from "./customer-registration";

const correlationId = "11111111-1111-4111-8111-111111111111";
const subject = "44444444-4444-4444-8444-444444444444";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const getClaims = vi.fn(); const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc } as unknown as RequestSupabaseClient;

describe("customer registration adapter", () => {
  beforeEach(() => {
    getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
    rpc.mockReset().mockResolvedValue({ data: { identityId, organizationId, outcome: "created", correlationId }, error: null });
  });
  test("sends only a server correlation ID and accepts a caller-scoped receipt", async () => {
    expect(await startCustomerWorkspace({ supabase, correlationId })).toMatchObject({ organizationId, outcome: "created" });
    expect(subject).not.toBe(identityId);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_start_customer_workspace", { correlation_id: correlationId });
  });
  test("preserves existing access without selecting an organization", async () => {
    rpc.mockResolvedValue({ data: { identityId, organizationId: null, outcome: "existing_access", correlationId }, error: null });
    expect(await startCustomerWorkspace({ supabase, correlationId })).toMatchObject({ organizationId: null });
  });
  test.each([null, { error: { message: "private" } }, { data: { claims: {} }, error: null }])("denies invalid verified identity", async (value) => {
    getClaims.mockResolvedValue(value);
    await expect(startCustomerWorkspace({ supabase, correlationId })).rejects.toThrow("Customer workspace setup could not be completed");
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    null, { error: { message: "private SQL" } },
    { data: { identityId, organizationId, outcome: "created", correlationId: identityId }, error: null },
    { data: { identityId, organizationId: null, outcome: "created", correlationId }, error: null },
    { data: { identityId, organizationId, outcome: "existing_access", correlationId }, error: null },
    { data: { identityId, organizationId, outcome: "created", correlationId, email: "private" }, error: null },
  ])("rejects errors and malformed results without disclosure", async (response) => {
    rpc.mockResolvedValue(response);
    await expect(startCustomerWorkspace({ supabase, correlationId })).rejects.toThrow("Customer workspace setup could not be completed");
  });
  test("rejects a transport failure", async () => {
    rpc.mockRejectedValue(new Error("private SQL"));
    await expect(startCustomerWorkspace({ supabase, correlationId })).rejects.toThrow("Customer workspace setup could not be completed");
  });
  test("forwards concurrent retries without adding caller authority", async () => {
    const existing = { data: { identityId, organizationId, outcome: "existing", correlationId }, error: null };
    rpc.mockResolvedValueOnce({ data: { identityId, organizationId, outcome: "created", correlationId }, error: null })
      .mockResolvedValueOnce(existing);
    const results = await Promise.all([
      startCustomerWorkspace({ supabase, correlationId }),
      startCustomerWorkspace({ supabase, correlationId }),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual(["created", "existing"]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
