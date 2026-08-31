# MMHR v2 Implementation Roadmap

## Document Control

| Field | Value |
|---|---|
| Version | 1.8 |
| Date | 2026-08-28 |
| Status | Approved roadmap; R0 control records complete; public-release quarantine active; R1.0 through R1.5 foundations verified locally; R1.8 evidence recorded; R2B lead command started |
| Approval date | 2026-08-24 |
| Amendment approval date | 2026-08-24 |
| R1 owner record date | 2026-08-25 |
| R1 full owner approval date | 2026-08-27 |
| R0 control record | [module-r0-roadmap-and-public-release-control.md](./module-r0-roadmap-and-public-release-control.md) |
| Product authority | [docs/PRD.md](../../docs/PRD.md) |
| Architecture authority | [docs/TECH_STACK.md](../../docs/TECH_STACK.md) |
| Project entry point | [docs/README.md](../../docs/README.md) |
| Baseline branch | develop |
| Baseline evidence date | 2026-08-24 |

This approved roadmap replaces legacy sequencing.

The user authorized R1 implementation and routine Git work through `develop` on 2026-08-27.

Production dependencies, cloud migrations, bootstrap actions, `main`, and deployments remain separately controlled.

## 1. Outcome

Build the complete v2 platform through secure, independently testable releases.

Preserve all canonical requirements. Do not reduce scope to make a partial release appear complete.

The baseline audit found 148 requirement identifiers:

- 132 functional requirements
- 16 non-functional requirements
- 5 Implemented
- 22 Partial
- 119 Missing
- 1 Deferred
- 1 Open

The earlier count of 132 covered functional requirements only.

## 2. Status Rules

| Status | Meaning |
|---|---|
| Implemented | Current source provides the required behavior with qualifying evidence |
| Partial | Current source provides part of the behavior, but a material requirement remains |
| Missing | No qualifying end-to-end implementation evidence exists |
| Deferred | The canonical PRD defers the requirement |
| Open | A product decision blocks the final requirement |

Static design examples do not prove functional product behavior.

Architecture approval does not prove implementation.

## 3. Owner Codes

| Code | Accountable role | Named owner |
|---|---|---|
| PO | Product owner | Rob Speciale |
| SEC | Security owner | Rob Speciale |
| ENG | Engineering owner | Rob Speciale |
| OPS | MMHR operations owner | Rob Speciale (temporary) |
| FIN | Finance owner | Rob Speciale |
| MKT | Marketing and content owner | Rob Speciale |
| DATA | Vendor-data owner | Rob Speciale |
| REL | Production release owner | Rob Speciale |

All roadmap owner roles have named people.

## 4. Evidence and Gap Codes

| Code | Evidence or gap |
|---|---|
| E1 | Authentication actions, verified claims, middleware, tRPC protection, and authentication integration tests |
| E2 | Organization, membership, invitation, RLS-enablement, and database integration foundations |
| E3 | Lead and audit schemas with the first migration |
| E4 | Public marketing routes, Pulse, and the retained design gallery |
| E5 | Consent banner, consent-gated analytics, and consent tests |
| E6 | Sentry application-error wiring and Trigger.dev health wiring |
| E7 | Generic AI environment inventory with no fixed AI SDK or model |
| G1 | No qualifying domain schema, service, router, workflow, or test exists |
| G2 | RLS is default-deny, but policies and the organization-role matrix are absent |
| G3 | Authentication exists, but the required route or permission enforcement is incomplete |
| G4 | Placeholder or legacy public claims still render |
| G5 | No measured compliance, service-level, performance, or recovery evidence exists |
| D1 | The common RFP and vendor-amendment decision remains open |

Evidence paths:

- E1: src/app/(auth)/, src/middleware.ts, src/server/trpc/trpc.ts, src/server/auth/auth.integration.test.ts
- E2: src/server/db/schema/identity.ts, drizzle/0000_light_vanisher.sql, src/server/db/db.integration.test.ts
- E3: src/server/db/schema/leads.ts and drizzle/0000_light_vanisher.sql
- E4: src/app/(marketing)/, src/designs/pulse/, and src/designs/registry.ts
- E5: src/components/cookie-consent.tsx and src/lib/analytics/
- E6: src/instrumentation.ts, src/instrumentation-client.ts, src/app/global-error.tsx, and src/trigger/health.ts
- E7: .env.example and package.json

## 5. Dependency Sequence

