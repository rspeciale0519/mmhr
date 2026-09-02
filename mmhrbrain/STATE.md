# mmhr brain — STATE
Updated: 2026-09-01

## Current focus
The canonical product baseline is in docs/README.md, docs/PRD.md, and
docs/TECH_STACK.md. The approved roadmap is in
.codex/plans/roadmap-v2-implementation.md. R1 implementation decisions are in
.codex/plans/module-r1-secure-platform-base.md, version 0.12.

The active full-delivery goal authorizes normal project implementation,
dependencies, Git, cloud configuration, migrations, bootstrap, releases, and
deployment. Required checks and real identity evidence still apply.
Purchases and new paid commitments remain prohibited.

The sandbox reviewer rejected an earlier exact remote push for
bugfix/r1-stable-identity-context. Do not bypass that rejection.
Independent local work continues on the active feature branch.

R1.0 through R1.3 are merged into develop at b1ffbe1. Two late review
findings remain open. The local correction dbac05f fixes the stable-ID
comparison and restores the earlier journal text. It passed all local
checks but is not pushed or merged.

Current branch: feature/r1-permission-evaluation, based on b1ffbe1.
R1.4 through R1.8 foundations are implemented and verified locally, including
invitation lifecycle contracts. R2A through R9 now have bounded contracts,
schemas, or safety helpers with focused tests. Database delivery, target
environment evidence, and production release work remain open.

## Latest synopsis
The current package adds 30 typed permissions, 60 explicit role defaults,
caller-bound database evaluation, field filtering, permission-aware tRPC
builders, audited commands, recovery, identity adapters, restricted worker
delivery, guarded portal routes, and an identity-only MFA flow.

Migration 0003 preserves approved version-one role history and activates
version-two defaults. It is applied only to the validated local MMHR stack.
No cloud or production migration occurred.

Type checking, lint, 2345 unit tests, recovery and migration cases, worker
cases, boundary cases, local Auth recovery flows, and the production build
passed. The local Supabase stack now runs on ports 57021-57029. Database,
Auth, security-boundary, permission, and RLS integration checks pass in focused
runs. The complete integration suite now passes 21 files and 592 tests.

The local migration ledger now applies 46 migrations through
`drizzle/0045_r3_scorecard_view.sql`. Public `mmhr_*` functions
now revoke inherited PUBLIC access and grant execution only to `authenticated`.
The empty-database and rollback rehearsals match the current R0-R9 inventory.

The focused R4 workflow migration review passed 8 tests, including required
tables, RLS, deny policies, organization-scoped composite keys, replay and
idempotency constraints, and recovery comments.

The focused R2B activity-task migration review passed 7 tests, including
required tables, RLS, deny policies, organization-scoped history, indexes, and
append-only posture. The focused R3 intake migration review also passed 7 tests,
and the focused R2B CRM foundation migration review passed 7 tests. The
complete unit suite previously passed 142 files and 2,386 tests. The latest full
run was interrupted after two minutes without progress; focused tests and all
static gates pass for the current lead-create correction.

The focused R2A lead-command migration review passed 8 tests, including raw
table revocation for all runtime roles, consent and idempotency checks, fixed
search-path command security, and audit recording. Its reviewed migration is
applied in the local rehearsal database.

The focused R2B deal and vendor-evidence migration review passed 8 tests,
including scoped deal history, renewal windows, vendor-source and fact links,
immutable evidence versions, approval and freshness rules, and deny-first raw
access. Its reviewed migration is applied in the local rehearsal database.

The focused R3 scorecard migration review passed 8 tests, including
organization-scoped intake and candidate links, weighted criteria, unique
scorer entries, immutable replacement history, bounded scores, and deny-first
raw access. The migration is applied in the local rehearsal database.

The focused R3 candidate-transition migration review passed 3 tests. The
elevated local rehearsal passed 2 tests for lifecycle transitions, replay,
optimistic revisions, approval-bound reactivation, and cross-organization
denial. The migration is applied in the local rehearsal database.

The focused R3 candidate-add migration review passed 3 tests. The elevated
local rehearsal passed 2 tests for replay, the initial five-candidate cap,
review-only additions, and cross-organization denial. The migration is applied
in the local rehearsal database.

The focused R3 candidate-masking migration review passed 3 tests. The elevated
local rehearsal passed 2 tests for masked labels, replay, approval-bound
unmasking, immutable disclosure state, and cross-organization denial. The
migration is applied in the local rehearsal database.

