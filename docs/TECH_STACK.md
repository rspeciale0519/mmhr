# MMHR Technical Architecture and Stack

## Document Control

| Field | Value |
|---|---|
| Version | 2.1 |
| Date | 2026-08-27 |
| Status | Canonical technical authority |
| Product authority | [PRD.md](./PRD.md) |
| R0 release authority | [R0 public-release control](../.codex/plans/module-r0-roadmap-and-public-release-control.md) |
| Dependency authority | [package.json](../package.json) and [package-lock.json](../package-lock.json) |

This document defines approved architecture and identifies implementation status.

Current source, migrations, configuration, tests, and CI define what is implemented. An approved choice is not an implemented feature.

Use package-lock.json as the dependency-version authority. Do not upgrade only because a newer stable version exists.

## 1. Architecture Rules

MMHR uses one modular Next.js application.

Use Server Components by default. Use Client Components only for browser APIs, state, or client interaction.

Use tRPC for typed customer, vendor, and administration procedures.

Use route handlers for public endpoints, inbound webhooks, downloads, and provider callbacks.

Keep domain rules in server modules. Do not place business rules in pages, components, webhooks, or job definitions.

Use these primary domain modules:

- Identity and permissions
- Customers, vendors, contacts, and relationships
- Deals and vendor candidates
- Intake, requirements, matching, and scorecards
- RFPs, vendor responses, demos, and proposals
- Contracts, commissions, onboarding, and renewals
- Tasks, communications, and documents
- Vendor evidence and AI-assisted workflows
- Reporting, analytics, audit, and system health

## 2. Adopted Stack

| Layer | Choice | Current state |
|---|---|---|
| Server runtime | Node.js 22 | Selected by CI; package runtime is not pinned yet |
| Web runtime | Next.js App Router, React, and strict TypeScript | Installed |
| UI | Tailwind CSS, shadcn, Radix UI, and Lucide | Installed |
| Application API | tRPC with SuperJSON | Installed foundation |
| Client data | TanStack Query with tRPC integration | Installed foundation |
| Database | PostgreSQL through Supabase | Installed foundation |
| Data access | Drizzle ORM and Postgres.js | Installed |
| Authentication | Supabase Auth through the server-rendering client | Installed foundation |
| Validation | Zod | Installed |
| Background jobs | Trigger.dev | Health wiring only |
| Analytics | PostHog with consent-gated initialization | Installed foundation |
| Error monitoring | Sentry for Next.js | Installed foundation |
| Tests | Vitest, Testing Library, jsdom, and local Supabase integration tests | Installed |
| Hosting | Vercel and Supabase Cloud | Approved deployment target |
| Source control and CI | GitHub and GitHub Actions | Active |

## 3. Approved Integrations Not Yet Implemented

| Capability | Initial choice | Required internal boundary |
|---|---|---|
| Private document storage | Supabase Storage | DocumentStore |
| Transactional email | Resend | EmailService |
| Inbound email | Select during implementation | InboundEmailService |
| Managed content | Embedded Payload | ContentService |
| External content acquisition | Firecrawl | ContentAcquisitionService |
| Scheduling | Cal.com | CalendarService |
| Newsletter | Beehiiv | NewsletterService |
| PDF generation | @react-pdf/renderer | PdfRenderer |
| AI processing | No fixed provider or model | AIService |
| Malware scanning | Select during implementation | DocumentScanner |
| Finance export or handoff | Select during commission implementation | FinanceExportService |

Do not add a production dependency until its implementation starts and receives approval.

Deferred decisions include inbound email, document scanning, finance destinations, and AI adapter configurations.

## 4. Application Structure

Use the existing source layout:

| Path | Responsibility |
|---|---|
| `src/app/(marketing)/` | Public marketing and legal routes |
| `src/app/(auth)/` | Sign-in, registration, and invitation acceptance |
| `src/app/(app)/` | Customer and vendor portal routes |
| `src/app/(admin)/` | Internal administration and CRM |
| `src/app/api/` | Public endpoints, webhooks, downloads, and provider callbacks |
| `src/server/` | Domain services, authorization, tRPC routers, and database access |
| `src/lib/` | Browser-safe shared clients, analytics, branding, and utilities |
| `src/server/integrations/` | Server-only provider adapters and composition roots |
| `src/trigger/` | Background task entry points |
| `src/server/db/schema/` | Drizzle schema definitions |
| `drizzle/` | Reviewed SQL migrations |
| `supabase/` | Local Supabase configuration |