R2A and R2B can run in parallel after R1. Approve their shared lead-to-CRM
command and status contract before either release starts.

R2A lead-routing completion depends on the R2B CRM command. R3 depends on R2B.

| Release | Outcome | Depends on | Required approval |
|---|---|---|---|
| R0 | Record roadmap approval, assign decision ownership, and enforce public-release quarantine | None | Product owner |
| R1 | Secure identity, permissions, RLS, audit, and organization administration | R0 | Product, security, engineering, and operations owners |
| R2A | Complete truthful marketing, registration, consent, lead routing, content, SEO, and newsletter workflows | R1 | Product, marketing, and security owners |
| R2B | Build CRM, deal, activity, task, search, export, and manual vendor-evidence foundations | R1 | Product, operations, data, and security owners |
| R3 | Build intake, deterministic matching, flexible evaluation, scorecards, and masking | R2B | Product, operations, and security owners |
| R4 | Build RFP, response, communication, document, inbound, and job foundations | R3 | Product, operations, and security owners |
| R5 | Add provider-neutral AI assistance, fixtures, review, and safe failure | R4 | Product, engineering, and security owners |
| R6 | Build demos, proposals, pricing, selection, and contract handoff | R5 | Product, operations, and security owners |
| R7 | Build commissions, invoicing, collection, disputes, and finance reconciliation | R6 | Product, finance, and security owners |
| R8 | Complete onboarding, work queues, administration, reporting, analytics, and operational health | R7 | Product, operations, finance, and security owners |
| R9 | Complete performance, accessibility, availability, privacy, recovery, security, and production gates | R8 | Product, security, and release owners |

Each release must build only from an approved module plan.

## 6. Product Decision Gates

| Decision | Current default | Required before |
|---|---|---|
| Common RFP with vendor amendments | Open | R4 implementation |
| Exact identity-unmasking rule | No unmasking without recorded internal approval | R3 implementation |
| Customer-visible scoring methodology | No public or customer-visible method beyond approved explanations | R3 release |
| Public vendor-ranking scope | No public ranking | Any public-ranking work |
| Impersonation | Deferred and disabled | R8 impersonation work |
| Category expansion | HR software only | Any new-category work |
| Sponsored placement | No sponsored placement | Any sponsored-placement work |

Record each decision in the PRD before its owning module starts.

## 7. Integration Approval Gates

| Release | Integration decision |
|---|---|
| R2A | Approve managed-content and newsletter dependencies before installation |
| R4 | Approve transactional email, inbound email, document scanning, storage policy, and acquisition dependencies |
| R5 | Approve AI adapter configuration, data controls, fixtures, and production use |
| R6 | Approve scheduling and PDF dependencies |
| R7 | Approve the finance export or handoff destination |
| R9 | Approve staging and production deployment configuration |

No AI provider or model is fixed by this roadmap.

AI capability selection must remain interchangeable behind AIService.

## 8. Release Details

### R0 — Roadmap and Public-Release Control

Control record: [module-r0-roadmap-and-public-release-control.md](./module-r0-roadmap-and-public-release-control.md).

The R0 control record now records named owners, open decisions, claim-family
owners, route coverage, the fail-closed local release gate, recovery, and
linked control status.

The exact statement review register remains incomplete. No public claim is
approved by the inventory.

The product owner chose to retain the blocked statements as placeholders for now.

Production activation still needs a separate approved deployment.

Claim evidence, deployment and alias controls, live verification, and
production approval keep the public release blocked.

Outcome:

- Approve this roadmap and its status mapping.
- Assign named owners to every release and open decision.
- Keep indexing and public deployment blocked until legacy claims are replaced.
- Create an approved copy inventory with sources and review records.
- Record the first module plan approval.

Exit evidence:

- Product-owner approval of this roadmap
- Decision register with owners and required dates or release gates
- Complete legacy-claim inventory
- Written public-release block
- No unresolved authority conflict between README, PRD, technical architecture, and roadmap

Recovery:

- Keep the current site non-indexed.
- Do not publish unapproved replacement claims.
- Revert only the new copy when evidence review fails.

### R1 — Secure Platform Base

Owning plan: [module-r1-secure-platform-base.md](./module-r1-secure-platform-base.md).

The product, security, engineering, and operations owners approved its scope and defaults.

The approved interim recovery pair uses approval from the other named Super Admin.

Recovery requests expire after 30 minutes and permit only an MFA enrollment reset.

