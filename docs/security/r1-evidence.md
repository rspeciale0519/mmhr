# R1 Security Evidence

Updated: 2026-09-01

This record summarizes local R1 evidence. It does not prove cloud, staging, or
production activation. It does not record real administrator credentials,
phone evidence, or recovery approvals.

## Evidence map

| Control | Local evidence |
|---|---|
| Verified identity and assurance | `src/server/auth/verified-identity.ts`, `src/server/auth/authorization.test.ts`, `src/server/auth/auth.integration.test.ts` |
| Protected entry points | `src/server/auth/entry-point-inventory.ts`, `src/server/auth/entry-point-inventory.test.ts`, `docs/security/r1-authorization-matrix.md` |
| Fail-closed permission decisions | `src/server/auth/authorization.ts`, `src/server/auth/authorization.test.ts`, `src/server/auth/r1-security.test.ts` |
| Route and portal guards | `src/server/auth/page-guards.ts`, `src/server/auth/page-guards.test.ts`, customer and vendor layouts, `src/server/auth/r1-security.test.ts` |
| RLS and raw table denial | `src/server/auth/rls.integration.test.ts`, `src/server/auth/r1-security.integration.test.ts` |
| Permission, role, override, and delegation rules | `src/server/auth/permissions.integration.test.ts`, `src/server/auth/permission-registry.test.ts` |
| Security commands, audit, and idempotency | `src/server/auth/security-command-api.integration.test.ts`, `src/server/db/r1-security-command.integration.test.ts` |
| Recovery and MFA reset controls | `src/server/db/r1-recovery-mfa.integration.test.ts`, `src/server/db/r1-recovery-mfa-api.integration.test.ts`, recovery command tests |
| Restricted identity worker | `src/server/db/r1-identity-worker.integration.test.ts`, `scripts/r1-with-local-worker.mjs` |
| Source and import boundaries | `src/server/auth/security-source-contract.test.ts`, `src/server/auth/authorization-boundaries.test.ts` |
| CRM contact, product, and search boundaries | `src/server/commands/crm-database.ts`, `src/server/commands/crm-search-database.ts`, CRM migration and isolation tests |
| CRM export approvals | `src/server/commands/crm-export-database.ts`, `drizzle/0029_r2b_crm_exports.sql`, CRM export migration and isolation tests |
| CRM duplicate review | `src/server/commands/crm-duplicate-database.ts`, `drizzle/0030_r2b_crm_duplicates.sql`, CRM duplicate migration and isolation tests |
| Vendor evidence commands | `src/server/commands/vendor-evidence-database.ts`, `drizzle/0031_r2b_vendor_evidence_commands.sql`, vendor evidence migration and isolation tests |
| Lead routing and capture | `src/server/commands/lead-routing.ts`, `drizzle/0032_r2a_lead_routing.sql`, `drizzle/0033_r2a_lead_create_ambiguity_fix.sql`, lead routing migration and isolation tests |
| Scorecard entry persistence | `src/server/commands/scorecard-database.ts`, `drizzle/0034_r3_scorecard_entry_commands.sql`, scorecard entry migration and isolation tests |
| Candidate lifecycle transitions | `src/server/commands/candidate-transition.ts`, `drizzle/0035_r3_candidate_transition_commands.sql`, candidate transition migration and isolation tests |
| Candidate intake additions | `src/server/commands/candidate-add.ts`, `drizzle/0036_r3_candidate_add_commands.sql`, candidate add migration and isolation tests |
| Candidate identity masking | `src/server/commands/candidate-masking.ts`, `drizzle/0037_r3_candidate_masking_commands.sql`, candidate masking migration and isolation tests |
| Redacted evaluation comparison | `src/server/commands/comparison.ts`, `drizzle/0038_r3_comparison_read.sql`, comparison migration and isolation tests |
| Saved intake persistence | `src/server/commands/intake-save.ts`, `drizzle/0039_r3_intake_save_commands.sql`, intake save migration and isolation tests |
| Deterministic matching | `src/server/commands/matching.ts`, `drizzle/0040_r3_deterministic_matching.sql`, matching migration and isolation tests |
| Matching rule approval | `src/server/commands/matching-rule-approval.ts`, `drizzle/0041_r3_matching_rule_approval.sql`, rule approval migration review |
| Comparison export controls | `src/server/commands/comparison-export.ts`, `drizzle/0042_r3_comparison_export_commands.sql`, comparison export migration and isolation tests |
| Duplicate product review | `src/server/commands/duplicate-product-review.ts`, `drizzle/0043_r3_duplicate_product_review.sql`, duplicate product migration and isolation tests |
| Matching rule preview | `src/server/commands/matching-rule-preview.ts`, `drizzle/0044_r3_matching_rule_preview.sql`, matching rule preview migration review |
| Scorecard aggregate view | `src/server/commands/scorecard-view.ts`, `drizzle/0045_r3_scorecard_view.sql`, scorecard view migration review |