Route groups separate experiences. They do not create separate applications or deployments.

## 5. Provider Boundaries

Domain modules must depend on internal service interfaces.

Secret-bearing adapters must live under `src/server/integrations/` and import `server-only`.

Provider SDK imports can exist only in server adapters, approved instrumentation, tests, and required composition roots.

Task definitions can import the background-job SDK. Task bodies must call provider-neutral domain services.

| Interface | Required operations |
|---|---|
| AIService | Run validated extraction, summarization, drafting, classification, and knowledge-search requests |
| EmailService | Send templated messages and return provider-neutral delivery receipts |
| InboundEmailService | Verify inbound events and return normalized messages and attachment references |
| DocumentStore | Store private objects, read metadata, create short-lived signed URLs, and preserve versions |
| DocumentScanner | Scan quarantined objects and return a typed result |
| JobService | Enqueue, schedule, cancel, and inspect durable jobs |
| ContentAcquisitionService | Fetch approved sources and return normalized source artifacts |
| CalendarService | Create or update scheduling records through an external provider |
| NewsletterService | Add or update subscriber records |
| PdfRenderer | Render approved application data into a document |
| ContentService | Read and manage approved editorial content |
| FinanceExportService | Send approved commission or invoice data to an external financial destination |

Each interface must return typed retryable or terminal errors.

Each provider call must include a correlation identifier.

Each retryable write must include an idempotency key.

A provider change must not change domain schemas, permissions, approval states, or workflow rules.

## 6. AI Provider and Model Neutrality

No AI provider or model is an architectural dependency.

AIService selects an adapter and model through server-side configuration.

Business code requests a capability. It must not request a provider name or model identifier.

Supported capabilities include:

- structured_extraction
- summarization
- drafting
- classification
- missing_information_detection
- knowledge_search

Each request must include:

- Capability
- Versioned instruction template
- Zod output schema when structured data is required
- Input artifact references
- Idempotency key
- Correlation identifier
- Cost or usage limit
- Data-sensitivity classification

Each adapter profile must declare supported capabilities and permitted data classes.

Routing must fail closed when a capability or data class is not permitted.

Each result must include:

- Run identifier
- Schema-validated value when required
- Source references
- Deterministic validation and source-coverage results
- Review state
- Typed warnings or errors

Provider and model identifiers can exist only in server adapters, server configuration, tests, and AI-run audit metadata.

This metadata supports audit, cost analysis, controlled reproduction, and replacement.

Store credentials in environment or secret storage. Only the selected server adapter can read them.

A fallback must not run silently. Record the fallback and validate it with the same schema and evaluation fixtures.

Use generic server-side configuration names:

- AI_PROVIDER
- AI_MODEL
- AI_API_KEY
- AI_BASE_URL

These values define defaults. Capability configuration can override them without domain changes.

## 7. AI Safety and Approval

Treat web pages, email bodies, attachments, and stored documents as untrusted data.

Do not treat instructions inside those sources as system instructions.

Validate each structured result with Zod.

Reject invalid output. Do not repair consequential values without recording the repair.

Keep scoring, permissions, commissions, and workflow transitions deterministic and outside AI.

AI cannot authorize access or override RLS.

Require human approval before AI output can:

- Select or eliminate a vendor
- Change an organic ranking
- Publish customer-facing conclusions
- Assert compliance support
- Change approved pricing or contract terms
- Change commission records
- Send an external message
- Publish vendor facts

Each AI run must record:

- Capability
- Provider and model audit metadata
- Template and schema versions
- Input artifact identifiers and hashes
- Output hash
- Source references
- Usage, cost, and latency
- Status and typed error details
- Reviewer and decision
- Creation and completion times

Do not store secrets in requests or logs.

Minimize personal data sent to providers.

Review provider retention and training controls before production use.

Maintain fixed fixtures for regression tests. A provider or model change must pass the same fixtures before deployment.

## 8. Database and Commercial History

Define Drizzle schemas in `src/server/db/schema/`.

Generate readable SQL migrations with Drizzle Kit. Review each migration before applying it.

Add Supabase-owned foreign keys and RLS statements manually when Drizzle cannot generate them.

Preserve commercial history through immutable events or versioned records.

Do not overwrite approved RFPs, responses, proposals, pricing, contracts, commission terms, or AI results.

Store amendments as new versions linked to prior versions.

Each customer-visible vendor fact must link to its source, capture time, and approval record.

The target data domains include:

