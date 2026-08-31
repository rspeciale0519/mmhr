import { describe, expect, test, vi } from "vitest";

import {
  createLead,
  LeadCreateError,
  leadCreateInputSchema,
} from "./lead-create";

const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const result = {
  leadId: "11111111-1111-4111-8111-111111111111",
  status: "new",
  ownerIdentityId: null,
  outcomeCode: "created",
  correlationId: "22222222-2222-4222-8222-222222222222",
};
const input = {
  fullName: "  Alex Example ",
  company: " Example Co ",
  workEmail: "Alex@Example.com",
  directCompanyPhone: "+1 (212) 555-0100",
  source: "Website",
  consentAt: "2026-08-30T12:00:00.000Z",
  idempotencyKey,
};

function client(data: unknown = [result], error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe("lead create contract", () => {
  test("normalizes strict input", () => {
    expect(leadCreateInputSchema.parse(input)).toMatchObject({
      fullName: "Alex Example",
      company: "Example Co",
      workEmail: "alex@example.com",
      directCompanyPhone: "+12125550100",
      source: "website",
      idempotencyKey,
    });
  });

  test.each([
    ["missing consent", { ...input, consentAt: undefined }],
    ["free email", { ...input, workEmail: "person@gmail.com" }],
    ["bad phone", { ...input, directCompanyPhone: "not a phone" }],
    ["future consent", { ...input, consentAt: "2099-01-01T00:00:00.000Z" }],
    ["unsupported field", { ...input, unexpected: true }],
  ])("rejects %s", (_, value) => {
    expect(leadCreateInputSchema.safeParse(value).success).toBe(false);
  });

  test("sends only the fixed DTO to the database function", async () => {
    const supabase = client();
    await createLead(input, { supabase: supabase as never });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith("mmhr_create_lead", {
      full_name: "Alex Example",
      company: "Example Co",
      work_email: "alex@example.com",
      phone: "+12125550100",
      source: "website",
      consent_at: "2026-08-30T12:00:00.000Z",
      idempotency_key: idempotencyKey,
    });
  });

  test("returns replay and conflict outcomes from the shared contract", async () => {
    const replay = client([{ ...result, outcomeCode: "replayed" }]);
    await expect(createLead(input, { supabase: replay as never })).resolves.toMatchObject({ outcomeCode: "replayed" });
    const conflict = client([{ ...result, leadId: null, status: null, outcomeCode: "idempotency_conflict" }]);
    await expect(createLead(input, { supabase: conflict as never })).resolves.toMatchObject({ outcomeCode: "idempotency_conflict" });
  });

  test("classifies invalid input and database failures without exposing details", async () => {
    await expect(createLead({ ...input, unexpected: true } as never, { supabase: client() as never }))
      .rejects.toMatchObject({ name: LeadCreateError.name, code: "INVALID_INPUT" });
    await expect(createLead(input, { supabase: client(null, new Error("private database detail")) as never }))
      .rejects.toMatchObject({ name: LeadCreateError.name, code: "UNAVAILABLE" });
  });
});