## Local check record

The verified local R1.4 package recorded these checks before later R1.5 bootstrap test edits:

- `npm test`: 1,762 tests passed in 48 files.
- `npm run type-check`: passed for the current worktree. An earlier package checkpoint reported two undefined-value errors in `src/server/auth/r1-bootstrap-super-admin.test.ts`; later edits corrected them.
- `npm run lint`: passed.
- `npm run build`: passed with framework deprecation warnings only.
- `npm run check:integration-matrix`: passed after the wrapper and source inventory matched.
- Recovery and migration rehearsal: 100 cases passed.
- Restricted worker rehearsal: 64 cases passed.
- Boundary scan: 47 cases passed.
- Two real local Auth recovery flows passed.

Run the integration evidence with `npm run test:integration` after starting the
local Supabase stack. The wrapper uses the restricted local worker path and
keeps credentials out of logs and retained artifacts.

The 2026-09-01 full integration run used the validated local environment
binding and passed 21 files and 592 tests. The local stack uses ports 57021
through 57029. This evidence remains local and does not prove target or
production readiness.

The latest complete unit suite passed 132 files and 2,351 tests after the
Next.js 16.3.4 upgrade and the R8 renewal, onboarding, project-plan, analytics,
approval-queue, outcome, customer-journey, vendor-performance, operations report,
audit-viewer, R9 deployment-smoke, R5 AI routing and fixture-evaluation, R3
intake, R2B deal-lifecycle, R2A lead-command, R2B deal and vendor-evidence,
R3 scorecard and workspace, R5 AI run-record, R6 demo, proposal, and
contract-handoff, R7 finance, R8 customer-success and operations, and R9
evidence persistence changes.

The current local migration ledger applies 46 checked-in migrations through
`drizzle/0045_r3_scorecard_view.sql`. This remains local evidence only.

The CRM command package passed fixed-RPC and authenticated isolation rehearsals.
The CRM search package passed redaction, scope, paging, and malformed-input
tests. The local ledger now applies 30 checked-in migrations through
`drizzle/0029_r2b_crm_exports.sql`.

The focused R3 intake migration review suite passed 7 tests. It checks the
required tables, RLS, deny policies, organization-scoped requirement and
candidate keys, and deterministic candidate-state constraints.

The focused R2B CRM foundation migration review suite passed 7 tests. It
checks the required tables, RLS, deny policies, organization-scoped foreign
keys, approval and endpoint constraints, and scoped uniqueness indexes.

The focused R2A lead-command migration review suite passed 8 tests. It checks
organization and identity references, replay and request-digest boundaries,
consent validation, fixed-search-path command security, audit events, and raw
table revocation for all runtime roles.

The focused R2B deal and vendor-evidence migration review suite passed 8 tests.
It checks deal and renewal state boundaries, organization-scoped history and
product links, vendor source and fact scope, immutable evidence versions,
approval and freshness constraints, deny policies, and raw table revocation.

The focused R3 scorecard migration review suite passed 8 tests. It checks
organization-scoped intake and candidate links, weighted criteria, unique
scorer entries, immutable replacement history, bounded scores, deny policies,
and raw table revocation.

The focused R3 workspace migration review suite passed 8 tests. It checks
organization-scoped intake and workspace links, bounded snapshots, revision
uniqueness, participant state timestamps, customer or internal visibility,
deny policies, and raw table revocation.

The focused R5 AI run-record migration review suite passed 8 tests. It checks
provider-neutral identifiers and hashes, raw-payload exclusion, bounded
capabilities and review states, usage and timestamp constraints, organization
scope, immutable approval history, deny policies, and raw table revocation.

The focused R6 demo, proposal, and contract-handoff migration review suite
passed 8 tests. It checks organization-scoped deal links, demo scheduling and
feedback bounds, source-backed proposal versions, approved comparison scope,
handoff status boundaries, immutable history, deny policies, and raw table
revocation.

The focused R7 finance migration review suite passed 8 tests. It checks
effective-dated commission structures, idempotent commission events, payment
and invoice bounds, dispute and adjustment evidence, finance handoff scope,
immutable event history, deny policies, and raw table revocation.

The focused R8 customer-success and operations migration review suite passed 8
tests. It checks onboarding snapshots and history, approved project-plan
templates, revisioned plans, role-scoped queue work, retained failure states,
organization isolation, deny policies, and raw table revocation.

The focused R9 evidence persistence migration review suite passed 8 tests. It
checks deletion deadlines and retention, legal-hold decisions, bounded
availability observations, route performance budgets, duplicate prevention,
organization isolation, deny policies, and raw table revocation.