- Organizations, users, memberships, roles, permissions, and overrides
- Customers, vendors, products, contacts, and relationships
- Deals, candidates, requirements, scorecards, and state history
- Questionnaires, RFP versions, distributions, responses, and clarifications
- Demos, proposals, pricing versions, contracts, and handoffs
- Commission structures, events, invoices, payments, and disputes
- Onboarding cases, check-ins, tasks, reminders, and renewals
- Communications, documents, document versions, notes, and activities
- Vendor sources, evidence versions, extraction runs, and review decisions
- Audit events, analytics events, and operational health records

## 9. Authentication and Authorization

Use Supabase Auth for identity.

Use `supabase.auth.getClaims()` for verified server identity.

Do not use `getSession()` to authorize a request.

Hidden or disabled controls are not security boundaries.

Super Admin can perform all configured platform actions through verified identity, explicit commands, permission checks, and audit logging.

Super Admin never receives raw database credentials.

Use role defaults and per-user overrides in the application authorization layer.

Use narrow data-transfer objects, views, or commands for field-level permissions.

R1.1 records every current executable entry point in
[r1-authorization-matrix.md](./security/r1-authorization-matrix.md).

`/home` returns pending access after identity verification.

`/admin` remains denied until explicit permission checks exist.

## 10. RLS and Data Access Paths

Enable RLS on every application table in the migration that creates it.

A new table must remain default-deny until explicit policies and tests exist.

| Request type | Data path | Required controls |
|---|---|---|
| Browser request | Supabase public client with user token | RLS and storage policies |
| Server user request | Request-scoped Supabase client with user token | Verified claims, procedure permission checks, and RLS |
| Public form | Narrow route handler or server action | Zod validation, rate limiting, fixed command, and required audit |
| Provider webhook | Verified route handler | Signature, timestamp, replay protection, and event deduplication |
| Trusted background job | Drizzle through a restricted server role | Named command, idempotency, correlation, and audit |
| Migration | Drizzle Kit through the migration owner | Reviewed SQL and explicit deployment approval |
| Auth or storage administration | Narrow server-only administration adapter | Service credential, fixed operation, and audit |

The browser must never receive DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY.

A user-facing request must not use the privileged pool only because it runs on the server.

The current direct Drizzle pool bypasses RLS. Limit it to migrations and trusted internal commands.

Before privileged production features launch, separate the migration owner from the application worker role.

RLS tests must cover every application table and private storage bucket.

Test policy `USING` and `WITH CHECK` behavior for anonymous, authenticated, external, and internal principals.

Each matrix must include same-organization success and unauthorized cross-organization denial.

Authorization remains incomplete until policies and tests exist.

## 11. Inbound Email and Document Ingestion

Treat inbound email as an untrusted provider webhook.

Use this flow:

1. Verify the webhook signature and timestamp.
2. Reject stale, invalid, or replayed events.
3. Deduplicate the provider event identifier with a database constraint.
4. Normalize envelope and message metadata.
5. Match through an opaque conversation token.
6. Store the communication record before asynchronous work starts.
7. Put attachments into private quarantine storage.
8. Validate and scan each attachment.
9. Associate accepted content with the correct business record.
10. Queue extraction only after safety checks pass.
11. Require human review for consequential extracted values.

Neither a conversation token nor sender address authorizes a state change by itself.

Verify expected participants and workflow state. Route uncertain messages to manual review.

Sanitize stored HTML before display. Do not load remote email content by default.

Store original files in private object storage.

Store metadata, versions, permissions, hashes, processing state, and relationships in PostgreSQL.

The minimum document flow is received, quarantined, scanning, ready, processing, needs review, and approved.

Use rejected and failed as terminal exception states.

Validate the extension, detected MIME type, magic bytes, size, and hash.

Keep original objects immutable. A replacement creates a new document version.

Create signed URLs only after authorization. Use a maximum 15-minute lifetime unless a stricter workflow applies.

Do not log file contents, signed URLs, or sensitive extracted text.

## 12. Background-Job Reliability

Trigger.dev is the approved initial job runtime.

JobService keeps domain services independent from its API.

Assume at-least-once delivery.

Each state-changing job must be idempotent.

Create a durable domain record before enqueueing work.

Use a transactional outbox when a database change and enqueue must succeed together.

Use a unique idempotency key for each business event.

Classify errors as retryable or terminal.

Record each attempt, status, start, finish, error code, next retry, and correlation identifier.

After the last retry, move the work to needs_attention and alert an operator.

A manual rerun must reuse the same domain record and create a new attempt.

