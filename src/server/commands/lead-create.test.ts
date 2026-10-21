import { describe, expect, test, vi } from "vitest";

import {
  createLead,
  LeadCreateError,
  leadCreateInputSchema,
} from "./lead-create";

const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const result = {
  lead_id: "11111111-1111-4111-8111-111111111111",
  status: "new",
  owner_identity_id: null,
  outcome_code: "created",
  correlation_id: "22222222-2222-4222-8222-222222222222",
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

  test("maps the actual SQL result columns into the application result", async () => {
    await expect(createLead(input, { supabase: client() as never })).resolves.toEqual({
      leadId: result.lead_id, status: "new", ownerIdentityId: null,
      outcomeCode: "created", correlationId: result.correlation_id,
    });
  });

  test("returns replay and conflict outcomes from the shared contract", async () => {
    const replay = client([{ ...result, outcome_code: "replayed" }]);
    await expect(createLead(input, { supabase: replay as never })).resolves.toMatchObject({ outcomeCode: "replayed" });
    const conflict = client([{ ...result, lead_id: null, status: null, outcome_code: "idempotency_conflict" }]);
    await expect(createLead(input, { supabase: conflict as never })).resolves.toMatchObject({ outcomeCode: "idempotency_conflict" });
  });

  test("maps database validation outcomes to invalid input", async () => {
    const invalid = client([{
      ...result,
      lead_id: null,
      status: null,
      outcome_code: "invalid_input",
    }]);
    await expect(createLead(input, { supabase: invalid as never }))
      .rejects.toMatchObject({ name: LeadCreateError.name, code: "INVALID_INPUT" });
  });

  test("returns a redacted rate limit outcome", async () => {
    const supabase = client([{ ...result, lead_id: null, status: null, outcome_code: "rate_limited" }]);
    await expect(createLead(input, { supabase: supabase as never })).resolves.toMatchObject({
      outcomeCode: "rate_limited", leadId: null, ownerIdentityId: null, status: null,
    });
  });

  test.each([
    undefined, null, [], [result, result],
    [{ ...result, lead_id: null }],
    [{ ...result, outcome_code: "rate_limited" }],
    [{ ...result, internal_notes: "private" }],
  ])("rejects malformed or inconsistent SQL rows %#", async (data) => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data, error: null }) };
    await expect(createLead(input, { supabase: supabase as never })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("classifies a missing RPC envelope", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue(undefined) };
    await expect(createLead(input, { supabase: supabase as never })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("classifies invalid input and database failures without exposing details", async () => {
    await expect(createLead({ ...input, unexpected: true } as never, { supabase: client() as never }))
      .rejects.toMatchObject({ name: LeadCreateError.name, code: "INVALID_INPUT" });
    await expect(createLead(input, { supabase: client(null, new Error("private database detail")) as never }))
      .rejects.toMatchObject({ name: LeadCreateError.name, code: "UNAVAILABLE" });
  });
});
