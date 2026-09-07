# R1 Security Evidence

Updated: 2026-09-03

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
| Organization membership administration | `src/server/commands/security.ts`, `src/server/auth/permissions.integration.test.ts`, membership command tests |
| Portal sharing control | `src/server/commands/security.ts`, `drizzle/0004_r1_security_commands.sql`, portal grant and revoke command tests, portal permission integration checks |
| Security commands, audit, and idempotency | `src/server/auth/security-command-api.integration.test.ts`, `src/server/db/r1-security-command.integration.test.ts` |
| Recovery and MFA reset controls | `src/server/db/r1-recovery-mfa.integration.test.ts`, `src/server/db/r1-recovery-mfa-api.integration.test.ts`, recovery command tests |
| Restricted identity worker | `src/server/db/r1-identity-worker.integration.test.ts`, `scripts/r1-with-local-worker.mjs` |
| Source and import boundaries | `src/server/auth/security-source-contract.test.ts`, `src/server/auth/authorization-boundaries.test.ts` |
| CRM contact, product, and search boundaries | `src/server/commands/crm-database.ts`, `src/server/commands/crm-search-database.ts`, CRM migration and isolation tests |
| CRM export approvals | `src/server/commands/crm-export-database.ts`, `drizzle/0029_r2b_crm_exports.sql`, CRM export migration and isolation tests |
| CRM duplicate review | `src/server/commands/crm-duplicate-database.ts`, `drizzle/0030_r2b_crm_duplicates.sql`, CRM duplicate migration and isolation tests |
| Vendor evidence commands | `src/server/commands/vendor-evidence-database.ts`, `drizzle/0031_r2b_vendor_evidence_commands.sql`, vendor evidence migration and isolation tests |
| Vendor source registry | `src/server/commands/vendor-source.ts`, `drizzle/0082_r2b_vendor_source_registry.sql`, vendor source migration and authenticated isolation tests |
| Vendor acquisition runs | `src/server/commands/vendor-acquisition.ts`, `src/server/vendor/acquisition-contract.ts`, `drizzle/0085_r2b_vendor_acquisition.sql`, acquisition migration and authenticated lifecycle tests |
| Vendor extraction and validation | `src/server/commands/vendor-extraction.ts`, `src/server/vendor/extraction-contract.ts`, `src/server/ai/ai-service.ts`, extraction contract and schema tests |
| Vendor freshness compliance | `src/server/crm/vendor-freshness.ts`, `src/server/crm/vendor-freshness.test.ts` |
| Work-email validation | `src/server/workflows/email-domain-policy.ts`, `src/server/workflows/email-domain-policy.test.ts`, lead-create tests |
| Consent-aware newsletter registration | `src/app/api/newsletter/route.ts`, newsletter contract and service tests |
| Approval-bound marketing content | `src/server/workflows/marketing-content-contract.ts`, marketing content contract tests |
| Gated resource access | `src/server/workflows/gated-resource-contract.ts`, gated resource contract tests, lead-create and consent-aware route tests |
| Evaluation collaboration requests | `src/server/evaluation/collaboration-contract.ts`, collaboration contract tests, workflow communication and follow-up persistence |
| Availability target contract | `src/server/operations/availability-contract.ts`, availability contract tests, `drizzle/0044_r9_evidence_persistence.sql` |
| Performance budget contract | `src/server/operations/performance-contract.ts`, performance contract tests, `drizzle/0044_r9_evidence_persistence.sql` |
| Deletion and retention contract | `src/server/privacy/retention-contract.ts`, `src/server/commands/deletion.ts`, retention contract tests, deletion command migration |
| Recovery evidence contract | `src/server/operations/recovery-readiness.ts`, recovery readiness tests, restore and rollback rehearsal suites |
| Customer portal resource scope | customer route guards, R3/R6 organization-scoped commands, portal permission integration checks |
| Public claim quarantine | `docs/security/r0-public-claim-inventory.md`, marketing content approval contract, Pulse public routes |
| Authorized document search | `src/server/commands/workflow-document-search.ts`, `drizzle/0083_r4_document_search.sql`, document search migration and authenticated isolation tests |
| Evaluation communication routing | `src/server/commands/evaluation-route.ts`, `drizzle/0084_r4_evaluation_routing.sql`, evaluation-routing migration and authenticated isolation tests |
| CRM search, export, duplicate, and renewal controls | `src/server/commands/crm-search-database.ts`, `src/server/commands/crm-export-database.ts`, `src/server/commands/crm-duplicate-database.ts`, audited renewal persistence, and their focused and authenticated isolation suites |
| Deal lifecycle controls | `src/server/commands/deal.ts`, `drizzle/0080_r2b_deal_commands.sql`, and focused and authenticated stage-transition rehearsals |
| CRM relationship controls | `src/server/commands/relationship.ts`, `drizzle/0081_r2b_relationship_commands.sql`, and focused and authenticated relationship rehearsals |
| Vendor fact overrides | `src/server/commands/vendor-fact-override.ts`, `drizzle/0079_r2b_vendor_fact_overrides.sql`, and focused and authenticated source-scope rehearsals |
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
| Scorecard aggregate view | `src/server/commands/scorecard-view.ts`, `drizzle/0045_r3_scorecard_view.sql`, scorecard view migration review and authenticated isolation rehearsal |
| Initial masked evaluation | `src/server/commands/initial-evaluation.ts`, `drizzle/0046_r3_initial_evaluation.sql`, initial evaluation migration review and authenticated isolation rehearsal |
| Scorecard creation | `src/server/commands/scorecard-create.ts`, `drizzle/0047_r3_scorecard_create.sql`, scorecard creation migration review and authenticated isolation rehearsal |
| Requirement metadata updates | `src/server/commands/requirement-update.ts`, `drizzle/0048_r3_requirement_metadata.sql`, requirement metadata migration and authenticated isolation rehearsal |
| Workspace snapshot view | `src/server/commands/workspace-view.ts`, `drizzle/0049_r3_workspace_view.sql`, workspace view migration review and authenticated isolation rehearsal |
| Workspace comments | `src/server/commands/workspace-comment.ts`, `drizzle/0050_r3_workspace_comments.sql`, workspace comment migration and authenticated isolation rehearsal |
| RFP version creation | `src/server/commands/rfp-create.ts`, `drizzle/0051_r4_rfp_create.sql`, RFP create migration and authenticated isolation rehearsal |
| RFP mandatory approval | `src/server/commands/rfp-approval.ts`, `drizzle/0052_r4_rfp_approval.sql`, RFP approval migration and authenticated isolation rehearsal |
| RFP vendor amendments | `src/server/commands/rfp-amendment.ts`, `drizzle/0086_r4_rfp_amendments.sql`, focused command and migration tests, and authenticated additive lifecycle rehearsal |
| RFP distribution records | `src/server/commands/rfp-distribution.ts`, `drizzle/0053_r4_rfp_distribution.sql`, RFP distribution migration and authenticated isolation rehearsal |
| RFP clarification lifecycle | `src/server/commands/rfp-clarification.ts`, `drizzle/0054_r4_rfp_clarifications.sql`, RFP clarification migration and authenticated isolation rehearsal |
| RFP response ingestion | `src/server/commands/rfp-response-ingestion.ts`, `drizzle/0055_r4_response_ingestion.sql`, response ingestion migration and authenticated isolation rehearsal |
| RFP response normalization | `src/server/commands/rfp-response-normalization.ts`, `drizzle/0056_r4_response_normalization.sql`, focused command and migration tests, and authenticated normalization isolation rehearsal |
| RFP response review | `src/server/commands/rfp-response-review.ts`, `drizzle/0057_r4_response_review.sql`, focused command and migration tests, and authenticated review isolation rehearsal |
| RFP response clarification | `src/server/commands/rfp-response-clarification.ts`, `drizzle/0058_r4_response_clarifications.sql`, focused command and migration tests, and authenticated response-clarification isolation rehearsal |
| RFP response failures | `src/server/commands/rfp-response-failure.ts`, `drizzle/0059_r4_response_failures.sql`, focused command and migration tests, and authenticated failure isolation rehearsal |
| Workflow communications | `src/server/commands/workflow-communication.ts`, `drizzle/0060_r4_communication_commands.sql`, focused command and migration tests, and authenticated communication isolation rehearsal |
| Workflow document controls | `src/server/commands/workflow-document.ts`, `drizzle/0061_r4_document_controls.sql`, focused command and migration tests, and authenticated document isolation rehearsal |
| Workflow job controls | `src/server/commands/workflow-job.ts`, `drizzle/0062_r4_job_controls.sql`, focused command and migration tests, and authenticated job isolation rehearsal |
| R6 workflow contracts | `src/server/workflows/demo-contract.ts`, `src/server/workflows/proposal-contract.ts`, `src/server/workflows/contract-handoff.ts`, and their unit suites; persistence commands remain open |
| R7 finance controls | `src/server/finance/commission-contract.ts`, audited commission/invoice/payment/dispute/adjustment/handoff/reconciliation commands, focused suites, and authenticated local rehearsals; target portal and production evidence remain open |
| R8 onboarding and work controls | `src/server/workflows/onboarding-contract.ts`, audited onboarding, work-item, renewal, project-plan, and follow-up schedule persistence, `src/server/operations/work-queue.ts`, and `src/server/operations/project-plan-contract.ts`; target-environment evidence remains open |

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