The focused R3 comparison migration review passed 2 tests. The elevated local
rehearsal passed 2 tests for organization-scoped masked candidate reads,
approved-scorecard filtering, hidden vendor fields, and cross-organization
denial. The migration is applied in the local rehearsal database.

The local migration ledger now applies 51 migrations through
`drizzle/0050_r3_workspace_comments.sql`.

The focused R3 requirement-metadata migration review passed 2 tests. The
elevated local rehearsal passed 2 tests for structured and custom metadata,
bounded evidence references and vendor links, optimistic revisions, replay,
audit recording, and cross-organization denial. The migration is applied in
the local rehearsal database.

The focused R3 workspace-view migration review passed 2 tests. The elevated
local rehearsal passed 2 tests for latest-snapshot selection, organization
scope, stage, candidates, tasks, approvals, events, recent activity, and audit
recording. The migration is applied in the local rehearsal database.

The focused R3 workspace-comment migration review passed 2 tests. The
elevated local rehearsal passed 2 tests for bounded customer comments,
idempotent replay, audit recording, and cross-organization denial. The
migration is applied in the local rehearsal database.

The focused R3 workspace migration review passed 8 tests, including
organization-scoped intake and workspace links, bounded snapshots, revision
uniqueness, participant state timestamps, visibility labels, and deny-first
raw access. The migration remains unapplied until local Supabase and Docker
access returns.

The focused R5 AI run-record migration review passed 8 tests, including
provider-neutral identifiers and hashes, raw-payload exclusion, bounded
capabilities and review states, usage and timestamp constraints, organization
scope, immutable approval history, and deny-first raw access. The migration
remains unapplied until local Supabase and Docker access returns.

The focused R6 demo, proposal, and contract-handoff migration review passed 8
tests, including organization-scoped deal links, demo scheduling and feedback
bounds, source-backed proposal versions, approved comparison scope, handoff
status boundaries, immutable history, and deny-first raw access. The migration
remains unapplied until local Supabase and Docker access returns.

The focused R7 finance migration review passed 8 tests, including effective-
dated commission structures, idempotent commission events, payment and invoice
bounds, dispute and adjustment evidence, finance handoff scope, immutable event
history, and deny-first raw access. The migration remains unapplied until local
Supabase and Docker access returns.

The focused R8 customer-success and operations migration review passed 8 tests,
including onboarding snapshots and history, approved project-plan templates,
revisioned plans, role-scoped queue work, retained failure states, organization
isolation, and deny-first raw access. The migration remains unapplied until
local Supabase and Docker access returns.

The focused R9 evidence persistence migration review passed 8 tests, including
deletion deadlines and retention, legal-hold decisions, bounded availability
observations, route performance budgets, duplicate prevention, organization
isolation, and deny-first raw access. The migration remains unapplied until
local Supabase and Docker access returns.

R9 now has a checked-in evidence manifest and CI validation command. A
server-only recovery evidence contract validates restore drills and rollback
rehearsals, including RPO, RTO, approval, freshness, and duplicate checks. The
release mode remains fail-closed until each real gate has an evidence record.
CI also runs a high-confidence repository secret scan. Dependency auditing is
visible but remains advisory until the current findings receive remediation.
The latest full audit reports 86 vulnerabilities: 59 high, 25 moderate, 1 low,
and 1 critical. The production-scope audit reports 54: 35 high, 18 moderate,
and 1 low, after the Next.js 16.3.4 upgrade. Remaining advisories include
transitive packages with no available fix. A remediation dry-run could not
fetch registry metadata because npm cache writes are denied here.

See docs/security/r1-permission-evaluation.md, docs/security/r1-evidence.md, and
[[journal/2026-09-01]].
The existing request-scoped helper still needs dbac05f before integration.
Permission-protected home, admin, customer, and vendor route foundations are active in code. R1.8 local evidence records and matrix checks are present. Runtime recovery and production worker scheduling remain disabled.

