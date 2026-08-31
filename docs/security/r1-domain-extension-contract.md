# R1 Domain Extension Contract

## Status and scope

This document defines the security contract for domain work after R1.

The contract is approved by the R1 plan. It is a guard and test contract, not a claim that later domain features exist.

R1 currently provides customer and vendor portal entry guards. No CRM, deal, document, commission, workflow, or other later-domain resource is created by this document.

If a later release cannot meet this contract, keep its routes, commands, and writes disabled.

## Authority

| Area | Authority |
|---|---|
| R1 requirements and release order | [`module-r1-secure-platform-base.md`](../../.codex/plans/module-r1-secure-platform-base.md) |
| Current entry-point inventory | [`r1-authorization-matrix.md`](./r1-authorization-matrix.md) and `src/server/auth/entry-point-inventory.ts` |
| Permission evaluation | [`r1-permission-evaluation.md`](./r1-permission-evaluation.md), `src/server/auth/authorization.ts`, and `src/server/auth/permission-registry.ts` |
| Page and layout guards | `src/server/auth/page-guards.ts` |
| Current guard tests | `src/server/auth/page-guards.test.ts`, `src/app/(app)/customer/layout.test.tsx`, and `src/app/(app)/vendor/layout.test.tsx` |

## Current portal guard contract

The customer and vendor layouts are the first server authorization boundary for their route trees.

| Route tree | Required permission | Organization rule |
|---|---|---|
| `/customer` | `portal.customer.access` | The selected organization must be an active customer organization with an active customer portal grant. |
| `/vendor` | `portal.vendor.access` | The selected organization must be an active vendor organization with an active vendor portal grant. |

Each request must follow this order:

1. Verify the identity through the existing claims-based identity guard.
2. Read and validate the selected organization context on the server.
3. Reject a missing, malformed, or nil organization identifier.
4. Evaluate the declared portal permission against that organization through the caller-bound authorization service.
5. Render children only after the decision confirms the same verified identity and organization scope.

The organization cookie is context only. It never grants access by itself.

The database decision must enforce active identity, active membership, organization state, matching organization type, workspace access, portal permission, and active portal grant.

Customer access must not authorize vendor access. Vendor access must not authorize customer access.

Portal revocation must deny the next request without waiting for a JWT refresh.

Denied portal access must use the generic forbidden boundary and must not reveal records or resource existence.

The current portal pages are shells only. They do not claim that later domain resources exist.

## Rules for every new domain entry point

Every future page, layout, Server Action, Route Handler, tRPC procedure, export, download, webhook, and background command must be listed in the entry-point inventory before release.

Every protected entry point must declare:

- The required identity state and authentication assurance.
- The permission key and action, when applicable.
- The organization or platform scope.
- The resource ownership or participant rule.
- The safe response for missing, denied, revoked, or inaccessible data.
- The audit event and correlation data for each mutation.

Use the existing server authorization service and selected-organization validation.

Do not use middleware, hidden controls, route names, organization cookies, client state, or JWT claims as the only authorization boundary.

Resource lookups must apply authorization in the database query or fixed command before returning data.

An inaccessible identifier must return the generic not-found response when the route contract requires resource-existence hiding.

## Organization and resource isolation

Every organization-owned table must store a stable organization reference and have an explicit isolation policy.

Every organization-owned record must be checked against the caller's active organization scope.

Every cross-organization read, write, export, download, and background operation must fail closed.

Internal users still need an explicit scoped organization grant for organization data.

A platform permission does not silently authorize an organization resource.

Customer and vendor resource rules must remain separate even when they share implementation code.

Do not use a broad internal role as a substitute for a declared resource permission.

## RLS and data access

Each new application table must enable RLS in its creation migration.

Each table must remain default-deny until its reviewed policies and tests exist.

Policies must cover anonymous, authenticated, external, internal, suspended, archived, and revoked states when relevant.

Policies must prove same-organization success and cross-organization denial.

User-facing requests must use a request-scoped Supabase client with the verified user token.

User-facing requests must not use the direct owner pool or a service credential to bypass RLS.

Trusted commands may use the restricted path only for a named operation with explicit grants, input validation, and audit coupling.

Migration-owner access, worker access, and Auth or Storage administration access must remain separate.

RLS tests must cover both `USING` and `WITH CHECK` behavior for each new table.

## Mutation, history, and audit

Every privileged mutation must use a named command with a fixed permission and scope.

The command and its audit event must commit in one transaction.

Each audit event must identify the actor, action, entity, time, correlation identifier, and redacted change summary.