The latest complete unit suite passed 271 files and 2,739 tests. The complete
integration suite passed all 82 files and 678 tests against the local MMHR
Supabase stack.

The current local migration ledger contains 93 migrations through
`drizzle/0092_r1_invitation_read.sql`. Focused checks pass.
`drizzle/0082_r2b_vendor_source_registry.sql` adds source ownership, capture method, cadence, licensing, review requirements, and audited retirement. Focused and authenticated checks pass.
`drizzle/0083_r4_document_search.sql` adds approved extracted content and organization-scoped search over approved metadata and content. Focused and authenticated checks pass.
`drizzle/0084_r4_evaluation_routing.sql` adds MMHR-first evaluation routes and permits direct communication only after an audited won-deal finalization. Focused and authenticated checks pass; communication integration remains open.

`drizzle/0085_r2b_vendor_acquisition.sql` adds provider-neutral manual and automated acquisition runs with active-source checks, optimistic revisions, bounded artifacts, replay receipts, and audited lifecycle transitions. Focused, type, lint, build, and authenticated checks pass; provider adapters and target-environment evidence remain open.

The vendor extraction boundary now uses the server-only AI service with a versioned structured vendor schema. Low-confidence claims and high-impact changes remain review-required, and untrusted content is passed through the existing prompt-injection denial. Focused and type checks pass; durable AI extraction records and target-provider evaluation remain open.