## Open threads
- Submit dbac05f after exact remote-write approval. Close the late PR 8 and PR 9 findings after remote validation.
- Integrate the local evaluation foundation only after its stable-ID prerequisite and remote checks pass.
- R1.6 invitation database commands now call reviewed token-free SQL functions with permission checks, receipts, and audit records; target-environment wiring and evidence remain open.
- Complete R1.8 target-environment evidence and browser evidence.
- Narrow platform allows to platform scope before mutation access opens. See the owning plan's command decisions.
- Keep recovery disabled until stable identity bindings, verified factors, contact preparation, audited commands, and all recovery tests pass.
- The interim recovery pair has no backup. Recovery stops when the required other administrator is unavailable.
- Do not use a stale AAL2 token as proof of current MFA enrollment.
- Complete end-to-end R2A through R9 workflows with objective evidence.
- Keep the R9 evidence manifest blocked until complete integration, browser, accessibility, performance, recovery, deployment, and release approvals exist.
- Remediate the dependency audit findings before making the dependency check blocking.
- R0 claim review, public-release controls, old deployment aliases, and live verification remain open.
- Production state was not reverified during this local package. Do not infer current production safety from local checks.
- The environment rejected the authorized feature-branch push because the configured private GitHub remote is unverified. Do not bypass that control.
- Validate staging before production migration or deployment. The active goal grants authority, not evidence.
- Target environments must set NEXT_PUBLIC_APP_URL to one canonical origin.
- RLS remains enabled on every application table. Request access uses fixed functions and a request-scoped public client.
- The restricted direct PostgreSQL worker has no raw table access. Worker delivery is locally verified but not activated in a target environment.
- Customer and vendor routes have guard foundations. CRM, workflow, finance, and operations foundations are additive and deny-first.
- R2B now includes strict search, duplicate-review, activity-history, and task-transition contracts. CRM contact and product writes use reviewed fixed RPCs with authenticated local isolation evidence.
- R2B vendor evidence now has strict source, fact, evidence-version, approval, freshness, and expiring-override contracts. Persistence and approval commands remain fail-closed.
- R2B controlled exports now require a same-organization approval, allow only resource-specific fields, redact all other row fields, and emit an audit record.
- R2B CRM export requests and decisions now use fixed audited RPCs with explicit `audit.export` approval, self-approval denial, replay receipts, and closed raw tables.
- R2B vendor evidence now has fixed audited record and approval RPCs with exact organization scope, draft-to-published approval, replay receipts, and closed raw tables.
- R2A lead routing now has a fixed audited command with active-owner membership checks, terminal-state protection, replay receipts, and exact organization scope.
- CRM command functions use fixed reviewed RPCs by default, with optional injected adapters for tests and replacements. They validate operation, organization, revision, outcome, and correlation fields.
- The current local CRM, vendor-evidence, and lead-routing packages pass focused unit and authenticated isolation rehearsals. The previous complete unit suite passed 142 files and 2,386 tests. Type checking, lint, production build, integration-matrix, secret scan, and diff check pass locally; the latest full run was interrupted after two minutes without progress.
- Public claims and commission copy still need approved evidence before release.
- Drizzle metadata is reconciled with all 34 checked-in migrations. Review the generated ledger before any target deployment.
- A provider-neutral server-only AI service boundary, immutable run-record
  contract, approval transition checks, and fixture tests now exist. Database
  storage, provider evaluation, and target environment evidence remain open.