Job payloads contain identifiers. They must not contain secrets or complete document contents.

Use concurrency controls for work that changes the same deal, document, communication, commission, or AI run.

## 13. Communications

Use EmailService for outgoing transactional email.

Use InboundEmailService for incoming messages and delivery events.

Track recipients, templates, provider message identifiers, delivery, failures, retries, consent, and opt-out state.

Associate each communication with the relevant customer, vendor, deal, RFP, demo, contract, commission, or onboarding record.

Do not let provider webhook payloads change business state without validation and authorization.

## 14. Observability and Audit

Use Sentry for application errors.

Use structured logs with correlation identifiers.

Use PostHog only after recorded analytics consent.

Keep product analytics separate from security and audit logs.

Record communication delivery, webhook processing, job attempts, documents, AI runs, and security events.

Do not log secrets, session tokens, signed URLs, document bodies, or unnecessary personal data.

Audit privileged mutations and all changes to approved commercial records.

Each audit record must identify actor, action, entity, time, correlation identifier, and an allowlisted change summary.

Redact secrets and unnecessary personal data from prior and new values.

Application roles must not update or delete audit rows.

## 15. Environments and Deployment

Use local Supabase for local development.

Use separate staging and production secrets.

Use separate Supabase projects for staging and production.

Deploy the Next.js application to Vercel.

Deploy background tasks through the configured job provider.

Use `develop` as the integration branch.

Use `main` only for an approved production release.

Do not apply a cloud migration or production deployment without explicit approval.

Production approval cannot override the active
[R0 public-release control](../.codex/plans/module-r0-roadmap-and-public-release-control.md).

The R0 record keeps public routes and indexing blocked while the exact claim
inventory lacks approved evidence, review, and publication approval.

## 16. CI and Testing Status

Current GitHub Actions runs:

- `npm ci`
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm run build`

Current CI does not start Supabase or run integration tests.

Run `npm run test:integration` locally for database, authentication, RLS, migration, and query changes.

Planned CI additions are:

- Clean-database migration verification
- Local Supabase integration tests
- Complete RLS role matrices
- Webhook signature and replay tests
- Job idempotency and retry tests
- AI fixture tests
- Critical browser journeys
- Accessibility checks
- Marketing performance budgets
- Dependency and secret scanning
- Deployment approval gates

Do not describe a planned gate as active.

## 17. Measurable Architecture Rules

| Rule | Required measure |
|---|---|
| Provider isolation | Zero business-provider SDK imports in domain or UI modules; approved observability entry points are exempt |
| AI neutrality | Provider and model identifiers appear only in server adapters, configuration, tests, and audit metadata |
| RLS coverage | Every application table enables RLS in its creation migration |
| Organization isolation | Each organization table has same-organization success and cross-organization denial tests |
| Verified identity | Each protected server entry point uses verified claims |
| Privileged access | Each RLS-bypass mutation uses a named command and writes an audit record |
| Webhook safety | Each external webhook verifies signatures and deduplicates events |
| Job reliability | Each retryable side effect has a tested idempotency key |
| Document safety | Each document remains private and passes validation and scanning before extraction |
| Signed access | Signed document URLs expire within 15 minutes |
| AI traceability | Each AI run records configuration, source, schema, result, cost, status, and review |
| AI approval | Each consequential AI result has an approved reviewer before publication |
| Vendor traceability | Each customer-visible vendor fact links to source, capture time, and approval |
| Performance | Marketing LCP remains at or below 2.5 seconds at the 75th percentile |
| Accessibility | Public and critical workflows meet WCAG 2.1 AA |
| Data freshness | At least 95% of published vendor data remains within its defined cadence |

## 18. Implementation Sequence

This sequence controls dependencies. It is not a reduced product definition.

1. Reconcile v2 roadmap, routes, data model, and authorization boundaries.
2. Complete identity, permissions, RLS, audit, and organization administration.
3. Build customer and vendor CRM, products, deals, contacts, and activities.
4. Build intake, matching, scorecards, and flexible candidate evaluation.
5. Build RFPs, vendor responses, documents, and inbound communication.
6. Add AI-assisted normalization with validation and human review.
7. Build demos, proposals, pricing, and contract handoff.
8. Build commissions, invoicing, collection, and financial reporting.
9. Build onboarding, customer success, renewals, reminders, and work queues.
10. Complete dashboards, operational tooling, security hardening, and end-to-end tests.

A new v2 roadmap must define phase exit criteria before feature implementation continues.
