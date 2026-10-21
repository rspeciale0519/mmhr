# R2B CRM and Workflow Substrate Module Plan

## Document Control

| Field | Value |
|---|---|
| Version | 0.2 |
| Date | 2026-08-31 |
| Status | Core CRM, deal, renewal, and vendor-evidence schema implemented locally; commands, integration, and release checks remain open |
| Parent roadmap | [roadmap-v2-implementation.md](./roadmap-v2-implementation.md) |
| Product authority | [docs/PRD.md](../../docs/PRD.md) |
| Architecture authority | [docs/TECH_STACK.md](../../docs/TECH_STACK.md) |
| R1 security authority | [module-r1-secure-platform-base.md](./module-r1-secure-platform-base.md) |
| Current baseline | `develop` after R1 secure-platform controls |
| Owners | Product, operations, data, engineering, and security |

This plan defines the R2B implementation boundary. It does not approve cloud
migrations, production writes, new paid services, or product decisions outside
R2B.

Implementation starts only after the required owners approve this plan and the
shared lead-to-CRM contract. The plan must be amended when code or evidence
changes its scope.

### Current implementation record

The additive R2B foundation now contains organization-scoped customer and
vendor profiles, vendor-owned products, contacts, typed relationships, deals,
renewals, and vendor-evidence records.
Every table has explicit status checks, revision and correlation fields,
organization foreign keys, RLS, and deny policies. Local static migration
reviews cover table boundaries, history-ready fields, invalid states, scoped
deal and vendor-evidence links, and cross-organization denial posture. No
request command, cloud migration, or production write is included in this
increment.

## 1. Outcome

Build the first durable CRM and workflow substrate for customer, vendor, and
internal operations. Preserve existing organization and lead identifiers while
adding additive domain records, explicit state history, narrow commands, and
audited access.

Publish one shared lead-create command and status contract for R2A. R2A must
use this contract instead of writing CRM tables directly.

R2B does not implement intake, matching, RFPs, documents, AI, commissions, or
customer and vendor portal completion. Later releases extend these records
through new approved plans.

## 2. Requirement Targets

| Requirement | R2B target |
|---|---|
| FR-CRM-01 | Customer organization, contact, role, stakeholder, software, purchase, contract, renewal, and related-deal records |
| FR-CRM-02 | Vendor organization, product, contact, relationship, response, deal, payment-term, and performance foundations |
| FR-CRM-03 | Relationship roles, influence, preferences, interaction history, and ownership |
| FR-CRM-04 | Deal records with customer, product, owner, stage, candidate references, and future workflow links |
| FR-CRM-05 | Immutable notes, activities, tasks, approvals, changes, and state transitions |
| FR-CRM-06 | Authorized search and filtering with field-level response limits |
| FR-CRM-07 | Explicit permission and audit for sensitive exports |
| FR-CRM-08 | Duplicate candidates and review decisions without automatic merge |
| FR-CRM-09 | Renewal and replacement windows with owners, reminders, and linked follow-on deals |
| FR-VND-01 | Permitted vendor-source registry with owner, method, cadence, licensing, and review data |
| FR-VND-05 | Approval state for vendor facts before customer use |
| FR-VND-06 | Immutable source, fact, evidence, capture, reviewer, and publication versions |
| FR-VND-07 | Freshness and confidence data for vendor facts |
| FR-VND-08 | Audited manual overrides with source, reason, author, and review date |
| FR-WRK-01 | R2B task, reminder, ownership, and state-history foundation |
| NFR-DATA-01 | Versioned evidence and capture time for every future customer-visible vendor fact |
| NFR-DATA-02 | Freshness fields and review paths support the required freshness measure |
| NFR-AUTH-01 | Every protected R2B command uses server-side authorization |
| NFR-ISO-01 | Organization and deal scope deny cross-organization access by default |
| NFR-AUD-01 | Sensitive mutations, approvals, exports, and state changes have immutable audit records |

FR-MKT-10 is a shared dependency, not a separate R2B user interface. R2B
must publish the lead command before R2A wires public registration or contact
flows.

## 3. Data Model Targets