The vendor freshness assessment calculates the published-record rate inside each configured freshness window and applies the 95 percent PRD threshold. Focused checks pass; scheduled production measurement remains open.

The stable identity request-scope correction is applied and locally verified by
14 unit tests and the authenticated RLS rehearsal. The guarded recovery API
rehearsal now passes both original-AAL1 and original-AAL2 cases with exact
scratch cleanup. The Docker guard flushes long-lived wait-response headers so
the Supabase CLI can start the watched helper container. The focused guard
suite passes 11 tests, including the delayed-body regression case.

R1 delegation, organization-member administration, and portal grant or revoke commands now have local command and permission evidence. Target-environment portal journeys and release evidence remain open.

Public registration now has a fixed personal-domain deny list with a bounded reviewed exception. The newsletter route uses the consent-aware internal service; approved-page and target-environment evidence remain open.

Marketing content publication now has a strict approval-bound contract, and evaluation collaboration requests cover secure messages, meeting coordination, review requests, bounded participants, and assigned ownership. Durable workflow wiring and target-environment journeys remain open.

Availability, performance, deletion, and recovery contracts enforce their local targets and evidence shape. Production observations, measured percentiles, approved deletion completion, and quarterly restore records remain open.

Customer route guards and organization-scoped R3/R6 commands provide partial portal isolation evidence. Public claims remain inventoried and approval-bound, but approved claim records and complete customer-resource journey evidence remain open.