- R5 AI routing now validates adapter capability and data-class profiles, deterministic selection, bounded retries, timeout handling, schema failures, and explicit approved fallbacks.
- R5 fixture evaluation now validates complete input and output hashes, schema and provider failures, deterministic ordering, and redacted results without retaining raw provider output.
- R3 candidate lifecycle transitions now enforce allowed paths, positive expected revisions, terminal selected and archived states, and approval-bound reactivation.
- R3 intake now has immutable snapshots, strict organization-scoped requirements, submission prerequisites, and revision-checked status transitions.
- R2B deals now have strict organization scope, stage and status alignment, forward-only transitions, terminal outcomes, optimistic revisions, and immutable history.
- R2A lead capture now uses a private implementation with isolated parameter names behind the stable public RPC, removing the authenticated `idempotency_key` ambiguity while preserving replay and audit behavior.
- R3 scorecard entry persistence now uses a fixed organization-scoped RPC with scorer binding, optimistic revision checks, replay receipts, and immutable entry history.
- R3 candidate lifecycle transitions now use a fixed organization-scoped RPC with replay receipts, optimistic revisions, and approval-bound reactivation.
- R3 candidate identity masking now records masked labels and requires an approval reference and reason for unmasking.
- R3 comparison reads now expose only organization-scoped masked candidates and approved scorecard values.
- R3 saved intake persistence now stores bounded draft revisions with immutable history and replay-safe audited writes.
- R3 deterministic matching now evaluates approved rule versions against published vendor facts, records bounded explanations, and excludes commercial fields from scoring.
- R3 matching rule sets now require an audited approval transition before active matching runs can use them.
- R3 comparison exports now use deny-first request and separate reviewer-decision records with replay and scope checks.
- R3 duplicate-product review now archives confirmed duplicate candidates while retaining immutable review evidence.
- R2B activity and task persistence now has an additive deny-first migration with organization-scoped tables and append-only task history; application remains unverified until local Supabase access returns.
- R3 workspace controls now validate scoped snapshots, participant status timestamps, immutable comments, and customer filtering of internal comments.
- R4 workflow persistence now has an additive deny-first schema for RFP versions, inbound email, immutable documents, communications, jobs, and job attempts; application and provider integration remain unverified.
- R4 now has a strict RFP version, approval, recipient, and distribution contract. Unapproved versions cannot distribute, recipients must be scoped and unique, and distribution freezes version content.
- R4 inbound email now has strict signature, timestamp, replay, address, and reference validation. Raw message content never enters the normalized event.
- R4 document access now validates immutable version scope, excludes superseded versions, and limits HTTPS signed access to fifteen minutes.
- R6 now has a strict demo request contract with distinct customer/vendor organizations, revision-checked scheduling, audited transitions, and terminal outcomes.
- R7 commission events now have audited forward-only state transitions with stale-state checks and terminal voided or written-off outcomes.
- R8 renewals now have immutable customer-success snapshots, scoped renewal windows, linked follow-on deal checks, audited approvals, and terminal outcomes.
- R8 onboarding now has immutable plans with milestone, check-in, risk, failure, completion, cancellation, and approval-bound reactivation controls.
- R8 project plans now generate only from approved templates and support revision-checked edits that protect completed milestones and go-live dates.
- R8 analytics now accepts only bounded non-sensitive event properties and blocks provider calls until explicit consent exists.
- R8 approval queues now enforce immutable decisions, anti-self-approval, reviewer metadata, and optimistic revisions.
- R8 customer-success outcomes now require distinct organizations, valid satisfaction scores, linked follow-on deals, and immutable source-event history.
- R8 customer-journey reports now reconcile onboarding, renewal, and outcome snapshots by organization with deterministic as-of checks.
- R8 vendor-performance reports now aggregate allowlisted response, qualification, demo, win, onboarding, payment, and failure events with organization isolation.
- R8 operations reports now summarize role-scoped open, overdue, and escalated queue work from source snapshots.
- R8 audit-viewer searches now enforce organization scope, actor/entity/action/date filters, stable pagination, and immutable redacted rows.
- R8 administration configuration now has versioned draft, approval, and retirement transitions with creator separation and secret-key rejection.
- R8 analytics reports now summarize consented marketing, lead, intake, evaluation, activation, and workflow-use events with as-of and duplicate checks.
- R8 revenue reports now summarize signed deals and commission lifecycle amounts by currency with organization, as-of, and duplicate checks.
- The complete suite now passes 116 files and 2,231 tests after the audit-viewer, administration-configuration, analytics-report, revenue-report, performance-evidence, accessibility, security-review, deployment-smoke, AI-routing, AI fixture-evaluation, R3 intake, R2B deal-lifecycle, R2B CRM entity, R2B activity-task, R2B activity-task persistence migration, R3 scorecard, R3 workspace, R4 workflow persistence migration, overflow, analytics-boundary, and fail-closed release-payload fixes.
- R9 performance evidence now validates required routes, LCP and INP percentile budgets, sample counts, as-of timestamps, and complete route coverage.
- R9 security-review evidence now requires domain coverage, reviewer evidence, immutable findings, and no open findings in a passed review.
- R9 deployment smoke evidence now validates canonical HTTPS origin, health, protected-route closure, commit identity, and migration rollback compatibility.
- Retain all 22 gallery layouts. Verify both Pulse routes and themes if shared UI changes.
- Keep unrelated local settings and generated Codex hooks outside task commits.
- Keep the copied public-site corpus and questionnaire audit in docs/temp/ internal.

## Active skills in play
- (none)

## Notes
- Use docs/README.md as the project entry point.
- Use docs/PRD.md for product authority.
- Use docs/TECH_STACK.md for architecture and security authority.
- Use docs/security/r1-authorization-matrix.md for current entry-point classes.
- Use [[knowledge/superseded]] before consulting legacy plans.
- Verified identity does not prove membership or permission.
- Keep immutable audit history and deny-first recovery controls.
- Do not run consolidation before the current full-delivery task ends.