Use an additive migration. Keep the current `orgs`, `identities`, `org_members`,
`leads`, audit, and permission records compatible during rollout. Enable RLS on
every new application table and leave each table default-deny until policies
and tests exist.

### Core CRM records

- `customer_profiles`: one customer organization profile with business context,
  current software, purchase history, contract dates, renewal window, and audit
  timestamps.
- `vendor_profiles`: one vendor organization profile with operating status and
  approved commercial metadata.
- `products`: vendor-owned products with lifecycle status and stable ownership.
- `contacts`: organization contacts with normalized work contact data and
  explicit contact status.
- `relationships`: typed organization or contact relationships with owner,
  influence, preference, and history fields.
- `deals`: customer purchase efforts with owner, stage, status, and links to
  customer, products, and later candidate records.

### Workflow and history

- `activities`: append-only notes, communications references, approvals, and
  state changes linked to a permitted CRM entity.
- `tasks`: assigned work with due time, status, priority, and source entity.
- `task_history`: immutable task state transitions and reassignment records.
- `deal_stage_history`: immutable deal stage changes with actor, reason, and
  correlation data.
- `renewals`: effective renewal or replacement windows linked to a deal,
  customer, owner, and optional follow-on deal.

### Vendor evidence

- `vendor_sources`: permitted source registry and review cadence.
- `vendor_facts`: typed facts with current approval and freshness status.
- `vendor_evidence_versions`: immutable source references, captured values,
  capture time, confidence, and version links.
- `vendor_fact_reviews`: approval, rejection, expiration, and reviewer history.
- `vendor_fact_overrides`: source-backed manual overrides with reason, author,
  effective period, and review date.

### Lead contract support

Extend the existing `leads` record only through a reviewed migration. Preserve
its identifier and existing required fields. Add only fields needed by the
shared contract, such as normalized source, routing owner, follow-up status,
organization link when known, and command correlation data.

The command must accept a strict server-side DTO containing full name, company,
work email, direct company phone, source, consent timestamp, and idempotency
key. It must return a stable result containing the existing lead ID, status,
owner or an explicit unassigned state, and a redacted outcome code. It must
reject missing consent, invalid work email policy, malformed phone data,
duplicate idempotency keys with conflicting data, and unsupported fields.

The command must be safe for both public lead capture and future authenticated
flows. Public callers use a narrow server action or route handler. Internal
callers use an explicit permission-protected command. Neither caller writes
the tables directly.

## 4. Access and Command Boundaries

Follow [docs/TECH_STACK.md](../../docs/TECH_STACK.md) section 10 and the R1
authorization matrix.

- Use request-scoped Supabase clients for user-authorized reads and writes.
- Verify identity with `supabase.auth.getClaims()` before authorization.
- Use tRPC for authenticated CRM procedures and a narrow route or server action
  for the public lead command.
- Add domain permission keys through the R1 permission registry and role rules.
- Require active organization membership and the correct customer or vendor
  portal grant for organization-scoped records.
- Require an active deal grant for deal-scoped records.
- Keep internal cross-organization access explicit, narrow, and audited.
- Return DTOs that omit private contact fields, commercial terms, and source
  details unless the caller has the matching field permission.
- Do not use hidden controls, client checks, direct pool reads, or raw database
  credentials as an authorization boundary.

Commands must classify invalid input, denied access, conflict, retryable
failure, and terminal failure separately. State changes must use optimistic or
database concurrency checks and must preserve the prior state.

## 5. Audit and Observability

Audit every create, update, state transition, assignment, approval, export,
duplicate-review decision, vendor override, and renewal-link change.

Each event must contain actor, action, entity type, entity ID, timestamp,
correlation ID, idempotency key when present, and an allowlisted redacted
change summary. Never log full contact details, secrets, document contents,
tokens, or raw provider payloads.

Use structured application errors and Sentry for unexpected failures. Define
analytics event names and safe dimensions separately from security audit data.
Do not include names, emails, phone numbers, organization free text, or source
documents in analytics payloads.

## 6. Validation Plan

Run the smallest relevant checks first. Then run the complete required gates.

### Unit and contract tests

- Strict DTO validation, normalization, consent, idempotency, and conflict
  behavior for the lead command.
- Customer, vendor, product, contact, relationship, deal, task, renewal, and
  vendor-evidence state transitions.
