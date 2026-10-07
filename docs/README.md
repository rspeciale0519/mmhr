# MatchMaker HR (MMHR)

> **Delivery notice, October 7, 2026.** The product owner approved the [MVP complete UI/UX and backend roadmap, version 1.1](../.codex/plans/build-mvp-complete-ui-ux-roadmap-2026-10-06.md).
> It replaces the October 3 instruction to complete all mandatory software before live use.
> Launch Candidate A ships after roadmap phase P2. Launch Candidate B adds demos, proposals, and contract handoff after P3.
> Financial-record management and private document storage are outside the MVP.
> Where this document conflicts with the roadmap on launch scope or delivery order, follow the roadmap.
> Current work follows that roadmap. The current phase record is [the P0 baseline](../.codex/plans/build-mvp-p0-baseline-2026-10-07.md).
> A full rewrite follows the launch.

MMHR is a private operating platform for HR software selection and related customer operations.

MMHR staff use the platform with registered customers and invited vendor users. MMHR does not sell the platform as a commercial SaaS product.

## Current Status

The [October 3 code audit](code-audit-2026-10-03.md) is the current requirement assessment.
Its [148-requirement matrix](code-audit-requirements-2026-10-03.md) links requirements to code, tests, remaining work, and acceptance conditions.
Replies, clarifications, demos, quotes, contract handoff, and private documents now have connected local workflows.
Finance, application email, document processing, CRM, customer success, reporting, and administration remain incomplete.
The October 2 candidate passed 4,940 unit tests, type checking, lint, and the production build.
Those results do not certify later changes or a hosted release.
The [October 3 dependency review](../.codex/plans/decision-security-dependency-remediation-2026-10-03.md) reports 16 affected packages and an unpatched high finding.
The complete integration run and hosted acceptance remain open. All 12 R9 release evidence categories remain pending.
Historical records below describe foundation work. They do not establish complete product workflows or current release readiness.