Gated resource access now requires a normalized identity, recorded consent, and an active routed lead. Full resource inventory and target-environment journey evidence remain open.

The CRM vendor record surface now has local persistence evidence across vendor profiles, products, contacts, relationships, source registry, facts, evidence, overrides, deals, commissions, payments, and reconciliation packages. Response history, performance measures, target-environment behavior, and release evidence remain open.

Vendor facts and overrides now retain organization scope, source linkage, capture or approval time, freshness or expiry, and audit receipts. Customer-visible route verification and target-environment traceability evidence remain open.

`drizzle/0063_r6_demo_round_commands.sql` adds deal-scoped demo lifecycle transitions, optimistic revisions, replay, and bounded feedback. Focused checks and authenticated rehearsal pass.
`drizzle/0064_r6_proposal_commands.sql` adds immutable proposal versions and approved-only comparisons. Focused checks and authenticated rehearsal pass.
The authenticated R6 demo and proposal rehearsals pass lifecycle, replay, approval, comparison, and feedback checks. Participant, scheduling-provider, and full customer-resource isolation evidence remain open.
`drizzle/0065_r6_contract_handoff_commands.sql` adds deal-scoped handoff selection, transition guards, revision checks, and immutable history. Focused checks and authenticated rehearsal pass.
The authenticated R6 contract-handoff rehearsal passes selection, immutable history, optimistic revisions, and signed terminal outcome checks. Full participant, portal, and production evidence remain open.
`drizzle/0066_r7_commission_commands.sql` adds effective-dated commission structures and idempotent signed-contract events. Authenticated rehearsal passes effective-date scope, calculation integrity, and idempotent event replay checks.
The authenticated R7 commission rehearsal passes effective-date scope, calculation integrity, and idempotent event replay checks. Payments, invoices, disputes, reconciliation, and vendor portal denial remain open.
The authenticated R7 payment rehearsal passes bounded payment recording, balance closure, and replay. Invoices, disputes, reconciliation, vendor portal denial, and production evidence remain open.
`drizzle/0068_r7_invoice_commands.sql` adds invoice draft, issue, and void controls. Authenticated rehearsal passes draft creation and issue-date controls.
`drizzle/0069_r7_dispute_commands.sql` adds audited dispute open, resolve, and reject controls. Authenticated rehearsal passes scoped open, resolve, and replay checks.
`drizzle/0070_r7_adjustment_handoff_commands.sql` adds compensating adjustment and approved finance-handoff controls. Authenticated rehearsal passes adjustment, replay, closed-event handoff, and replay checks.
`drizzle/0071_r7_reconciliation_reports.sql` adds immutable source-event reconciliation reports with invoice, payment, period, and dispute checks. Authenticated rehearsal passes report recording and replay.
`drizzle/0072_r8_onboarding_commands.sql` adds deal-scoped onboarding creation, lifecycle transitions, failure retention, and approval-bound reactivation. Authenticated rehearsal passes create, replay, transition, failure, and reactivation checks.
`drizzle/0073_r8_work_item_commands.sql` adds audited role-scoped work-item creation, optimistic status updates, escalation guards, and replay. Authenticated rehearsal passes create, replay, and completion checks.
`drizzle/0074_r8_renewal_commands.sql` adds audited renewal creation, source and follow-on deal scope, forward-only transitions, approval-bound terminal outcomes, and replay. Authenticated rehearsal passes create, replay, and review checks.
`drizzle/0075_r8_project_plan_commands.sql` adds audited template creation and approval, deal-scoped plan generation, revision checks, and replay. Authenticated rehearsal passes template, approval, generation, and replay checks.
`drizzle/0076_r8_administration_configuration.sql` adds deny-first versioned configuration storage, approval and retirement controls, self-approval denial, and replay. Authenticated rehearsal passes create, approval, retirement, and replay checks.
`drizzle/0077_r8_approval_queue.sql` adds deny-first approval requests, organization scope, optimistic transitions, requester self-review denial, and replay. Authenticated rehearsal passes create, replay, and denial checks.
`drizzle/0078_r8_follow_up_schedules.sql` adds organization-scoped vendor, customer, product, and risk check-in schedules with bounded cadence, approval, pause, retirement, and replay controls. Authenticated rehearsal passes create, replay, approval, pause, and retirement checks.
`drizzle/0079_r2b_vendor_fact_overrides.sql` adds source-linked, expiring vendor-fact overrides with audit, permission, scope, replay, and raw-access controls. Authenticated rehearsal passes record, replay, and out-of-scope denial checks.
`drizzle/0080_r2b_deal_commands.sql` adds organization-scoped deal creation, vendor-link checks, optimistic stage transitions, immutable stage history, and replay. Authenticated rehearsal passes create, replay, transition, and stale-transition denial checks.
`drizzle/0081_r2b_relationship_commands.sql` adds organization-scoped relationship creation and updates with endpoint validation, influence, preference, ownership, replay, and stale-revision checks. Authenticated rehearsal passes create, replay, update, and stale-transition denial checks.
The authenticated R7 invoice, dispute, adjustment, handoff, and reconciliation rehearsals pass their local scope and lifecycle checks. Vendor portal denial and production evidence remain open.
The authenticated R7 commission rehearsal passes structure creation, vendor/deal scope, and idempotent event replay checks. Eligibility enforcement, payments, invoices, disputes, reconciliation, and vendor portal denial remain open.
authenticated response, communication, and document rehearsals pass their
local isolation checks. This remains local evidence only.