The reset removes every MFA factor and binds one verified replacement to the target's approved recovery session.

Lost-factor recovery requires a call to the target's pre-existing company-record phone number.

R1.4 is locally verified, and R1.5 route and MFA foundations are in progress. Recovery remains disabled until target-environment activation is approved.

Outcome:

- Complete platform and organization roles.
- Add role defaults, feature permissions, action permissions, field permissions, and per-user overrides.
- Add customer and vendor portal grants.
- Build fail-closed customer and vendor authorization foundations.
- Protect customer, vendor, and administration routes.
- Add permission middleware to protected procedures and commands.
- Add reviewed grants and RLS behavior for every current table.
- Record that no private application bucket exists yet.
- Add immutable, redacted audit commands with reason and correlation fields.
- Separate migration ownership from trusted application-worker access.

Required data changes:

- Platform roles and organization types
- Permission definitions, grants, overrides, and delegation rules
- Portal-access grants and revocations
- Versioned role defaults
- Append-only audit events
- Named privileged commands

Exit evidence:

- Clean migration on an empty local database
- Same-organization success for every permitted role
- Cross-organization denial for every table and storage path
- Policy USING and WITH CHECK tests
- Route and procedure permission-denial tests
- Field-permission and override tests
- Audit immutability, redaction, reason, and correlation tests
- Recovery rehearsal for the migration

Recovery:

- Keep every new table default-deny.
- Use expand-and-contract migrations.
- Disable new privileged commands through a server flag.
- Preserve the prior application version and a pre-migration backup.

Cross-release authorization obligations:

- R1 completes FR-IAM-12 through authorized portal grants, revocations, and audit evidence.
- FR-IAM-10 remains Partial until R6 completes customer-resource isolation.
- FR-IAM-11 remains Partial until R7 proves vendor isolation and commission denial.
- Every R2A through R9 module must extend R1 permissions, RLS, audit, and isolation evidence.
- Every R5 through R9 module must prove that AI cannot influence authorization results.
- R9 must repeat the complete customer and vendor isolation matrices.

### R2A — Marketing, Registration, and Lead Operations

Outcome:

- Replace legacy commission, affiliation, vendor-count, ranking, and outcome claims.
- Add source and approval records for every published claim.
- Add managed content through ContentService.
- Complete canonical, social, sitemap, and semantic metadata.
- Complete registration fields and work-email validation.
- Add reviewed exceptions for permitted personal email domains.
- Gate resources with the same identity, consent, and lead rules.
- Route leads into CRM with source, owner, consent, and follow-up state.
- Add consent-aware newsletter registration.

Exit evidence:

- Zero placeholder or unapproved public claims
- Claim-source and approval records
- Registration success, invalid-input, rate-limit, and exception tests
- Consent and outreach tests
- Lead ownership and routing tests
- Shared lead-to-CRM contract tests against the R2B command
- Canonical, social, sitemap, and robots checks
- Public WCAG 2.1 AA evidence
- Public LCP evidence at the required percentile

Recovery:

- Keep indexing disabled until all exit evidence passes.
- Disable registration, gated downloads, or newsletter writes independently.
- Preserve captured consent and lead history during rollback.

### R2B — CRM and Workflow Substrate

Outcome:

- Build customers, vendors, products, contacts, relationships, deals, activities, tasks, and state history.
- Preserve immutable activity and commercial history.
- Add search, duplicate detection, controlled exports, and renewals.
- Add manual vendor sources, facts, evidence, approvals, freshness, and overrides.
- Add the minimum administration surfaces required for these records.
- Publish the shared lead-create command and status contract for R2A.
- Define analytics event names and reporting dimensions without sensitive payloads.

Required data changes:

- Customer, vendor, product, contact, and relationship records
- Deal and deal-stage history
- Activity, note, task, and reminder records
- Vendor sources, facts, evidence versions, approvals, and overrides
- Export approvals and audit events
- Duplicate candidates and review decisions

Exit evidence:

- State-transition and history tests
- Search and field-permission tests
- Duplicate detection without automatic merge
- Export permission and audit tests
- Vendor-fact source, approval, and freshness tests
- Migration forward and recovery evidence
- Browser checks for customer, vendor, product, deal, and task states

Recovery:

- Use additive schemas before switching readers.
- Preserve legacy organization and lead identifiers.
- Disable new writes while keeping old reads available.
- Use compensating events instead of deleting approved history.

### R3 — Intake, Matching, and Evaluation

