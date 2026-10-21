import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import {
  createContact,
  createContactInputSchema,
  createProduct,
  createProductInputSchema,
  CrmDatabaseCommandError,
  executeCrmDatabaseCommand,
  updateContactInputSchema,
  updateProductInputSchema,
} from "./crm-database";

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
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const vendorProfileId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const contactId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const actorId = "77777777-7777-4777-8777-777777777777";
const correlationId = "88888888-8888-4888-8888-888888888888";

const contactInput = {
  organizationId,
  fullName: "  Alex Example ",
  normalizedEmail: "Alex@Example.com",
  phone: " +1 (212) 555-0100 ",
  title: "Buyer",
  idempotencyKey,
};
const productInput = {
  organizationId,
  vendorProfileId,
  stableKey: "  core_product ",
  name: "  Core Product ",
  description: null,
  idempotencyKey,
};
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = {
  supabase,
  identityId: actorId,
  scope: { kind: "organization", organizationId },
  assurance: "aal2",
  correlationId,
} as const satisfies AuthorizationContext;

describe("CRM database command boundary", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  });

  test("normalizes strict contact and product DTOs", () => {
    expect(createContactInputSchema.parse(contactInput)).toEqual({
      organizationId,
      fullName: "Alex Example",
      normalizedEmail: "alex@example.com",
      phone: "+1 (212) 555-0100",
      title: "Buyer",
      status: "active",
      idempotencyKey,
    });
    expect(createContactInputSchema.safeParse({ ...contactInput, unexpected: true }).success).toBe(false);
    expect(createProduct).toBeTypeOf("function");
  });

  test.each([
    ["contact email", { ...contactInput, normalizedEmail: "not-an-email" }],
    ["contact unsupported field", { ...contactInput, unexpected: true }],
    ["contact empty patch", { organizationId, contactId, expectedRevision: 1, idempotencyKey }],
    ["product stable key", { ...productInput, stableKey: "Not valid" }],
    ["product unsupported field", { ...productInput, unexpected: true }],
    ["product empty patch", { organizationId, productId, expectedRevision: 1, idempotencyKey }],
  ])("rejects invalid %s before authorization", (_, input) => {
    const schema = input.organizationId === organizationId && "contactId" in input
      ? updateContactInputSchema
      : "productId" in input
        ? updateProductInputSchema
        : "stableKey" in input && "vendorProfileId" in input
          ? createProductInputSchema
          : createContactInputSchema;
    expect(schema.safeParse(input).success).toBe(false);
  });

  test("denies a context that returns a different organization scope", async () => {
    vi.mocked(requirePermission).mockResolvedValue({
      ...context,
      scope: { kind: "organization", organizationId: otherOrganizationId },
    });

    await expect(createContact(contactInput, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "workspace.access",
      { kind: "organization", organizationId },
      { supabase },
    );
  });

  test("preserves an authorization denial and never reaches the unavailable adapter", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());

    await expect(createProduct(productInput, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("calls the fixed contact RPC after exact organization authorization", async () => {
    rpc.mockResolvedValue({
      data: {
        operation: "create_contact",
        recordId: contactId,
        organizationId,
        revision: 1,
        outcomeCode: "created",
        correlationId,
      },
      error: null,
    });

    await expect(createContact(contactInput, { supabase })).resolves.toMatchObject({
      operation: "create_contact", recordId: contactId,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_create_contact", {
      payload: createContactInputSchema.parse(contactInput),
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    });
  });

  test("maps a fixed CRM RPC error to a generic rejected command", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("private database detail") });
    await expect(createContact(contactInput, { supabase })).rejects.toMatchObject({
      name: CrmDatabaseCommandError.name,
      code: "REJECTED",
      message: "CRM command could not be completed",
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "workspace.access",
      { kind: "organization", organizationId },
      { supabase },
    );
  });

  test("accepts a reviewed adapter result only when operation and organization match", async () => {
    const result = await createContact(contactInput, {
      supabase,
      adapter: vi.fn().mockResolvedValue({
        operation: "create_contact",
        recordId: contactId,
        organizationId,
        revision: 1,
        outcomeCode: "created",
        correlationId,
      }),
    });
    expect(result).toMatchObject({ operation: "create_contact", recordId: contactId });
  });

  test("rejects malformed or cross-organization adapter results", async () => {
    const adapter = vi.fn().mockResolvedValue({
      operation: "create_product",
      recordId: productId,
      organizationId,
      revision: 1,
      outcomeCode: "created",
      correlationId,
    });
    await expect(createContact(contactInput, { supabase, adapter })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(createContact(contactInput, {
      supabase,
      adapter: vi.fn().mockResolvedValue({
        operation: "create_contact",
        recordId: contactId,
        organizationId: otherOrganizationId,
        revision: 1,
        outcomeCode: "created",
        correlationId,
      }),
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("maps adapter failures to an unavailable command without exposing details", async () => {
    await expect(createProduct(productInput, {
      supabase,
      adapter: vi.fn().mockRejectedValue(new Error("private database detail")),
    })).rejects.toMatchObject({ code: "UNAVAILABLE", message: "CRM command could not be completed" });
  });

  test("rejects unknown operations before authorization", async () => {
    await expect(executeCrmDatabaseCommand({ operation: "delete_contact", input: {} } as never))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
  });
});
