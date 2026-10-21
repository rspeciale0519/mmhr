import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";

export const crmDuplicateCandidates = pgTable(
  "crm_duplicate_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    candidateKey: text("candidate_key").notNull(),
    resource: text("resource").notNull(),
    leftRecordId: uuid("left_record_id").notNull(),
    rightRecordId: uuid("right_record_id").notNull(),
    signal: text("signal").notNull(),
    state: text("state").notNull().default("open"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    detectedByIdentityId: uuid("detected_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    correlationId: uuid("correlation_id").notNull(),
  },
  (t) => [
    uniqueIndex("crm_duplicate_candidates_scope_uq").on(t.organizationId, t.candidateKey),
    index("crm_duplicate_candidates_review_idx").on(t.organizationId, t.resource, t.state, t.detectedAt),
    check("crm_duplicate_candidates_candidate_key_ck", sql`${t.candidateKey} ~ '^[a-z][a-z0-9_.:-]{1,255}$'`),
    check("crm_duplicate_candidates_resource_ck", sql`${t.resource} in ('customer','vendor','product','contact','deal')`),
    check("crm_duplicate_candidates_distinct_ck", sql`${t.leftRecordId} <> ${t.rightRecordId}`),
    check("crm_duplicate_candidates_signal_ck", sql`${t.signal} = 'normalized_key'`),
    check("crm_duplicate_candidates_state_ck", sql`${t.state} = 'open'`),
  ],
);

export type CrmDuplicateCandidateTable = typeof crmDuplicateCandidates;