Outcome:

- Build saved intake, requirements, candidates, scorecards, collaboration, and workspaces.
- Keep candidate state separate from deal state.
- Enforce five candidates only for the initial evaluation.
- Add approved post-review candidate additions.
- Build deterministic eligibility and scoring.
- Keep commission data outside eligibility and scoring.
- Add masking, controlled unmasking, explanations, limitations, and evidence freshness.
- Add comparison exports and concurrent scorecards.

Required decisions:

- Exact identity-unmasking rule
- Customer-visible scoring-methodology rule

Exit evidence:

- Deterministic fixture tests
- Commission-independence tests
- Scoring-configuration preview, approval, version, and audit tests
- Candidate pause, elimination, selection, and reactivation tests
- Five-candidate boundary tests
- Masking and unmasking permission tests
- Concurrent scorecard conflict tests
- Export redaction tests
- Customer and internal browser journeys

Recovery:

- Version every scoring configuration.
- Restore the prior approved configuration without changing history.
- Disable new comparisons while preserving intake and scoring records.
- Never delete an eliminated or reactivated candidate.

### R4 — RFP, Communications, Documents, and Jobs

Outcome:

- Build versioned questionnaires, RFPs, review, clarification, approval, and distribution.
- Build structured forms, email ingestion, uploads, response review, clarification, and failure states.
- Build EmailService, InboundEmailService, DocumentStore, DocumentScanner, JobService, and ContentAcquisitionService.
- Verify webhooks, timestamps, replay state, and provider-event uniqueness.
- Quarantine files before validation and scanning.
- Preserve immutable document versions and short-lived signed access.
- Route evaluation communications through MMHR.
- Support manual and automated vendor-source acquisition.

Required decision:

- Common RFP with vendor-specific amendments

Exit evidence:

- An unapproved RFP cannot leave the server
- RFP version and recipient audit tests
- Webhook signature, timestamp, replay, and deduplication tests
- Participant and workflow-state verification tests
- File extension, MIME, magic-byte, size, and hash tests
- Quarantine, scan, signed-URL, and document-version tests
- Job idempotency, retry, needs-attention, and manual-rerun tests
- Visible ingestion and extraction failure tests

Recovery:

- Disable each inbound or outbound adapter independently.
- Keep original messages and files immutable.
- Stop downstream processing without deleting evidence.
- Reuse durable records and idempotency keys during reruns.

### R5 — Provider-Neutral AI Assistance

Outcome:

- Implement AIService under a server-only integration boundary.
- Let business code request capabilities instead of provider or model identifiers.
- Add adapter profiles for capabilities and permitted data classes.
- Add versioned instructions, schemas, source references, cost limits, and run records.
- Add fixed fixtures and provider-change evaluation.
- Add review queues, approval records, explicit fallback, and visible failure.
- Add untrusted-content isolation and prompt-injection tests.
- Add AI-assisted vendor extraction and response normalization.

Exit evidence:

- Repository-wide identifier checks allow provider and model names only in server adapters, configuration, tests, and audit metadata
- Provider SDK import checks allow imports only in approved server adapters, instrumentation, tests, and composition roots
- Schema rejection and safe-failure tests
- Data-class routing that fails closed
- Fixed fixture evaluation
- Adapter replacement without domain-schema or workflow changes
- Complete provenance and cost records
- Rejected or unreviewed output cannot become customer-visible
- Provider timeout, fallback, and retry tests
- Untrusted-content tests

Recovery:

- Disable any adapter or capability independently.
- Fall back only through a recorded and approved route.
- Keep deterministic workflows available without AI.
- Preserve every failed and reviewed run.

### R6 — Demos, Proposals, and Contract Handoff

Outcome:

- Build demo rounds, MMHR-brokered scheduling, participants, agendas, feedback, scores, and commitments.
- Preserve every proposal and pricing version.
- Compare only approved proposal data with source links.
- Record selection, reasons, approvals, risks, introduction, and contract status.
- Keep legal negotiation between the customer and vendor.
- Preserve signed, unsigned, stalled, and cancelled outcomes.
- Complete customer portal isolation across every resource required by FR-IAM-10.

Exit evidence:

- Scheduling state and reschedule tests
- Demo attendance, score, feedback, and evidence tests
- Proposal supersession and revision tests
- Pricing-comparison approval and source tests
- Selection approval and risk tests
- Contract-handoff and direct-negotiation boundary tests
- Stalled, unsigned, and cancelled history tests
- Complete customer organization, deal, permission, and resource-isolation evidence

