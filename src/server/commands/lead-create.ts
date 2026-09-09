import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { RequestSupabaseClient } from "@/server/auth/authorization";

const freeEmailDomains = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

const trimmedText = (max: number) => z.string().trim().min(1).max(max);

const workEmail = z.string().trim().toLowerCase().max(320)
  .email()
  .refine((value) => !freeEmailDomains.has(value.split("@")[1] ?? ""), {
    message: "A work email address is required",
  });

const phone = z.string().trim().regex(/^\+?[0-9 ()\-.]{7,24}$/)
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    return `${value.startsWith("+") ? "+" : ""}${digits}`;
  })
  .refine((value) => value.replace("+", "").length >= 7 && value.replace("+", "").length <= 15, {
    message: "A valid company phone number is required",
  });

const source = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const consentAt = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString())
  .refine((value) => new Date(value).getTime() <= Date.now(), { message: "Consent cannot be in the future" });

export const leadCreateInputSchema = z.strictObject({
  fullName: trimmedText(200),
  company: trimmedText(200),
  workEmail,
  directCompanyPhone: phone,
  source,
  consentAt,
  idempotencyKey: z.uuid().transform((value) => value.toLowerCase()),
});

export type LeadCreateInput = z.input<typeof leadCreateInputSchema>;
export type ParsedLeadCreateInput = z.output<typeof leadCreateInputSchema>;

export const leadStatuses = [
  "new",
  "contacted",
  "qualified",
  "disqualified",
  "converted",
  "archived",
] as const;

export const leadCreateResultSchema = z.strictObject({
  leadId: z.uuid().nullable(),
  status: z.enum(leadStatuses).nullable(),
  ownerIdentityId: z.uuid().nullable(),
  outcomeCode: z.enum(["created", "replayed", "idempotency_conflict", "invalid_input", "rate_limited"]),
  correlationId: z.uuid(),
}).refine((value) => {
  if (value.outcomeCode === "created" || value.outcomeCode === "replayed") {
    return value.leadId !== null && value.status !== null;
  }
  return value.leadId === null && value.status === null && value.ownerIdentityId === null;
}, { message: "Lead result does not match its outcome" });

// PostgREST preserves RETURNS TABLE column names. Map them explicitly at this boundary.
const leadDatabaseResultSchema = z.strictObject({
  lead_id: z.uuid().nullable(),
  status: z.enum(leadStatuses).nullable(),
  owner_identity_id: z.uuid().nullable(),
  outcome_code: z.enum(["created", "replayed", "idempotency_conflict", "invalid_input", "rate_limited"]),
  correlation_id: z.uuid(),
}).transform((row) => ({
  leadId: row.lead_id, status: row.status, ownerIdentityId: row.owner_identity_id,
  outcomeCode: row.outcome_code, correlationId: row.correlation_id,
})).pipe(leadCreateResultSchema);

export type LeadCreateResult = z.infer<typeof leadCreateResultSchema>;

export class LeadCreateError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT" ? "Lead input is invalid" : "Lead could not be created");
    this.name = "LeadCreateError";
  }
}

type LeadCreateOptions = { supabase?: RequestSupabaseClient };

/**
 * Shared lead boundary for public capture and future authenticated callers.
 * The database function owns normalization, idempotency, audit, and isolation.
 */
export async function createLead(
  input: unknown,
  options: LeadCreateOptions = {},
): Promise<LeadCreateResult> {
  const parsed = leadCreateInputSchema.safeParse(input);
  if (!parsed.success) throw new LeadCreateError("INVALID_INPUT");

  let supabase: RequestSupabaseClient;
  try {
    supabase = options.supabase ?? await createClient();
  } catch {
    throw new LeadCreateError("UNAVAILABLE");
  }

  let response;
  try {
    response = await supabase.rpc("mmhr_create_lead", {
      full_name: parsed.data.fullName,
      company: parsed.data.company,
      work_email: parsed.data.workEmail,
      phone: parsed.data.directCompanyPhone,
      source: parsed.data.source,
      consent_at: parsed.data.consentAt,
      idempotency_key: parsed.data.idempotencyKey,
    });
  } catch {
    throw new LeadCreateError("UNAVAILABLE");
  }
  if (!response) throw new LeadCreateError("INVALID_RESPONSE");
  if (response.error) throw new LeadCreateError("UNAVAILABLE");

  const rows = z.array(leadDatabaseResultSchema).length(1).safeParse(response.data);
  if (!rows.success) throw new LeadCreateError("INVALID_RESPONSE");
  const result = rows.data[0];
  if (result.outcomeCode === "invalid_input") {
    throw new LeadCreateError("INVALID_INPUT");
  }
  return result;
}
