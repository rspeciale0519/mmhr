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

The sandbox reviewer rejected the exact remote push for
bugfix/r1-stable-identity-context. That write needs explicit user approval.
Do not bypass the rejection through another command or branch.
Independent local work can continue.

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

Type checking, lint, 2332 unit tests, recovery and migration cases, worker
cases, boundary cases, local Auth recovery flows, and the production build
passed. The full integration command remains live but has produced no test
output. Supabase startup remains live, no expected local ports are listening,
and the Docker API returns permission denied even with elevated access.

The focused R4 workflow migration review passed 8 tests, including required
tables, RLS, deny policies, organization-scoped composite keys, replay and
idempotency constraints, and recovery comments.

The focused R2B activity-task migration review passed 7 tests, including
required tables, RLS, deny policies, organization-scoped history, indexes, and
append-only posture. The focused R3 intake migration review also passed 7 tests,
and the focused R2B CRM foundation migration review passed 7 tests. The
complete suite now passes 127 files and 2,316 tests.

The focused R2A lead-command migration review passed 8 tests, including raw
table revocation for all runtime roles, consent and idempotency checks, fixed
search-path command security, and audit recording. The migration remains
unapplied until local Supabase and Docker access returns.

The focused R2B deal and vendor-evidence migration review passed 8 tests,
including scoped deal history, renewal windows, vendor-source and fact links,
immutable evidence versions, approval and freshness rules, and deny-first raw
access. The migration remains unapplied until local Supabase and Docker access
returns.

The focused R3 scorecard migration review passed 8 tests, including
organization-scoped intake and candidate links, weighted criteria, unique
scorer entries, immutable replacement history, bounded scores, and deny-first
raw access. The migration remains unapplied until local Supabase and Docker
access returns.

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
- R1.6 invitation database adapters now fail closed until reviewed SQL functions exist; complete target-environment wiring and evidence.
- Complete R1.8 target-environment evidence and browser evidence.
- Narrow platform allows to platform scope before mutation access opens. See the owning plan's command decisions.
- Keep recovery disabled until stable identity bindings, verified factors, contact preparation, audited commands, and all recovery tests pass.
- The interim recovery pair has no backup. Recovery stops when the required other administrator is unavailable.
- Do not use a stale AAL2 token as proof of current MFA enrollment.
- Complete end-to-end R2A through R9 workflows with objective evidence.
- Keep the R9 evidence manifest blocked until integration, browser, accessibility, performance, recovery, deployment, and release approvals exist.
- Remediate the dependency audit findings before making the dependency check blocking.
- R0 claim review, public-release controls, old deployment aliases, and live verification remain open.
- Production state was not reverified during this local package. Do not infer current production safety from local checks.
- Validate staging before production migration or deployment. The active goal grants authority, not evidence.
- Target environments must set NEXT_PUBLIC_APP_URL to one canonical origin.
- RLS remains enabled on every application table. Request access uses fixed functions and a request-scoped public client.
- The restricted direct PostgreSQL worker has no raw table access. Worker delivery is locally verified but not activated in a target environment.
- Customer and vendor routes have guard foundations. CRM, workflow, finance, and operations foundations are additive and deny-first.
- R2B now includes strict search, duplicate-review, activity-history, and task-transition contracts. CRM database adapters remain fail-closed until reviewed SQL functions and integration evidence exist.
- R2B vendor evidence now has strict source, fact, evidence-version, approval, freshness, and expiring-override contracts. Persistence and approval commands remain fail-closed.
- R2B controlled exports now require a same-organization approval, allow only resource-specific fields, redact all other row fields, and emit an audit record.
- CRM command functions now accept an injected reviewed adapter and validate operation, organization, revision, outcome, and correlation fields. The default path still fails closed without an adapter.
- Public claims and commission copy still need approved evidence before release.
- Drizzle metadata has an orphaned journal entry for missing `0011_r1_invitation_email_binding_check.sql`; recover exact history before replay or deployment.
- A provider-neutral server-only AI service boundary, immutable run-record
  contract, approval transition checks, and fixture tests now exist. Database
  storage, provider evaluation, and target environment evidence remain open.
- R5 AI routing now validates adapter capability and data-class profiles, deterministic selection, bounded retries, timeout handling, schema failures, and explicit approved fallbacks.
- R5 fixture evaluation now validates complete input and output hashes, schema and provider failures, deterministic ordering, and redacted results without retaining raw provider output.
- R3 candidate lifecycle transitions now enforce allowed paths, positive expected revisions, terminal selected and archived states, and approval-bound reactivation.
- R3 intake now has immutable snapshots, strict organization-scoped requirements, submission prerequisites, and revision-checked status transitions.
- R2B deals now have strict organization scope, stage and status alignment, forward-only transitions, terminal outcomes, optimistic revisions, and immutable history.
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
