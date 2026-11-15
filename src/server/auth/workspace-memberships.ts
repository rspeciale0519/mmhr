import { z } from "zod";

/** Rows from the fixed `mmhr_get_my_memberships` RPC, which applies access and field rules in SQL. */
export const membershipRowsSchema = z.array(z.strictObject({
  organization_id: z.uuid(),
  organization_name: z.string().trim().min(1).max(200).nullable(),
  organization_type: z.enum(["internal", "customer", "vendor"]),
  organization_status: z.literal("active"),
  role_key: z.enum(["organization_admin", "contributor", "viewer"]).nullable(),
})).refine((rows) => new Set(rows.map((row) => row.organization_id)).size === rows.length);

export type MembershipRows = z.output<typeof membershipRowsSchema>;