The October 3 instruction requires complete mandatory software and synthetic role testing before real customer use.
Use the [current execution plan](../.codex/plans/build-complete-pilot-workflow.md#full-software-completion-before-live-use) for that sequence.
The earlier MVP milestone focuses on registration and customer intake through approved RFP delivery.
Use the [MVP launch checklist](../.codex/plans/release-mvp-launch-checklist.md) for the ordered tasks, requirement mappings, dependencies, and completion evidence.
Use [Phased MVP development](phased-mvp-development.md) for the six build phases and the active Phase 1 goal.
See the [Phase 1 implementation record](../.codex/plans/build-phase1-comparison-matrix.md) and [catalog/scoring proposal](../.codex/plans/decision-phase1-catalog-and-scoring.md).
Use the [eight-product fact review packet](phase1-vendor-fact-review-2026-09-15.md) for proposed facts, package restrictions, and open source reviews.
See [MVP local operation](mvp-local-operation.md) for startup and existing local evidence.
Manual pilot activities remain historical operating guidance. They do not satisfy the current software completion instruction.

The **Comparison matrix** is the approved primary MVP vendor comparison design as of September 14, 2026.
See the [approved design requirements](PRD.md#approved-mvp-comparison-design).
The application matrix is implemented in part. Real catalog publication and complete customer browser acceptance remain open.

- Former Phase 0 foundations are mostly complete.
- Pulse renders at the site root and remains the selected visual direction.
- The public marketing routes and design gallery exist.
- Existing public commission, affiliation, pricing, performance, and service copy remains unapproved; the R0 quarantine blocks release.
- Authentication, database, analytics, tRPC, and background-job foundations exist.
- Customer, vendor, and internal administration routes now have server-side guard foundations.
- The v2 product baseline now lives in the canonical documents below.
- The approved v2 roadmap maps all 148 requirements to releases and owner roles.
- Product, security, engineering, and operations approvals are recorded for R1.
- R1.1 inventories every current entry point and denies early protected access.
- R1.0 is complete with a 30-minute expiry, MFA-reset-only scope, and phone identity check.
- R1.4 and R1.5 foundations are verified locally, and R1.8 local evidence is recorded.
- R2B now has a shared lead-create command and status contract with redacted responses and idempotency.
- R2B CRM foundation tables now cover customer and vendor profiles, products, contacts, and relationships with local isolation checks.
- R2A lead routing and R2B CRM contact and product commands, scoped search, audited export approvals, review-only duplicate detection, and vendor-evidence commands now have fixed RPCs with local isolation evidence.
- R3 scorecard entry persistence now has a fixed, organization-scoped RPC with optimistic revisions, immutable history, replay protection, and local isolation evidence.
- R3 candidate lifecycle transitions now have a fixed, organization-scoped RPC with optimistic revisions, replay protection, and approval-bound reactivation evidence.
- R3 candidate intake additions now enforce the initial five-candidate cap and reviewed post-intake additions through a fixed RPC.
- R3 candidate identity masking now records masked state and requires an approval reference and reason for unmasking.
- R3 comparison reads now return organization-scoped masked candidates and approved scorecard values without vendor identity fields.
- R3 saved intake persistence now supports bounded draft revisions with immutable change history and replay protection.
- R3 deterministic matching now uses approved rule versions, published vendor facts, bounded explanations, and organization-scoped audited runs.
- R3 matching rules now require an audited approval transition before they can affect active comparisons.
- R3 comparison exports now require organization-scoped request validation and a separate audit decision.
- R3 duplicate product reviews now archive confirmed duplicates while preserving immutable review evidence.
- R3 matching rule previews now return an audited digest and bounded rule count within the organization scope.
- R3 scorecard views now return weighted aggregate scores and organization-scoped individual entries.
- R3 initial evaluations now create a bounded, masked assessment snapshot from submitted intake candidates.
- Customer comparison shows all published options and saves up to five initial choices. The September 30 isolated selection suite passed eight tests.
  Complete hosted acceptance remains open. See [selection evidence](security/r3-customer-selection.md) and the current audit.
- R3 scorecard creation now stores bounded weighted criteria through an audited command.
- R3 requirement metadata updates now store bounded structured or custom requirement details, evidence references, and vendor response links through an audited command.
- R3 workspace views now return the latest organization-scoped snapshot for stage, candidates, tasks, approvals, events, and recent activity.
- R3 workspace comments now support audited, organization-scoped customer or internal comments with replay protection.
- R4 RFP version creation now binds versioned drafts to submitted intake revisions through an audited command.
- R4 RFP approval records the staff decision. Separate staff approval is configurable and is off locally for the two-person team.
- R3 through R9 now have deny-first matching, workflow, finance, operations, reporting, and release-readiness foundations with focused tests.
- Rob Speciale is the temporary operations owner.
- The R0 control record records named owners, decisions, exact public claims, route coverage, evidence fields, and the release block.
- Public claims remain blocked placeholders by product decision.
- The exact statement inventory is complete, but every claim decision, deployment check, and live release verification remains open.
- Production gate activation requires a separate approved deployment.
- All roadmap owner roles now have named people.
- The former v1 execution plan and roadmap remain historical records.

Feature work requires owning-plan approval from every required owner.

## End-to-End Workflow

1. Create a free customer account and an isolated workspace after verified identity, without administration rights.
2. Capture software needs and show all vendor options from approved data in a masked evaluation.
3. Select up to five initial RFP contenders; do not cap displayed options at five.
4. Build the RFP questionnaire and demo plan.
5. Complete mandatory MMHR review and customer clarification, then record provider-name disclosure before RFP submission.
6. Issue approved RFP versions to vendors.
7. Accept structured forms, email, and document responses.
8. Normalize responses with AI assistance and human approval.
9. Compare candidates without a forced shortlist funnel.
10. Coordinate one or more demo rounds.
11. Track proposals, pricing revisions, commitments, and evaluation changes.
12. Record the final vendor selection.
13. Hand direct contract negotiation to the customer and vendor.
14. Track commission earning, invoicing, collection, and resolution.
15. Support onboarding, issues, renewals, and later transactions.

## Product Surfaces

- Public marketing site
- Customer portal
- Vendor portal
- Internal administration and CRM
- Public endpoints and webhooks
- Background jobs and operational integrations

The external portals support MMHR operations. They do not make MMHR a general-purpose SaaS product.

## Core Principles

- Preserve human approval at trust, judgment, relationship, and handoff points.
- Keep vendor evaluation flexible.
- Preserve complete commercial and decision history.
- Enforce every protected action on the server.
- Keep commission values outside recommendation calculations.
- Treat AI output as draft material until the required approval occurs.
- Keep each AI provider and model replaceable behind an internal interface.
- Keep the design gallery unless the owner requests a change.

## Quick Start

Prerequisites:

- Node.js 22, matching the current CI runtime
- npm
- Docker Desktop
- Supabase CLI

Setup:

1. Run `npm ci`.
2. Create `.env.local` from `.env.example`.
3. Add the required local values without committing secrets.
4. Run `supabase start`.
5. Run `npm run dev:local` to use the running local stack.
6. Open `http://localhost:3000`.

Use `supabase status` to inspect the local database services.

## Validation

- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:integration` for database, authentication, RLS, migration, or query changes

CI currently runs installation, type checking, linting, unit tests, and the production build.

## Repository Guide

| Path | Purpose |
|---|---|
| `src/app/` | Marketing, authentication, customer, administration, and API routes |
| `src/server/` | Database access, domain services, and tRPC routers |
| `src/lib/` | Shared clients, analytics, branding, and utilities |
| `src/components/ui/` | Shared shadcn/ui components |
| `src/designs/` | Retained design gallery and Pulse implementation |
| `src/trigger/` | Trigger.dev tasks |
| `drizzle/` | SQL migrations and generated metadata |
| `supabase/` | Local Supabase configuration |
| `docs/` | Product, architecture, research, and historical planning records |
| `.codex/plans/` | Draft and approved implementation plans |

## Documentation Authority

| Document | Authority |
|---|---|
| [`README.md`](./README.md) | Project entry point and current status |
| [`PRD.md`](./PRD.md) | Canonical product requirements and scope |
| [`TECH_STACK.md`](./TECH_STACK.md) | Canonical architecture, stack, and security rules |
| [`outsail-competitive-operating-model.md`](./outsail-competitive-operating-model.md) | Supporting operating-model research |
| [`roadmap-v2-implementation.md`](../.codex/plans/roadmap-v2-implementation.md) | Approved v2 sequencing and traceability |
| [`release-mvp-launch-checklist.md`](../.codex/plans/release-mvp-launch-checklist.md) | Authoritative MVP task sequence, dependencies, completion evidence, and retained later work |
| [`phased-mvp-development.md`](phased-mvp-development.md) | Build phases mapped to the launch checklist; Phase 1 goal prompt for user review |
| [`module-r0-roadmap-and-public-release-control.md`](../.codex/plans/module-r0-roadmap-and-public-release-control.md) | Active release quarantine, owner register, and public-claim inventory |
| [`module-r1-secure-platform-base.md`](../.codex/plans/module-r1-secure-platform-base.md) | Approved R1 plan and active implementation record |
| [`security/r1-authorization-matrix.md`](./security/r1-authorization-matrix.md) | Current entry-point classes, data paths, and denial evidence |

When documents conflict, use `PRD.md` for product behavior and `TECH_STACK.md` for implementation constraints.

## Vendor Research

The [50-provider HRIS and payroll research](hris-payroll-provider-research-2026-09-14.md) lists documented features, payroll options, country limits, and official sources.
It prioritizes US employers and includes global alternatives. This is internal research, not an approved vendor catalog or product ranking.
Use it for catalog approval, comparison data, staff maintenance, and proposed vendor claims under MVP-01, MVP-02, MVP-05, and MVP-08.

## Legacy Documents

The following files are superseded drafts or v1 planning records:

- `PRD-2.md` and `README-2.md`: superseded v2 drafting inputs
- `development-plan.md`, `master-plan.md`, `BUILD_SPEC.md`, and `ROADMAP.md`: legacy v1 planning records

Keep these files for history. Do not use them as current product scope or sequencing authority.

## Branches and Deployment

`develop` is the integration branch. `main` is the production release branch.

A production deployment requires explicit approval.

The active [R0 policy](../.codex/plans/module-r0-roadmap-and-public-release-control.md#2-active-public-release-block) blocks production access and search indexing.

The R0 record is a documentation and control closure only. It does not approve
public claims or activate production access.

The local gate must reach production through a separately approved deployment.