Provider scanning and signed-URL delivery remain target-environment work.

The authenticated job rehearsal passes enqueue, claim, terminal failure,
manual rerun, and attempt-history checks. Durable worker deployment remains
target-environment work.

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

The focused R5 AI run-record migration review suite passed 10 tests. It checks
provider-neutral identifiers and hashes, raw-payload exclusion, bounded
capabilities and review states, usage and timestamp constraints, organization
scope, immutable approval history, deny policies, and raw table revocation.
The authenticated local rehearsal passed one test for create, approval, replay,
and distinct-reviewer enforcement.
The provider-evaluation command and migration review passed 14 focused tests,
and its authenticated platform rehearsal passed one test for record, replay,
approval, and self-review denial.

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

The R9 operational-evidence command review passed 3 unit and migration tests.
It adds an audited, replay-safe command for organization-scoped availability
and performance records. The authenticated local rehearsal passed 1 test for
recording, replaying, and cross-organization denial.

The deletion execution boundary now requires an approved, eligible request,
rejects legal holds and retention windows, and preserves uncertain provider
results without automatic retries. Its focused retention and execution tests
pass 18 tests. The durable deletion command now records requests and separate
reviewer decisions with exact-request replay and organization-scoped audit
receipts; its migration review passed 3 tests and its authenticated rehearsal
passed 1 test. These controls do not replace the required target deletion drill.

The full dependency audit reports 86 findings: 59 high, 25 moderate, 1 low,
and 1 critical. The production-scope audit reports 54 findings: 35 high, 18
moderate, and 1 low. A remediation dry-run could not fetch registry metadata
because npm cache writes are denied in this environment.

The latest production-scope audit on 2026-09-03 reports 70 vulnerabilities:
47 high, 22 moderate, and 1 low. The listed advisories report no available fix;
the dependency gate remains advisory until remediation is complete.

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

Current branch verification: the latest complete unit suite passed 271 files
and 2,739 tests. The complete integration suite passed 82 files and 678 tests.
The empty-database, restore, rollback, and guarded recovery rehearsals passed.

The release manifest remains fail-closed. Target-environment, authenticated
browser, accessibility, performance, availability, deletion, restore,
deployment, rollback, security-review, and public-approval evidence remains
required before production release.

The manual `.github/workflows/production-release-gate.yml` workflow now runs
the integration-matrix check, secret scan, type check, lint, unit tests, and
production build. Its integration job starts a disposable Supabase stack,
loads the local anonymous key, applies Drizzle migrations, and runs
`npm run test:integration` before `npm run check:r9-evidence:release`. It stops
unless all CI gates and every R9 record pass.

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