Recovery:

- Disable external scheduling while keeping manual coordination.
- Preserve every proposal and pricing version.
- Reopen non-terminal states through recorded transitions.
- Never overwrite or delete contract-handoff history.

### R7 — Commissions and Financial Closure

Outcome:

- Build effective-dated commission structures and source agreements.
- Create one idempotent commission event for each eligible signed contract.
- Store calculations, reviews, invoices, payments, balances, disputes, and adjustments.
- Block financial closure while the commission state is unresolved.
- Reconcile financial reports to source events.
- Add an approved finance export or handoff when required.
- Complete vendor portal isolation, including commission-data denial, for FR-IAM-11.

Exit evidence:

- One commission event per eligible contract
- Duplicate-delivery and idempotency tests
- Calculation input, currency, reviewer, and approval tests
- Invoice readiness and issue tests
- Partial-payment and balance reconciliation tests
- Overdue, disputed, adjusted, voided, and written-off tests
- Financial-close blocking tests
- Report reconciliation to immutable source events
- Complete vendor organization, permission, competitor, private-record, and commission-denial evidence

Recovery:

- Disable new invoice and export writes independently.
- Use compensating adjustments instead of destructive edits.
- Preserve prior calculation versions and source agreements.
- Reconcile external and internal records before re-enabling writes.

### R8 — Customer Success and Operational Control

Outcome:

- Build onboarding plans, milestones, check-ins, risks, failure, reactivation, completion, and cancellation.
- Build renewal, replacement, expansion, and repeat-deal workflows.
- Complete work queues, project plans, reminders, escalation, and reassignment.
- Complete administration configuration and approval queues.
- Add an authorized audit viewer.
- Complete revenue, pipeline, vendor, customer-journey, and operations reports.
- Complete funnel, workflow-use, job, communication, AI, and provider-cost analytics.
- Keep administration capabilities incremental in every earlier release.

Exit evidence:

- Onboarding state, risk, failure, and reactivation tests
- Renewal and linked-deal tests
- Queue accuracy and overdue-work tests
- Project-plan generation and edit tests
- Approval-queue permission tests
- Audit-viewer authorization tests
- Report totals reconciled to source events
- Consent and sensitive-analytics-property tests
- Operational alert tests

Recovery:

- Disable individual queues, reports, or analytics event families.
- Keep source events as report authority.
- Rebuild projections from source history.
- Preserve failed onboarding and prior-deal history.

### R9 — Release Hardening and Production Readiness

Outcome:

- Complete critical-workflow interaction performance.
- Configure availability monitoring, alerting, and monthly SLO calculation.
- Complete approved deletion and retention workflows.
- Complete backup, restore, recovery-point, and recovery-time evidence.
- Complete all acceptance matrices.
- Add integration, browser, accessibility, performance, dependency, secret, and deployment gates to CI.
- Complete security review and production rollback rehearsal.

Exit evidence:

- Full standard CI gates
- Local and CI integration tests
- Critical browser journeys
- Keyboard, screen-reader, contrast, and automated accessibility evidence
- LCP and INP percentile evidence
- Availability monitoring and alert tests before launch
- Deletion drill
- Restore drill with recorded RPO and RTO
- Security review
- Deployment smoke test and rollback rehearsal
- Explicit production approval

Post-launch acceptance:

- Record the first complete monthly availability result.
- Open corrective work if the result is below 99.9%.

Recovery:

- Preserve the previous deployable application and compatible schema.
- Use feature flags or adapter disable switches for every high-risk capability.
- Roll back application code without deleting new records.
- Use a forward fix when a database rollback is unsafe.

## 9. Cross-Release Definition of Done

Each module plan must identify:

- Requirement identifiers
- State transitions
- Data and migration changes
- User-scoped and privileged access paths
- RLS and storage policies
- Success, denial, invalid-input, boundary, and failure tests
- State-transition and history tests
- Audit-record verification
- Relevant same-organization success and cross-organization denial tests
- Audit events
- Observability and alerts
- Forward and recovery paths
- Feature flag or isolation method
- Approval record and evidence location

Each release must:

1. Run the smallest relevant check first.
2. Run type checking, lint, tests, builds, and integration checks that cover the change.
3. Run browser checks for rendered behavior.
4. Review every migration and its recovery path.
5. Review the final diff for unrelated work and secrets.
6. Preserve provider and model interchangeability.
7. Receive approval before cloud migration or production deployment.