Audit rows must be append-only and must reject secrets, tokens, phone numbers, call content, and unnecessary personal data.

Approved commercial and security records must be immutable or versioned.

State changes must use an allowed transition and preserve prior history.

Recovery must use a compensating event or reviewed forward change. It must not delete evidence or rewrite approved history.

## Reusable test contract

R1.7 test helpers must let each domain module repeat the same checks without weakening them.

The helpers must cover:

- Verified identity and required assurance.
- Active organization and membership state.
- Matching customer or vendor portal scope.
- Same-organization allow and cross-organization denial.
- Missing, malformed, revoked, suspended, and archived context.
- Field allowlists and redacted responses.
- RLS `USING` and `WITH CHECK` behavior.
- Mutation audit coupling and rollback when audit writing fails.
- Revocation taking effect without a token refresh.
- Generic denial responses that do not reveal resource existence.

Each module must add its own action, resource, state-transition, and history cases.

Fixtures must contain only resources implemented by that module.

No fixture may imply that a missing domain table, route, claim, workflow, provider, or permission already exists.

## Release-specific hooks

Each later release must apply the following hooks before it enables a new route or write path.

### R2B: CRM and workflow substrate

Scope customers, vendors, products, contacts, relationships, deals, activities, tasks, and state history to the correct organization.

Keep activity and commercial history immutable.

Protect search, duplicate review, exports, vendor evidence, and renewals with field and action permissions.

Audit controlled exports and never merge duplicates automatically.

### R3: Intake, matching, and evaluation

Keep candidates separate from deals and keep scoring deterministic.

Apply customer organization scope to intake, candidate, scorecard, comparison, and export records.

Keep commission data outside eligibility and scoring.

Require separate permission and recorded approval for identity unmasking.

Redact comparison exports and prove that scoring or AI data cannot change authorization.

### R4: RFP, communications, documents, and jobs

Verify participants, workflow state, webhook signatures, timestamps, replay state, and provider-event uniqueness.

Keep messages and files private, immutable, and linked to the correct organization.

Quarantine and scan attachments before processing.

Authorize signed URLs and keep their lifetime within the approved maximum of 15 minutes.

Use durable identifiers, idempotency keys, retry classification, and needs-attention handling for jobs.

### R5: Provider-neutral AI assistance

Keep AI behind `AIService` and server-only adapters.

Business code must request a capability, not a provider or model.

AI output must pass schema, source, data-class, provenance, and review checks.

AI must not grant access, change RLS, select permissions, change scores, or publish consequential output without human approval.

Treat web pages, email, attachments, and stored documents as untrusted data.

### R6: Demos, proposals, and contract handoff

Keep demo, proposal, pricing, selection, and handoff records within the customer organization scope.

Expose only approved proposal data and linked sources.

Preserve signed, unsigned, stalled, cancelled, and superseded history.

Complete the customer isolation matrix for every customer resource before release.

Keep legal negotiation between the customer and vendor.

### R7: Commissions and financial closure

Keep commission structures, events, calculations, invoices, payments, disputes, and adjustments within internal financial scope.

Vendor portal access must not reveal commission data or private financial records.

Use idempotent commission events and immutable source agreements.

Require permission, approval, audit, and reconciliation for financial closure and exports.

Complete the vendor isolation and commission-denial matrix before release.

### R8: Customer success and operational control

Scope onboarding, renewals, work queues, reminders, reports, approval queues, and audit views to their declared organization or platform scope.

Protect reassignment, configuration, approval, and audit actions with explicit permissions and assurance checks.

Build reports from immutable source events.

Keep sensitive analytics properties out of consented product analytics.

### R9: Release hardening

Repeat the complete customer and vendor isolation matrices across every current route, table, procedure, command, export, and job.

Verify backup, restore, recovery-point, recovery-time, retention, deletion, monitoring, and alerting controls.

Run clean-browser checks for allowed, denied, revoked, expired, empty, loading, and error states.

Do not release while any route, table, permission, policy, audit path, or provider boundary remains unverified.

## R1.7 exit gate and recovery

R1.7 is complete only when customer and vendor route tests prove mutual denial, scoped internal access, and immediate revocation behavior.

The entry-point inventory must classify every current portal entry point.

The test suite must contain no fixture or interface for a missing later-domain resource.

If a domain extension fails its contract, leave its routes and writes disabled.

Preserve existing portal grants, revocations, audit events, and RLS during rollback.

Apply a reviewed forward correction after local migration, integration, and security tests pass.

Never disable RLS or replace a failed guard with a broad role.