The full dependency audit reports 86 findings: 59 high, 25 moderate, 1 low,
and 1 critical. The production-scope audit reports 54 findings: 35 high, 18
moderate, and 1 low. A remediation dry-run could not fetch registry metadata
because npm cache writes are denied in this environment.

The focused administration-configuration suite passed 8 tests. Type checking,
lint, and the production build passed after that change.

The focused analytics-report suite passed 7 tests. Type checking, lint, and
the production build passed after that change.

The focused revenue-report suite passed 6 tests. Type checking, lint, and the
production build passed after that change.

The focused performance-evidence suite passed 7 tests. Type checking, lint,
and the production build passed after that change.

The focused security-review suite passed 9 tests. Type checking, lint, and
the production build passed after that change.

The focused deployment-smoke suite passed 9 tests. Type checking, lint, and
the production build passed after that change. The contract validates a
canonical HTTPS origin, deployment identity, health, protected-route closure,
and migration rollback compatibility. It does not prove a real deployment.

The focused AI-routing suite passed 8 tests. It validates capability and
data-class routing, deterministic adapter selection, bounded retries, timeout
handling, schema failures, and explicitly approved fallback records.

The focused AI-evaluation suite passed 10 tests. It validates complete fixture
coverage, input and output hashes, schema and provider failures, and redacted
evaluation results without retaining raw provider output.

## 2026-09-01 local completion record

The local Supabase stack applied all 30 checked-in migrations through
`drizzle/0029_r2b_crm_exports.sql`.

The complete integration suite passed 21 files and 592 tests.

The expanded unit run exercised 134 files and 2,359 tests. Two stale matrix
assertions were corrected, and the affected tests passed in focused reruns.

Type checking, lint, the production build, integration-matrix check, secret
scan, Drizzle schema check, and diff check passed.

The ACL repair revokes inherited PUBLIC execution on all public functions and
grants `mmhr_*` execution only to `authenticated`.

The release manifest remains fail-closed. Target-environment, authenticated
browser, accessibility, performance, availability, deletion, restore,
deployment, rollback, security-review, and public-approval evidence remains
required before production release.

The focused R3 intake suite passed 9 tests. It validates immutable intake
snapshots, strict requirements, organization scope, submission prerequisites,
and revision-checked state transitions.

The focused R2B deal-lifecycle suite passed 8 tests. It validates organization
scope, stage and status alignment, forward-only transitions, terminal outcomes,
optimistic revisions, and immutable history.

The focused R2B CRM entity suite passed 7 tests. It validates strict customer,
vendor, product, contact, and relationship records with organization scope,
approval evidence, date windows, normalized contact email, and immutable parsing.

The focused R2B activity-task suite passed 6 tests. It validates immutable
activity history, organization scope, open task creation, terminal states,
optimistic revisions, and forward-only task transitions.

The focused R3 scorecard suite passed 6 tests. It validates weighted criteria,
multiple scorers, immutable entry history, optimistic conflict handling,
replacement without destructive edits, and deterministic aggregation.

The focused R3 workspace suite passed 6 tests. It validates scoped snapshots,
participant status timestamps, immutable comments, duplicate and scope checks,
and customer filtering of internal comments.

The additive R2B activity-task persistence migration passed migration-order
checks. It adds deny-first activity, task, and append-only task-history tables;
local application remains unavailable until Supabase and Docker access returns.

The focused R2B activity-task migration review suite passed 7 tests. It checks
the required tables, RLS, deny policies, organization-scoped task history,
addressable indexes, and immutable or append-only recovery posture. The
complete suite passed 118 files and 2,246 tests after this review.

The additive R4 workflow migration passed the full local build and suite
checks. It adds deny-first RFP, recipient, inbound-email, document-version,
communication, job, and job-attempt tables; database application remains open.

The focused R4 workflow migration review suite passed 8 tests. It checks the
required tables, row-level security, deny policies, organization-scoped
composite keys, provider replay and job idempotency constraints, and recovery
comments. The complete suite passed 117 files and 2,239 tests after the job
scope correction.

The local browser smoke record is in `docs/security/r9-browser-evidence.md`.
It covers public routes and protected-route redirects only. It does not prove
authenticated journeys, accessibility conformance, performance percentiles,
staging, or production behavior.

## CI and release state

CI now checks the integration matrix inventory before the standard gates. CI
does not yet start Supabase or run the full integration matrix because the
approved pinned Supabase setup action is not available.

R1 is not closed by this record. Browser journeys, approved CI Supabase setup,
target-environment identity evidence, and later domain coverage remain open.
Cloud migration, production worker activation, bootstrap, and deployment did
not occur.

## Recovery path

If a required security check fails, keep the affected route or worker disabled,
preserve the evidence, and use `docs/security/r1-emergency-containment.md`.
Apply a reviewed forward fix and rerun the relevant local matrix before any
target-environment action.