## 10. Main Risks and Recovery Controls

| Risk | Prevention | Recovery |
|---|---|---|
| Unauthorized cross-organization access | Default-deny RLS, server permissions, and complete role matrices | Disable affected commands, preserve audit, and apply a reviewed forward fix |
| Privileged-pool misuse | Named commands, restricted worker role, transactional audit | Disable privileged mutations and rotate the affected credential |
| Audit gaps | Append-only events, allowlisted diffs, correlation, and reconciliation | Rebuild projections from source events and investigate missing records |
| Public trust failure | Approved sources, claim review, and indexing block | Remove the claim and keep the site non-indexed |
| AI error or lock-in | Neutral interfaces, fixtures, validation, review, and adapter isolation | Disable the adapter and preserve deterministic workflows |
| Untrusted document attack | Quarantine, validation, scanning, and immutable originals | Stop processing and preserve evidence for review |
| Duplicate financial events | Unique idempotency constraints and reconciliation | Post compensating adjustments and reconcile |
| Report drift | Reports derived from canonical events | Rebuild projections and block release until totals match |
| Migration failure | Expand-and-contract, backup, resumable backfill, and compatibility | Restore service with the prior application and a safe forward fix |
| Analytics privacy error | Consent gates and allowlisted properties | Disable event collection and remove unauthorized derived data |
| Provider outage | Typed failure, retry policy, durable records, and disable switches | Route only through an approved fallback or manual workflow |

## 11. Requirement Traceability Matrix

Every PRD requirement appears exactly once below.

