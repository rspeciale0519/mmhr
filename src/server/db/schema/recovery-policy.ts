import { sql } from "drizzle-orm";
import { check, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { identities } from "./identity";

const privateSchema = pgSchema("mmhr_private");

// Owner preparation records reviewed operational references, never a phone number or call content.
export const recoveryPolicyState = privateSchema.table(
  "recovery_policy_state",
  {
    singletonKey: integer("singleton_key").primaryKey().default(1),
    firstIdentityId: uuid("first_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    secondIdentityId: uuid("second_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    procedureVersion: text("procedure_version").notNull(),
    productApprovalId: uuid("product_approval_id").notNull(),
    securityApprovalId: uuid("security_approval_id").notNull(),
    operationsEvidenceId: uuid("operations_evidence_id").notNull(),
    rehearsalEvidenceId: uuid("rehearsal_evidence_id").notNull(),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("recovery_policy_state_singleton_ck", sql`${t.singletonKey} = 1`),
    check("recovery_policy_state_pair_ck", sql`${t.firstIdentityId} <> ${t.secondIdentityId}`),
    check("recovery_policy_state_procedure_ck", sql`${t.procedureVersion} = 'outbound_preexisting_contact_v1'`),
    check("recovery_policy_state_approvals_ck", sql`${t.productApprovalId} <> ${t.securityApprovalId}`),
  ],
);