- Immutable history and no-destructive-overwrite tests.
- Search filtering, field permission, export permission, and redaction tests.
- Duplicate detection produces review candidates and never merges records.
- Vendor evidence approval, expiration, freshness, and override tests.
- Same-organization success and cross-organization denial tests.
- Role, portal, deal-grant, and delegated-permission ceiling tests.
- Audit records, correlation, idempotency, and failure classification tests.

### Integration and migration tests

- Apply the migration to an empty database and a populated R1 database.
- Verify all new tables have RLS enabled and default-deny behavior.
- Verify legacy organization and lead identifiers remain readable.
- Verify concurrent lead submission creates one logical lead per idempotency key.
- Verify concurrent state changes reject stale writers without losing history.
- Verify audit failure rolls back each sensitive mutation.
- Verify migration recovery by disabling new writes and preserving old reads.
- Verify export denial and redaction through the real request path.

### Application and browser tests

- Add authenticated internal CRM routes only after command tests pass.
- Verify customer, vendor, product, deal, and task loading, empty, error, and
  success states.
- Verify keyboard access and semantic status messages for each new workflow.
- Verify public lead contract tests separately before R2A enables the form.

Required commands after implementation:

```text
npm run type-check
npm run lint
npm test
npm run test:integration
npm run build
```

Review generated SQL, `git diff --check`, final file scope, and all migration
forward and recovery paths before merge.

## 7. Recovery and Rollback

- Release additive tables and nullable compatibility fields first.
- Keep legacy lead and organization reads available during rollout.
- Disable CRM writes, exports, vendor overrides, or lead routing independently.
- Preserve all captured leads, consent records, activities, and approvals.
- Use compensating events for corrections. Do not delete approved history.
- Rebuild derived search, duplicate, freshness, and report projections from
  immutable source records.
- Use a forward migration when rollback would remove data or break readers.
- Keep the R2A public form disabled until the lead command and integration
  evidence pass.

The recovery owner must record the disabled capability, affected records,
operator, time, and re-enable evidence.

## 8. Delivery Sequence

1. Approve this plan and the shared lead-to-CRM contract.
2. Define permission keys, RLS scope, state machines, and audit event shapes.
3. Add additive schemas and reviewed SQL with a recovery rehearsal.
4. Implement the lead command and status contract first.
5. Implement CRM records, history, tasks, renewals, and vendor evidence.
6. Add authenticated commands, search, duplicate review, and controlled export.
7. Add integration and browser evidence for all protected surfaces.
8. Publish the contract for R2A and update the roadmap evidence register.

R2A may start its content and metadata work in parallel after plan approval,
but it must not enable lead capture until step 4 passes.

## 9. Risks and Decisions

| Risk or decision | Control or required action |
|---|---|
| Existing `leads` data may not meet the new contract | Preserve IDs, add compatible fields, and run populated migration tests |
| Public lead capture can create spam or duplicate records | Validate strictly, rate-limit at the public boundary, and require idempotency |
| CRM data can cross organization boundaries | Default-deny RLS, server permission checks, and isolation matrices |
| Search or exports can reveal private fields | Use fixed DTOs, field permissions, redaction, and export audit records |
| Vendor facts can become stale or unsupported | Store source, capture time, confidence, approval, expiration, and override history |
| Duplicate detection can destroy history | Produce review candidates only; never merge automatically |
| Deal grants affect later R3 through R9 resources | Add foreign keys and audited revocation now; require descendants to inherit scope |
| Reports can drift from source history | Define source-of-truth events before adding projections |
| Product data fields are incomplete | Use additive nullable fields and record later schema decisions in the owning plan |

No AI provider, email provider, newsletter provider, search provider, or paid
CRM dependency is selected by this plan.

## 10. Approval Record

| Approval | Status | Record |
|---|---|---|
| Product owner | Pending | Required before implementation |
| Operations owner | Pending | Required before workflow implementation |
| Data owner | Pending | Required before vendor-evidence implementation |
| Engineering owner | Pending | Required before migration implementation |
| Security owner | Pending | Required before protected writes or exports |
| Shared lead-to-CRM contract | Pending | Required before R2A lead capture |