| Requirement | Baseline | Release | Owner | Evidence or gap |
|---|---|---|---|---|
| FR-IAM-01 | Implemented | R1 | SEC | E1 |
| FR-IAM-02 | Partial | R1 | SEC | E2; G2 |
| FR-IAM-03 | Partial | R1 | SEC | E1; G2 |
| FR-IAM-04 | Partial | R1 | SEC | E2 |
| FR-IAM-05 | Missing | R1 | SEC | G1 |
| FR-IAM-06 | Missing | R1 | SEC | G1 |
| FR-IAM-07 | Partial | R1 | SEC | E1; G3 |
| FR-IAM-08 | Deferred | R8 | PO + SEC | PRD deferred |
| FR-IAM-09 | Partial | R1 | SEC | E3 |
| FR-IAM-10 | Missing | R6 | SEC | G1 |
| FR-IAM-11 | Missing | R7 | SEC | G1 |
| FR-IAM-12 | Missing | R1 | SEC | G1 |
| FR-MKT-01 | Implemented | R2A | PO + MKT | E4 |
| FR-MKT-02 | Implemented | R2A | PO + MKT | E4 |
| FR-MKT-03 | Missing | R2A | PO + MKT | G4 |
| FR-MKT-04 | Missing | R2A | PO + MKT | G1 |
| FR-MKT-05 | Partial | R2A | PO + MKT | E4; G1 |
| FR-MKT-06 | Partial | R2A | PO + MKT | E1; E3 |
| FR-MKT-07 | Missing | R2A | PO + MKT | G1 |
| FR-MKT-08 | Missing | R2A | PO + MKT | G1 |
| FR-MKT-09 | Partial | R2A | PO + MKT | E5 |
| FR-MKT-10 | Partial | R2A | PO + MKT | E3 |
| FR-MKT-11 | Missing | R2A | PO + MKT | G1 |
| FR-CRM-01 | Partial | R2B | OPS | E2; E3 |
| FR-CRM-02 | Missing | R2B | OPS | G1 |
| FR-CRM-03 | Missing | R2B | OPS | G1 |
| FR-CRM-04 | Missing | R2B | OPS | G1 |
| FR-CRM-05 | Partial | R2B | OPS | E3 |
| FR-CRM-06 | Missing | R2B | OPS | G1 |
| FR-CRM-07 | Missing | R2B | OPS | G1 |
| FR-CRM-08 | Missing | R2B | OPS | G1 |
| FR-CRM-09 | Missing | R2B | OPS | G1 |
| FR-INT-01 | Missing | R3 | PO + OPS | G1 |
| FR-INT-02 | Missing | R3 | PO + OPS | G1 |
| FR-INT-03 | Missing | R3 | PO + OPS | G1 |
| FR-INT-04 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-01 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-02 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-03 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-04 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-05 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-06 | Partial | R3 | PO + OPS | E2 |
| FR-EVL-07 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-08 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-09 | Missing | R3 | PO + OPS | G1 |
| FR-EVL-10 | Missing | R3 | PO + OPS | G1 |
| FR-MAT-01 | Missing | R3 | PO + OPS | G1 |
| FR-MAT-02 | Missing | R3 | PO + OPS | G1 |
| FR-MAT-03 | Missing | R3 | PO + OPS | G1 |
| FR-MAT-04 | Missing | R3 | PO + OPS | G1 |
| FR-MAT-05 | Partial | R3 | PO + OPS | E4; G4 |
| FR-MAT-06 | Missing | R3 | PO + OPS | G1 |
| FR-MAT-07 | Missing | R3 | PO + OPS | G1 |
| FR-MAT-08 | Missing | R3 | PO + OPS | G1 |
| FR-VND-01 | Missing | R2B | DATA | G1 |
| FR-VND-02 | Missing | R4 | DATA | G1 |
| FR-VND-03 | Missing | R5 | DATA | G1 |
| FR-VND-04 | Missing | R5 | DATA | G1 |
| FR-VND-05 | Missing | R2B | DATA | G1 |
| FR-VND-06 | Missing | R2B | DATA | G1 |
| FR-VND-07 | Missing | R2B | DATA | G1 |
| FR-VND-08 | Missing | R2B | DATA | G1 |
| FR-RFP-01 | Missing | R4 | OPS | G1 |
| FR-RFP-02 | Missing | R4 | OPS | G1 |
| FR-RFP-03 | Missing | R4 | OPS | G1 |
| FR-RFP-04 | Missing | R4 | OPS | G1 |
| FR-RFP-05 | Open | R4 | OPS | D1 |
| FR-RFP-06 | Missing | R4 | OPS | G1 |
| FR-RSP-01 | Missing | R4 | OPS | G1 |
| FR-RSP-02 | Missing | R4 | OPS | G1 |
| FR-RSP-03 | Missing | R5 | OPS | G1 |
| FR-RSP-04 | Missing | R4 | OPS | G1 |
| FR-RSP-05 | Missing | R4 | OPS | G1 |
| FR-RSP-06 | Missing | R4 | OPS | G1 |
| FR-DMO-01 | Missing | R6 | OPS | G1 |
| FR-DMO-02 | Missing | R6 | OPS | G1 |
| FR-DMO-03 | Missing | R6 | OPS | G1 |
| FR-PRP-01 | Missing | R6 | OPS | G1 |
| FR-PRP-02 | Missing | R6 | OPS | G1 |
| FR-PRP-03 | Missing | R6 | OPS | G1 |
| FR-CTR-01 | Missing | R6 | OPS | G1 |
| FR-CTR-02 | Missing | R6 | OPS | G1 |
| FR-CTR-03 | Missing | R6 | OPS | G1 |
| FR-CTR-04 | Missing | R6 | OPS | G1 |
| FR-FIN-01 | Missing | R7 | FIN | G1 |
| FR-FIN-02 | Missing | R7 | FIN | G1 |
| FR-FIN-03 | Missing | R7 | FIN | G1 |
| FR-FIN-04 | Missing | R7 | FIN | G1 |
| FR-FIN-05 | Missing | R7 | FIN | G1 |
| FR-FIN-06 | Missing | R7 | FIN | G1 |
| FR-FIN-07 | Missing | R7 | FIN | G1 |
| FR-FIN-08 | Missing | R7 | FIN | G1 |
| FR-CSM-01 | Missing | R8 | OPS | G1 |
| FR-CSM-02 | Missing | R8 | OPS | G1 |
| FR-CSM-03 | Missing | R8 | OPS | G1 |
| FR-CSM-04 | Missing | R8 | OPS | G1 |
| FR-CSM-05 | Missing | R8 | OPS | G1 |
| FR-WRK-01 | Missing | R2B | OPS | G1 |
| FR-WRK-02 | Missing | R8 | OPS | G1 |
| FR-WRK-03 | Missing | R8 | OPS | G1 |
| FR-CMN-01 | Missing | R4 | OPS + ENG | G1 |
| FR-CMN-02 | Missing | R4 | OPS + ENG | G1 |
| FR-CMN-03 | Missing | R4 | OPS + ENG | G1 |
| FR-CMN-04 | Missing | R4 | OPS + ENG | G1 |
| FR-DOC-01 | Missing | R4 | ENG + SEC | G1 |
| FR-DOC-02 | Missing | R4 | ENG + SEC | G1 |
| FR-DOC-03 | Missing | R4 | ENG + SEC | G1 |
| FR-DOC-04 | Missing | R4 | ENG + SEC | G1 |
| FR-DOC-05 | Missing | R4 | ENG + SEC | G1 |
| FR-AI-01 | Partial | R5 | ENG + PO | E7; G1 |
| FR-AI-02 | Missing | R5 | ENG + PO | G1 |
| FR-AI-03 | Missing | R5 | ENG + PO | G1 |
| FR-AI-04 | Missing | R5 | ENG + PO | G1 |
| FR-AI-05 | Missing | R5 | ENG + PO | G1 |
| FR-AI-06 | Missing | R5 | ENG + PO | G1 |
| FR-AI-07 | Missing | R5 | ENG + PO | G1 |
| FR-AI-08 | Missing | R5 | ENG + PO | G1 |
| FR-AI-09 | Partial | R5 | ENG + PO | E7; G1 |
| FR-AI-10 | Missing | R5 | ENG + PO | G1 |
| FR-ADM-01 | Missing | R8 | OPS + SEC | G1 |
| FR-ADM-02 | Missing | R8 | OPS + SEC | G1 |
| FR-ADM-03 | Missing | R8 | OPS + SEC | G1 |
| FR-ADM-04 | Missing | R8 | OPS + SEC | G1 |
| FR-RPT-01 | Missing | R8 | OPS + FIN | G1 |
| FR-RPT-02 | Missing | R8 | OPS + FIN | G1 |
| FR-RPT-03 | Missing | R8 | OPS + FIN | G1 |
| FR-RPT-04 | Missing | R8 | OPS + FIN | G1 |
| FR-RPT-05 | Missing | R8 | OPS + FIN | G1 |
| FR-ANL-01 | Implemented | R8 | PO + ENG | E5 |
| FR-ANL-02 | Partial | R8 | PO + ENG | E5 |
| FR-ANL-03 | Missing | R8 | PO + ENG | G1 |
| FR-ANL-04 | Partial | R8 | PO + ENG | E6 |
| NFR-PERF-01 | Missing | R2A | ENG | G5 |
| NFR-PERF-02 | Missing | R9 | ENG | G5 |
| NFR-AVL-01 | Missing | R9 | ENG | G5 |
| NFR-AUTH-01 | Partial | R1 | SEC | E1; G2 |
| NFR-ISO-01 | Partial | R1 | SEC | E2; G2 |
| NFR-ACC-01 | Partial | R9 | PO + ENG | E4; E5; G5 |
| NFR-DATA-01 | Missing | R2B | DATA | G1 |
| NFR-DATA-02 | Missing | R2B | DATA | G1 |
| NFR-AUD-01 | Partial | R1 | SEC | E3; G1 |
| NFR-PRV-01 | Implemented | R2A | SEC | E5 |
| NFR-PRV-02 | Missing | R9 | SEC | G1 |
| NFR-REC-01 | Missing | R9 | ENG | G5 |
| NFR-REC-02 | Missing | R9 | ENG | G5 |
| NFR-AI-01 | Missing | R5 | ENG + PO | G1 |
| NFR-DOC-01 | Missing | R4 | SEC | G1 |
| NFR-OBS-01 | Partial | R9 | ENG | E6; G1 |

## 12. Approval Record

| Approval | Status | Record |
|---|---|---|
| Product-owner roadmap approval | Approved | Rob Speciale, current Codex task, 2026-08-24 |
| FR-IAM-10 and FR-IAM-11 roadmap amendment | Approved | Rob Speciale, current Codex task, 2026-08-24 |
| Product-owner R1 plan approval | Approved | Rob Speciale, current Codex task, 2026-08-24 |
| Product-owner R0 control approval | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Security review of R1 boundaries | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Engineering feasibility review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Operations workflow review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Interim recovery pair and other-admin approval rule | Approved | Product and security owner, current Codex task, 2026-08-27 |
| Recovery expiry, allowed action, and phone identity check | Approved | Product and security owner, current Codex task, 2026-08-28 |
| R1 implementation and routine Git through `develop` | Approved | User standing instruction, current Codex task, 2026-08-27 |
| Finance workflow review | Pending | Add review reference |

Feature implementation starts only after the owning module plan receives its required approvals.
