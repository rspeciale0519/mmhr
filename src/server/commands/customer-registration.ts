import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizationOptions } from "@/server/auth/authorization";
import { securityUuidSchema } from "@/server/audit/security-values";

export class CustomerRegistrationError extends Error {
  constructor() { super("Customer workspace setup could not be completed"); }
}

const claimsSchema = z.object({ sub: securityUuidSchema, aal: z.enum(["aal1", "aal2"]) });
const resultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ identityId: securityUuidSchema, organizationId: securityUuidSchema,
    outcome: z.literal("created"), correlationId: securityUuidSchema }),
  z.strictObject({ identityId: securityUuidSchema, organizationId: securityUuidSchema,
    outcome: z.literal("existing"), correlationId: securityUuidSchema }),
  z.strictObject({ identityId: securityUuidSchema, organizationId: z.null(),
    outcome: z.literal("existing_access"), correlationId: securityUuidSchema }),
]);

/** No client-supplied identity, organization, role, or permission enters setup. */
export async function startCustomerWorkspace(options: AuthorizationOptions = {}) {
  try {
    const correlationId = securityUuidSchema.parse(options.correlationId ?? randomUUID());
    const supabase = options.supabase ?? await createClient();
    const verified = await supabase.auth.getClaims();
    if (!verified || verified.error || !claimsSchema.safeParse(verified.data?.claims).success) {
      throw new CustomerRegistrationError();
    }
    // SQL independently checks the live Auth user, session, email, and account state.
    const response = await supabase.rpc("mmhr_start_customer_workspace", { correlation_id: correlationId });
    if (!response || response.error) throw new CustomerRegistrationError();
    const result = resultSchema.parse(response.data);
    if (result.correlationId !== correlationId) throw new CustomerRegistrationError();
    return result;
  } catch {
    // Provider and uniqueness errors must never reveal account or organization data.
    throw new CustomerRegistrationError();
  }
}
