# R1 Secure Platform Base Module Plan

## Document Control

| Field | Value |
|---|---|
| Version | 0.7 R1.1 validated |
| Date | 2026-08-27 |
| Status | R1.1 complete and validated; R1.0 recovery roster open |
| Parent roadmap | [roadmap-v2-implementation.md](./roadmap-v2-implementation.md) |
| R0 control record | [module-r0-roadmap-and-public-release-control.md](./module-r0-roadmap-and-public-release-control.md) |
| Product authority | [docs/PRD.md](../../docs/PRD.md) |
| Architecture authority | [docs/TECH_STACK.md](../../docs/TECH_STACK.md) |
| Baseline branch | develop |
| Required owners | Product, security, engineering, and operations |

The user authorized R1 implementation, branches, commits, pushes, pull requests, and integration into `develop` on 2026-08-27.

That authorization remains active until the user revokes it.

It does not authorize production dependencies, invitation delivery, cloud migrations, bootstrap actions, `main`, or deployments.

## 1. Outcome

Build a fail-closed identity, permission, organization-isolation, and audit foundation for every current protected surface.

R1 must secure current routes, tables, procedures, actions, and privileged commands.

Later releases must extend the same controls when they add domain resources.

R1 must not create fake deal, portal, document, commission, or workflow tables.

FR-IAM-08 remains Deferred. R1 must not add impersonation code, routes, commands, or configuration.

R0 records its decision ownership, claim inventory, and public-release block in
[module-r0-roadmap-and-public-release-control.md](./module-r0-roadmap-and-public-release-control.md).

R0 named every release owner before R1.1 started.

## 2. Approved Roadmap Amendment

Roadmap version 1.0 assigned FR-IAM-10 and FR-IAM-11 entirely to R1.

The detailed audit found that their final evidence depends on later domain tables.

The product owner approved this amendment on 2026-08-24:

| Requirement | R1 responsibility | Completion release | Final evidence |
|---|---|---|---|
| FR-IAM-10 | Customer identity, organization scope, and fail-closed grant foundation | R6 | Deals, intake, requirements, availability, feedback, tasks, and documents |
| FR-IAM-11 | Vendor identity, organization scope, and fail-closed grant foundation | R7 | Requests, responses, events, proposals, communications, and commission denial |

FR-IAM-12 remains in R1.

R1 must complete its authorized organization portal grant, revocation, and audit evidence.

R2B must add deal grants with foreign keys and audited revocation.

Every portal resource must require active organization portal access.

Organization-scoped resources need no broader parent grant.

Deal-scoped resources must also require an active deal grant.

Deal descendants must inherit that deal grant. A resource grant can only narrow parent access.

Revoking an organization or deal grant must deny its descendant resources immediately.

R9 must repeat the complete customer and vendor isolation matrices.

The parent roadmap v1.6 records the approved rows and cross-release notes.

It requires deterministic-authorization regression evidence in every R5 through R9 module plan.

NFR-AUTH-01, NFR-ISO-01, and NFR-AUD-01 remain cross-release controls.

R1 owns their foundation. Every later release must extend their evidence.

## 3. R1 Requirement Targets

| Requirement | R1 target | Later obligation |
|---|---|---|
| FR-IAM-01 | Preserve verified identity and complete negative identity tests | Retest every protected surface |
| FR-IAM-02 | Prove isolation for every current table and route | Extend the matrix with each domain table |
| FR-IAM-03 | Authorize every current protected entry point | Require explicit permissions on every new entry point |
| FR-IAM-04 | Implement role defaults, feature, action, field, and override rules | Add domain permission keys with each module |
| FR-IAM-05 | Implement delegation ceilings and anti-escalation rules | Retest every new delegated permission |
| FR-IAM-06 | Implement bounded organization member administration | Extend organization controls only through approved commands |
| FR-IAM-07 | Prove direct server denial behind every interface state | Repeat for every later interface |
| FR-IAM-08 | Keep Deferred and prove that no impersonation entry point exists | Reconsider only through a separate product decision |
| FR-IAM-09 | Implement immutable and redacted R1 audit events | Add each later sensitive command to audit reconciliation |
| FR-IAM-10 | Remain Partial after R1 | Complete in R6 and regress in R9 |
| FR-IAM-11 | Remain Partial after R1 | Complete in R7 and regress in R9 |
| FR-IAM-12 | Implement authorized organization portal grants, revocations, and audit | Extend to deal grants in R2B and regress in R9 |
| NFR-AUTH-01 | Complete current-surface authorization evidence | Extend through R9 |
| NFR-ISO-01 | Complete current-table isolation evidence | Extend through R9 |
| NFR-AUD-01 | Complete R1 audit evidence | Extend through R9 |

Expected post-R1 statuses require completed evidence:

| Status | Requirements |
|---|---|
| Implemented | FR-IAM-01 through FR-IAM-07, FR-IAM-09, and FR-IAM-12 |
| Deferred | FR-IAM-08 |
| Partial | FR-IAM-10, FR-IAM-11, NFR-AUTH-01, NFR-ISO-01, and NFR-AUD-01 |

Each later module must preserve every Implemented R1 control.

## 4. Current Evidence and Risks

| Area | Current evidence | Material gap |
|---|---|---|
| Verified identity | `src/middleware.ts`, `src/lib/supabase/server.ts`, and tRPC use `getClaims()` | Identity does not prove organization or action access |
| Application home | `/home` checks verified identity | Any authenticated account can enter |
| Administration | `/admin` is a placeholder | The route is public |
| tRPC | `identityProcedure` rejects anonymous callers | No procedure checks organization or permission scope |
| Organizations | `orgs`, `org_members`, and `invitations` exist | Types, states, policies, commands, and consumers are absent |
| Membership roles | `admin`, `contributor`, and `viewer` exist | Omitted role input defaults to `admin` |
| Invitations | Expiry and acceptance timestamps exist | Tokens are raw, reusable, non-unique, and not revocable |
| Audit | `audit_log` stores generic snapshots | Writers, reason, correlation, redaction, and immutability are absent |
| RLS | All five current tables enable RLS | No policies or real user-token policy tests exist |
| Database pool | `DATABASE_URL` creates one direct Drizzle pool | The current local owner bypasses RLS |
| Tests | Auth round trips and RLS enablement have integration tests | The tests do not prove authorization or isolation |
| CI | `.github/workflows/ci.yml` runs standard application gates | CI excludes the local Supabase integration matrix |
| Storage | No private application bucket exists | R1 cannot claim storage-policy coverage |

## 5. Approval Decisions and Recommended Defaults

All four named owners must approve the defaults that affect their areas.

Product owns user behavior and role names. Security owns access, MFA, delegation, and audit.

Engineering owns data paths and migration design. Operations owns member and invitation lifecycles.

| Decision | Recommended default |
|---|---|
| Organization types | Use internal, customer, and vendor organizations |
| Platform roles | Use Super Admin, Admin, and Staff |
| Organization roles | Use Organization Admin, Contributor, and Viewer |
| Legacy role map | Map `admin` to Organization Admin; retain contributor and viewer meanings |
| Multiple memberships | Permit explicit memberships with one active organization context |
| Organization context | Validate the selected context on every request; let RLS cover all active memberships |
| Permission source | Use a typed code registry synchronized with database definitions |
| Default access | Deny access unless an active role or override grants it |
| Override order | Explicit deny, explicit allow, role default, then default deny |
| Super Admin | Grant every configured permission through versioned role defaults, not a wildcard |
| Platform-role cardinality | Permit one active platform role per identity; preserve revoked assignment records |
| Admin delegation | Permit only actions covered by an active Super Admin delegation grant |
| Self-escalation | Deny role, override, and delegation changes affecting the acting user |
| Internal customer access | Require a scoped grant, reason, and audit event |
| Public account entry | Create pending access only; require a membership or internal assignment for protected routes |
| Entry-point classes | Classify each entry as public, identity-only, organization-scoped, or privileged |
| Email ownership | Require verified email before protected access |
| Identity state | Use pending, active, suspended, and archived states; authorize only active identities |
| Identity relink | Require a separate two-person command; never relink from browser input |
| Password policy | Match server and interface rules; require at least 12 characters before production use |
| Portal URLs | Use `/home` for routing, `/customer` and `/vendor` for portals, and `/admin` for internal administration |
| Privileged MFA | Require AAL2 for security administration, member administration, invitations, and portal-grant changes |
| Recovery approval | Require two current AAL2 approvers; neither can be the target or request initiator |
| Invitation lifetime | Use a configured duration of 72 hours |
| Invitation resend | Revoke the old invitation before requesting replacement delivery |
| Invitation identity | Verify identity first; accept only when the normalized verified email matches the invitation |
| Invitation delivery | Use provider-neutral identity email for new users; show pending invitations after existing users sign in |
| First Super Admin | Use a local-only command with verified AAL2 identity, durable one-time state, and product-security approval |
| Recovery capacity | Keep one separate initiator and three eligible approvers; recheck capacity after every security mutation |
| Role versions | Assign a stable role key that follows one approved active version; audit every version activation |
| Override scope | Persist platform and organization scopes in R1; add foreign-keyed resource scopes with each domain |
| Organization removal | Archive or restrict; do not cascade-delete security history |
| Organization state | Use pending, active, suspended, and archived states; authorize only active organizations |
| Membership history | Permit one active or suspended identity membership per organization through a partial unique index |
| Foreign resource response | Return not found for inaccessible resource identifiers |
| Global permission response | Return forbidden for an authenticated user without the required action |
| Audit retention | Preserve security events for the approved legal period; do not delete them through application roles |
| Identity retention | Preserve stable security history; anonymize personal fields only through an approved retention action |
| Intent retention | Keep allowlisted status and safe error codes for the approved operational period |

Named people must replace owner roles before implementation starts.

## 6. Authorization Contract

### 6.1 Identity Context

Each protected request must carry:

- A verified user identifier from `getClaims()`
- The current authentication assurance level
- One selected active organization, when organization scope applies
- A correlation identifier
- An optional idempotency key for retryable commands

Do not use `getSession()` to authorize a request.

Do not store dynamic permissions in user-editable metadata.

Read current membership, role, override, and delegation state from PostgreSQL.

Require an active internal identity with a unique Auth user link.

Require verified claims and synchronized email-confirmation state from the identity service.

Only a server command can synchronize fields from verified claims and trusted identity-service data.

Only the approved recovery process can relink an identity to another Auth user.

Validate the selected organization against active memberships on every request.

RLS can authorize all active memberships. Application queries must also filter by the validated selected organization.

### 6.2 Permission Evaluation

Evaluate access in this order:

1. Reject missing or invalid identity.
2. Reject any non-active identity or platform access.
3. Reject a missing or non-active organization when scope requires it.
4. Reject missing or inactive organization membership when scope requires it.
5. Apply an active explicit deny.
6. Apply an active explicit allow.
7. Apply an active versioned role default.
8. Deny when no rule grants access.

Ignore expired overrides and revoked grants.

Match platform and organization scopes before applying precedence.

Any matching explicit deny wins across those scopes.

An organization grant never grants a platform permission.

A platform role never grants direct database credentials.

A delegator cannot grant, revoke, or delegate more authority than their active ceiling.

Every security mutation must evaluate effective administration after its proposed change.

Role labels alone do not satisfy this invariant.

Reject a change that removes the last effective Super Admin or the last administrator of any active organization.

Reject a change that leaves fewer than three eligible recovery approvers.

Reject overlapping active recovery-request and recovery-approval authority for one identity.

Apply these checks to roles, versions, permission definitions, defaults, overrides, delegations, identities, organizations, and memberships.

### 6.3 Permission Names

The first registry must include these classes:

| Class | Example keys |
|---|---|
| Feature | `workspace.access`, `admin.access`, `portal.customer.access`, `portal.vendor.access` |
| Action | `org.members.view`, `org.members.invite`, `org.members.change_role`, `org.members.revoke` |
| Identity administration | `identity.status.change`, `identity.relink`, `identity.recovery.request`, `identity.recovery.approve` |
| Organization administration | `org.status.change`, `org.type.change` |
| Role administration | `platform_roles.assign`, `platform_roles.revoke`, `role_versions.activate` |
| Permission administration | `permissions.view`, `permissions.grant`, `permissions.revoke`, `permissions.delegate` |
| Portal administration | `portal.access.grant`, `portal.access.revoke` |
| Audit | `audit.view`, `audit.export` |
| Field | `org.name.read`, `member.role.read`, `member.role.update`, `audit.change_summary.read` |

The registry must use typed constants. Arbitrary permission strings must fail validation.

Migrations or an approved idempotent command must synchronize required definitions.

Use database seeds only for test fixtures.

### 6.4 Server Entry Points

Use one authorization service for pages, layouts, actions, procedures, exports, and commands.

Middleware must refresh sessions only. It must not become the only authorization boundary.

Every protected tRPC procedure must declare a permission and scope resolver.

Apply the inventory class to every Server Action and Route Handler.

Public entries require validation and rate controls. Protected entries require the declared authorization rule.

Cookie-authenticated mutations must use POST and an exact canonical-origin check.

Keep the built-in Server Action origin check and use no extra allowed origin without approval.

Apply an equivalent shared origin guard to cookie-authenticated tRPC mutations and Route Handler commands.

Non-browser workers must use separate credentials and cannot call cookie mutation handlers.

Field permissions must select or construct narrow response objects.

Interface hiding must follow server authorization results.

Keep a complete authorization inventory for every page, layout, action, handler, procedure, export, and command.

The inventory must name its class, permission, scope, data path, and denial tests.

### 6.5 User-Driven Commands

User-driven commands must run through the caller's verified JWT context.

Prefer fixed RPC functions that derive the actor from `auth.uid()`.

Each function must recheck current permission and scope before mutation.

Each privileged function must reject missing `auth.uid()`, unverified identity, and insufficient AAL.

Read current identity verification and status from the internal identity record.

Read the assurance level from verified JWT claims inside the database function.

Do not pass an actor identifier supplied by the browser.

System-worker functions must remain separate from user-driven functions.

The worker cannot change identity state, organization state, platform roles, or active role versions.

### 6.6 Deterministic Authorization

AI output must never evaluate permissions, select roles, create grants, approve identity actions, or influence RLS.

Authorization must depend only on verified identity and stored deterministic policy state.

R5 through R9 must repeat tests that prove AI code cannot change authorization results.

### 6.7 First Super Admin Bootstrap

The bootstrap must exist only as `scripts/r1-bootstrap-super-admin.mjs`.

Do not expose it through a page, action, handler, procedure, worker, or public database function.

The target must supply a current AAL2 access token through standard input.

The script must verify the token with `getClaims()` and keep it only in memory.

The verified identity must match the approved target and active internal identity.

The script must require distinct product and security approval references.

Its separately approved prepare mode must store the target and approval references without granting access.

It must call fixed owner-only prepare and complete functions through `MIGRATION_DATABASE_URL`.

Its completion mode must lock and consume durable bootstrap state in the assignment and audit transaction.

It must fail after first use, when an administrator exists, or when any assurance check fails.

## 7. Data Access Paths

| Path | Credential | Allowed purpose | Required controls |
|---|---|---|---|
| User request | Request-scoped Supabase public client with user token | User-authorized reads and writes | Verified identity, permission check, grants, and RLS |
| Public request | Public client or narrow route command | Approved public operations only | Validation, rate limit, fixed command, and audit when required |
| Restricted worker | Non-owner PostgreSQL role | System commands and jobs only | EXECUTE-only fixed functions, idempotency, correlation, and audit |
| Auth or Storage admin | Server-only Supabase secret client | Fixed identity or storage administration | Isolated adapter, no session cookies, and audit |
| Migration owner | `MIGRATION_DATABASE_URL` | Migrations, recovery, and local or CI ephemeral worker lifecycle | No application runtime access |

Keep `DATABASE_URL` for the restricted application worker.

Add `MIGRATION_DATABASE_URL` for Drizzle migration ownership.

Define the shared restricted worker as a `NOLOGIN` role.

Local and CI commands must create a unique ephemeral login member without printing or persisting its credential.

They must pass it to a fixed owner-only credential function as a bound value.

They must build the worker DSN in memory and set `DATABASE_URL` only in the application or test child process.

The local wrapper must refuse non-loopback migration URLs and remove its ephemeral login during cleanup.

Each ephemeral login needs a bounded expiry. The wrapper must renew only while its child process remains active.

Production worker credential creation remains an R9 activation action with separate approval.

Give the worker group and login members no table DML, ownership, superuser, or `BYPASSRLS` privileges.

Grant EXECUTE only on approved fixed command functions.

Each command function must use a pinned search path and write its audit event atomically.

Add source-boundary tests for owner-pool and administration-adapter imports.

Pages, components, routers, and ordinary services must not import privileged clients.

## 8. Proposed Data Changes

Use additive migrations. Keep legacy columns until a later approved contract migration.

| Entity | Change | Safety rule |
|---|---|---|
| `identities` | Add stable identities, unique nullable Auth links, normalized email, verification time, status, and synchronization time | Keep non-archived verified emails unique; reject browser-controlled synchronization |
| `orgs` | Add organization type, status, activation, suspension, and archival fields | Backfill only approved facts |
| `org_members` | Add identity, stable role key, state, activation, suspension, revocation, and history | Replace the legacy unique index with approved nonterminal uniqueness |
| `role_definitions` | Add stable key, immutable version, kind, approval state, and activation state | Permit one active approved version per stable role key |
| `permission_definitions` | Add typed feature, action, and field permission records | Match the code registry exactly |
| `role_permission_defaults` | Add versioned default allows and denies | Preserve superseded versions |
| `platform_role_assignments` | Add stable role key, state, assignment, revocation, actor, reason, and time | Use one active assignment per identity through a partial unique index |
| `user_permission_overrides` | Add scoped allow or deny, state, expiry, issuer, reason, and revocation | Permit one active record per identity, permission, and normalized scope |
| `admin_delegation_grants` | Add scoped ceilings, state, expiry, issuer, reason, and revocation | Prevent cycles and self-escalation |
| `portal_access_grants` | Add organization, portal, state, issuer, reason, and revocation | Permit one active grant per organization and portal |
| `invitations` | Add normalized email, creator, acceptor, state, revocation, and expiry | Permit one pending invitation per organization and email |
| `identity_admin_intents` | Add durable identity-service requests and delivery state | Use unique idempotency keys and bounded retries |
| `identity_recovery_requests` | Add target, initiator, reason, expiry, status, and evidence reference | Never store identity-verification evidence content |
| `identity_recovery_approvals` | Add distinct approver, decision, assurance, and time | Require two valid approvals from non-target approvers |
| `security_bootstrap_state` | Add singleton target, approval references, consumption state, and time | No reset through application or worker roles |
| `audit_events` | Add versioned, append-only, redacted security events | Mutation and audit must share one transaction |
| `audit_log` | Freeze the legacy table and mark its format | Preserve existing records |

### 8.1 State Transitions

Use these allowed transitions:

- Pending identity: active or archived
- Active identity: suspended or archived
- Suspended identity: active or archived
- Archived identity: terminal
- Pending organization: active or archived
- Active organization: suspended or archived
- Suspended organization: active or archived
- Archived organization: terminal
- Active membership: suspended or revoked
- Suspended membership: active or revoked
- Revoked membership: terminal
- Invitation: pending to accepted, expired, or revoked
- Accepted, expired, and revoked invitations: terminal
- Permission override: active to revoked
- Delegation grant: active to revoked
- Portal grant: active to revoked
- Draft role version: approved or rejected
- Approved role version: active or retired
- Active role version: approved
- Rejected and retired role versions: terminal
- Platform-role assignment: active to revoked
- Pending recovery request: approved, expired, or cancelled
- Approved recovery request: completed, expired, or cancelled
- Completed, expired, and cancelled recovery requests: terminal

Assignments follow the single approved active version for their stable role key.

Version activation must be audited and reversible by activating the prior approved version.

Create a new record when access returns after a terminal state.

Do not overwrite security history.

Invitation records and membership records use separate states.

Use a partial unique index on organization and identity for active or suspended memberships.

A later membership can use a new record after the prior membership becomes revoked.

Use a partial unique index to permit one active platform-role assignment per identity.

A later platform-role assignment can use a new record after the prior assignment becomes revoked.

Use one active override per identity, permission, and normalized scope key.

Setting a replacement override must revoke the old record in the same transaction.

Platform-role assignments store a stable role key and follow its single active approved version.

Activating a role version changes existing assignment defaults without rewriting assignment history.

Activation must atomically return the prior active version to approved state.

Use a partial unique index to permit one active portal grant per organization and portal.

A later portal grant can use a new record after the prior grant becomes revoked.

### 8.2 Identity Recovery Sequence

1. An authorized initiator creates an expiring recovery request for one identity.
2. The request records a reason and an external evidence reference without evidence content.
3. Two distinct authorized approvers verify identity independently.
4. Each approver must be AAL2 and cannot be the target or initiator.
5. The command rechecks approver authority and request expiry before completion.
6. One transaction consumes the approvals, applies the narrow recovery action, and writes audit events.

The request must name one allowed action. It cannot grant roles, permissions, memberships, or organization access.

The request must fail when either approver loses authority before completion.

Recovery cannot activate until the configured approver group can meet the quorum.

Maintain at least three active recovery approvers with verified MFA enrollment.

Maintain at least one active recovery initiator who has no recovery-approval authority.

Every security mutation must recheck recovery capacity after target and initiator exclusions.

### 8.3 Invitation and Identity-Service Sequence

For a new user:

1. An authorized command creates the application invitation and delivery intent.
2. The transaction writes the invitation, intent, and initial audit event.
3. A provider-neutral identity service requests the identity email.
4. The worker records delivery success or failure with an audit event.
5. The user verifies identity through the identity service.
6. The fixed acceptance page lists invitations for the verified normalized email.
7. One transaction activates membership and consumes the selected invitation.

For an existing verified user:

1. Create the invitation without a delivery intent.
2. Record the invitation audit event in the same transaction.
3. Show the pending invitation after normal sign-in.
4. Require the same verified normalized email match before acceptance.

An authorized administrator can share the fixed acceptance path through an approved manual channel.

R4 can add optional provider-neutral transactional notification without changing invitation acceptance.

Email links must use a fixed acceptance URL without an application secret.

Raw application tokens must never enter intents, email metadata, logs, or audit data.

Retries must use the original idempotency key.

Delivery failures must remain visible and retryable without creating another active invitation.

Use `outcome_unknown` when delivery can succeed before result recording fails.

Reconcile provider state before retry. Require manual review when safe reconciliation is impossible.

A Trigger.dev dispatcher must claim durable intents with a lease.

It must recover expired leases, apply bounded retries, and prevent concurrent duplicate delivery.

The dispatcher must call a provider-neutral identity domain service.

It must not import the identity-provider adapter directly.

Responses must not reveal whether an email already has an account or invitation.

### 8.4 Audit Event Contract

Each sensitive event must record:

- Event version
- Actor type and verified actor identifier
- Organization scope, when applicable
- Command and action
- Entity type and identifier
- Required reason
- Correlation identifier
- Idempotency key, when applicable
- Allowlisted before-and-after change summary
- Event time

Never record passwords, session tokens, invitation tokens, secret keys, signed URLs, or complete sensitive records.

Application roles must not update or delete audit events.

### 8.5 Identity and Intent Data Limits

Identity reads must return only fields allowed for the caller and purpose.

Identity-service intents can store operation type, reference identifiers, state, attempt counts, and sanitized error codes.

Intents must not store message bodies, secret links, provider payloads, credentials, or raw personal records.

Recovery records can store an evidence reference. They must not store the evidence content.

Approved retention actions must preserve stable identity identifiers and immutable audit evidence.

## 9. RLS and Grant Contract

Use explicit grants and necessary operation-specific policies.

Name each target role in every policy.

Use both `USING` and `WITH CHECK` where updates can occur.

Keep helper functions in an unexposed schema.

Pin an empty `search_path` and schema-qualify every object in security-definer functions.

Revoke default function execution. Grant only the required execution path.

Index membership, organization, role, permission, and grant lookup columns.

Authorization helpers must recognize all active memberships for the caller.

The application must validate and filter the selected organization context.

A context outside the caller's active memberships must fail before data access.

| Current table | R1 user-token contract |
|---|---|
| `identities` | No direct Data API access; fixed commands synchronize and read allowlisted identity fields |
| `orgs` | No direct table read; a fixed function returns allowlisted fields for the validated active organization |
| `org_members` | No direct table read; fixed functions return allowlisted self or authorized organization fields |
| `invitations` | No direct Data API access; fixed commands control every transition |
| `leads` | No direct anonymous or authenticated access; R2A adds its narrow public command |
| `audit_log` | No application mutation; preserve legacy records |
| `audit_events` | No external mutation; authorized readers receive redacted fields only |
| `identity_admin_intents` | No direct Data API access; the restricted worker uses fixed commands only |
| `identity_recovery_requests` | No direct Data API access; fixed recovery commands return redacted state |
| `identity_recovery_approvals` | No direct Data API access; fixed commands control every decision |
| `security_bootstrap_state` | No Data API or worker access; the local owner-only bootstrap function controls it |
| Permission tables | No raw external access; safe helpers return current authorization results |

Use server-only data-transfer objects for redacted audit reads.

If a database view is necessary, require `security_invoker`, explicit grants, and cross-organization tests.

No private application bucket exists at the R1 baseline.

R1 must record zero current buckets. It must not claim document-storage coverage.

R4 must add bucket policies and their isolation matrix with the first private bucket.

Tests must prove same-organization success only for permitted operation pairs.

Deny-only tables require expected denial or authorized command success evidence.

Field permissions must change fixed-function results without enabling raw table reads.

Primary references:

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase verified claims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- [Next.js authentication and authorization](https://nextjs.org/docs/app/guides/authentication)
- [Next.js Server Action origin controls](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [Supabase multi-factor authentication](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase user invitations](https://supabase.com/docs/guides/auth/users)
- [Supabase CLI work directories](https://supabase.com/docs/reference/cli/getting-started)
- [Supabase database testing and CI](https://supabase.com/docs/guides/local-development/testing/overview)

## 10. Work Packages

R1.2, R1.3, and R1.4 can each add one reviewed additive migration.

Each database package must generate, review, and apply its migration before package validation.

### R1.0 — Approve the Security Contract

Completion status: open.

The recovery officer names and demonstrated quorum remain placeholders.

Named owners:

| Role | Named owner | Responsibility |
|---|---|---|
| Product | Rob Speciale | Product behavior and final product decisions |
| Security | Rob Speciale | Authorization, private data, and technical risk |
| Engineering | Rob Speciale | Architecture, implementation, and technical recovery |
| Operations | Rob Speciale (temporary) | Business workflows and customer operations |

Outcome:

- Confirm the parent roadmap records the approved Section 2 amendment.
- Name the product, security, engineering, and operations owners.
- Record security, engineering, and operations approval for their areas.
- Confirm the product owner approved the Section 5 defaults.
- Approve the permission registry and role matrix.
- Approve audit redaction and retention rules.
- Approve identity, intent, and recovery redaction and retention rules.
- Approve the first Super Admin bootstrap procedure.
- Approve recovery officers, quorum availability, expiry, and allowed recovery actions.
- Approve `/home`, `/customer`, `/vendor`, and `/admin` route purposes.
- Approve new-user identity delivery, redirects, retries, and reconciliation.
- Approve the existing-user pending-invitation experience and manual notice path.
- Approve the local migration and restore rehearsal procedure.
- Approve the emergency containment and restoration runbook.

Exit evidence:

- Recorded R0 exit evidence
- Recorded approvals
- No unresolved role or permission ambiguity
- No unresolved public sign-up or invitation ambiguity
- No unresolved migration or recovery command

No schema implementation starts before R1.0 completes.

### R1.1 — Inventory Entry Points and Deny Early Access

Implementation status on 2026-08-27: complete and validated.

The durable inventory is `docs/security/r1-authorization-matrix.md`.

The implementation denies `/admin`, limits `/home` to a pending-access response, and keeps public entry classes explicit.

Outcome:

- Classify every page, layout, action, handler, procedure, export, and command.
- Record the inventory in `docs/security/r1-authorization-matrix.md`.
- Add shared verified-identity guards.
  - Keep middleware limited to the R0 release gate, session refresh, and optional redirects.
- Keep sign-in, sign-up, and public health checks outside permission gates.
- Deny `/home` and `/admin` until R1.4 permission checks pass.
- Define sign-in, pending-access, forbidden, and not-found responses.
- Preserve GALLERY_ONLY behavior.

Validation:

- Anonymous route denial tests
- Temporary deny-all protected-route tests
- Expired-token and invalid-token tests
- Direct Server Action and tRPC denial tests
- Unsafe-method, missing-origin, and foreign-origin tests for every cookie mutation class
- Entry-point inventory completeness test
- Source and configuration scan for impersonation routes, actions, procedures, commands, flags, and adapters
- Browser checks for sign-in, denial, and sign-out states

Recovery:

- Disable affected protected routes instead of bypassing guards.
- Keep anonymous users outside every protected route.

### R1.2 — Add Compatible Identity and Audit Data

Outcome:

- Add the Section 8 schema through additive migrations.
- Enable RLS in the migration that creates each table.
- Add required `auth.users` foreign keys in reviewed SQL.
- Replace the current Auth user cascade with the approved retention behavior.
- Add unique Auth linking and nonterminal membership uniqueness.
- Backfill legacy roles through the approved map.
- Mark ambiguous rows for review.
- Inventory active legacy invitations without sending or revoking them.
- Add `MIGRATION_DATABASE_URL` to `.env.example` and `drizzle.config.ts`.
- Define the restricted worker role without activating command access.
- Add fixed owner-only functions that create and remove validated ephemeral worker login names.
- Add `scripts/r1-with-local-worker.mjs` for secret-safe local and CI child processes.
- Update local development and integration scripts to inject the restricted worker DSN in memory.
- Move existing database-test fixtures to a test-only migration-owner client.
- Make the existing database integration test reject owner, superuser, `BYPASSRLS`, and raw worker DML.
- Change local Auth configuration to require email confirmation.
- Set the approved local password minimum.
- Enable local TOTP enrollment and verification.
- Add isolated migration rehearsal fixtures and npm commands.

Validation:

- Run `supabase status` and verify the project and ports first.
- Generate the migration once with `npx drizzle-kit generate`.
- Review every generated and handwritten SQL statement.
- Apply the reviewed migration with `npx drizzle-kit migrate`.
- Clean migration on an empty local database
- Migration on a populated baseline database
- Backfill reconciliation by source and target counts
- Constraint and state-transition tests
- Auth user deletion-retention test
- Identity synchronization, suspension, archival, deletion, and relink tests
- Duplicate Auth-link, verified-email, and nonterminal-membership denial tests
- Revoked-membership history and later rejoin tests
- Omitted membership role cannot become Organization Admin
- Application rollback compatibility test

Recovery:

- Keep legacy reads available during the additive stage.
- Preserve every old column and security record.
- Use a reviewed forward fix for unsafe database rollback.
- Revoke legacy invitations only through a separately approved operation.

### R1.3 — Add Grants, RLS, and Request-Scoped Access

Outcome:

- Revoke unintended default table and function privileges.
- Add explicit grants and necessary policies for every current table.
- Add safe private authorization helpers.
- Add request-scoped user-token data access.
- Deny raw Data API reads of identity, organization, membership, and administration tables.
- Add fixed field-safe read functions for approved organization and membership fields.
- Add the complete current-table principal matrix.
- Add import-boundary checks for privileged clients.
- Prove the worker is not an owner, superuser, or `BYPASSRLS` role.
- Create exact table and function revocations in `docs/security/r1-emergency-revocation.sql`.
- Create shutdown, restoration, authority, and evidence steps in `docs/security/r1-emergency-containment.md`.

Validation:

- Real anonymous and authenticated Supabase clients
- Same-organization success for each allowed operation
- Cross-organization denial for each operation
- `USING` and `WITH CHECK` tests
- Forged organization and record identifier tests
- Revoked-access tests with an old active token
- Search-path and public-execution denial tests
- Expected denial or authorized command success for deny-only tables
- Raw table denial and field-safe fixed-function response tests
- Field permission allowlist and omission tests
- Local rehearsal of every emergency revocation statement
- Local shutdown and restoration rehearsal through the approved containment runbook

Recovery:

- Never disable RLS to recover access.
- Apply the pre-reviewed per-role table and function revocations.
- Use the approved whole-Data-API shutdown runbook when exact revocation is insufficient.
- Disable the affected command or route after database containment.
- Apply a reviewed forward policy fix.

### R1.4 — Add Permission Evaluation and Audited Commands

Outcome:

- Implement one server authorization service.
- Add permission-specific tRPC procedure builders.
- Apply each inventory class to every current Server Action and Route Handler.
- Run user-driven commands through JWT-scoped functions that verify `auth.uid()`.
- Add narrow field response objects.
- Add named identity and permission administration commands.
- Write each database mutation and audit event in one transaction.
- Use durable intent and completion events for identity-service side effects.
- Require reason, correlation, and idempotency where applicable.
- Activate worker EXECUTE grants only after command allowlists pass.
- Activate privileged user RPC grants only after their command-level security tests pass.
- Synchronize permission definitions through an approved idempotent command.
- Add reviewed SQL for JWT functions, system functions, and worker EXECUTE grants.
- Add the provider-neutral identity service and its server-only administration adapter.
- Add the leased Trigger dispatcher for approved identity administration intents.
- Add fixed owner-only bootstrap prepare and complete functions without application or worker grants.

Initial commands:

- Assign or revoke a platform role
- Activate an approved role version
- Set or revoke a user override
- Set or revoke an Admin delegation grant
- Activate, suspend, or archive an identity
- Activate, suspend, archive, or change the type of an organization
- Activate, suspend, or revoke a membership
- Change a membership role
- Grant or revoke organization portal access
- Create or complete an identity-service intent
- Synchronize a verified identity
- Create, approve, cancel, expire, or complete an identity recovery request

Validation:

- Role-default and override-precedence tests
- Expired-override boundary tests
- Concurrent override set, revoke, and replacement tests
- Exact code-to-database permission registry parity test
- AAL1 denial and AAL2 success for every privileged R1.4 command
- Field allowlist tests
- Separate view, grant, revoke, and delegate ceiling tests
- Direct and indirect delegation-cycle denial tests
- Self-escalation denial tests
- Transaction rollback when audit writing fails
- Audit immutability and sensitive-value rejection tests
- Recovery requester-approver separation, approvals, expiry, exclusions, quorum, and authority-loss tests
- Every invalid recovery-state transition test
- Recovery cannot change roles, permissions, memberships, or organization access
- Worker command allowlist tests
- Worker database-role property tests
- Worker credential non-disclosure, concurrent provisioning, expiry, renewal, child-process injection, and cleanup tests
- Concurrent role-version activation tests
- Existing-assignment propagation and prior-version reactivation tests
- Duplicate, concurrent, revoke, and reassign platform-role assignment tests
- Identity and organization state permission, AAL2, audit, concurrency, and worker-denial tests
- Last-Super-Admin and affected-organization-administrator protection during concurrent identity-state changes
- Effective-administrator protection during role-version, override, delegation, and assignment changes
- Recovery-capacity checks after every security mutation, including target and initiator exclusions
- Invalid identity and organization state-transition tests
- Concurrent portal grant, revoke, and regrant tests
- Identity-service and Trigger import-boundary tests

Recovery:

- Use a fail-closed command enable list.
- Stop protected writes when audit atomicity fails.
- Rotate a worker or admin credential after suspected exposure.

### R1.5 — Activate Permission-Aware Routes and MFA

Outcome:

- Replace temporary route denial with current permission evaluation.
- Require active platform or organization access for `/home`.
- Add fail-closed customer and vendor route layouts before enabling redirects.
- Validate the selected organization context on every request.
- Add pending email-verification and pending-access states.
- Route authorized users to `/customer`, `/vendor`, or `/admin`.
- Add privileged MFA enrollment, challenge, and recovery flows.
- Permit the approved pending bootstrap target to enroll and challenge TOTP without protected application access.
- Add the local-only Super Admin bootstrap script after AAL2 enrollment works.
- Require AAL2 for identity-state, role-version, platform-role, permission, delegation, and recovery commands.
- Require AAL2 for membership, invitation, portal-grant, and organization-state administration.

Validation:

- Unverified-email denial and verified-email success
- Server and interface password-policy parity tests
- AAL1 privileged denial and AAL2 success
- Unassigned-user denial
- Pending bootstrap target MFA access and every other protected-route denial
- Organization switching across two valid memberships
- Tampered and revoked organization-context denial
- Suspended and archived organization denial with an old active token
- Local Auth configuration matches the approved plan.
- Record staging and production parity as an R9 activation requirement.
- MFA enrollment failure and cancelled challenge
- Bootstrap unprepared, AAL1, expired-token, wrong-target, missing-approval, and existing-admin denial
- Bootstrap AAL2 success, atomic audit, single use, standard-input handling, and absent remote entry point
- Lost-factor recovery and unauthorized recovery denial
- Keyboard navigation, focus placement, and status announcements
- Responsive browser states with clean console and network results

Recovery:

- Keep privileged commands disabled when AAL2 cannot be verified.
- Use a separate two-person recovery command after independent identity verification.
- Never weaken ordinary command assurance to recover access.

### R1.6 — Add Organization and Invitation Administration

R1.6 cannot start before invitation delivery and configuration receive their separate approval.

Outcome:

- Add organization-scoped member lists.
- Add invitation creation, acceptance, expiry, revocation, and resend.
- Create no new application acceptance token.
- Enforce atomic single use and email matching.
- Process identity-service delivery through durable intents and bounded retries.
- Process intents through `src/trigger/identity-admin-intents.ts`.
- Record delivery success, retry, and terminal failure events.
- Add membership role, suspension, and revocation controls.
- Add permission and delegation administration for authorized internal users.
- Add server-only audit response objects with redacted fields.
- Use only reviewed security-invoker views when a database view is necessary.

Validation:

- Empty member list
- Successful and duplicate invitation
- Concurrent duplicate invitation creation
- Invalid, expired, revoked, reused, and wrong-user invitation
- Concurrent invitation acceptance
- Existing-user and new-user invitation paths
- Delivery retry, idempotency, stale-lease recovery, duplicate prevention, and terminal failure
- Delivery `outcome_unknown`, provider reconciliation, and manual-review tests
- Trigger dispatcher import-boundary test
- Enumeration-resistant responses and rate-limit tests
- Unauthorized role change
- AAL1 organization-administration denial and AAL2 success
- External administrator denial for platform roles and delegation
- External administrator denial for organization type and internal access
- External administrator denial for identity and organization status changes
- External administrator denial for permission definitions and role defaults
- External administrator denial for user overrides, portal grants, and audit exports
- External administrator denial for every other organization
- Last-organization-administrator protection
- Last-organization-administrator concurrent-revocation protection
- Last-active-Super-Admin single-user and concurrent-revocation protection
- Cross-organization member lookup denial
- Successful own-organization administration
- Loading, error, empty, and success browser states
- Responsive layout with clean console and network results

Recovery:

- Revoke affected invitations after token exposure.
- Issue replacements only through the separately approved delivery command.
- Require product, security, and operations approval before replacement delivery.
- Suspend unsafe administration commands without changing stored history.

### R1.7 — Add Portal Guard Foundations

Outcome:

- Extend the fail-closed customer and vendor route layouts with portal guards.
- Reuse the validated organization context from R1.5.
- Add organization-level portal activation and revocation.
- Add reusable domain permission and RLS test helpers.
- Document mandatory security hooks for R2B through R9.
- Record those hooks in `docs/security/r1-domain-extension-contract.md`.
- Keep all nonexistent domain resources absent.

Validation:

- Customer users cannot enter vendor routes.
- Vendor users cannot enter customer routes.
- Internal access requires a scoped grant.
- Revocation takes effect without waiting for a JWT refresh.
- No interface or test fixture claims missing domain behavior.

Recovery:

- Keep portal routes disabled when their access contract fails.

### R1.8 — Complete R1 Evidence and Review

Outcome:

- Rehearse empty and populated migrations.
- Rehearse application rollback and local restore.
- Run every standard gate.
- Run the complete integration matrix.
- Add the local Supabase integration matrix to CI.
- Use an approved Supabase CLI setup method in CI.
- Start Supabase, inject local environment values without logs, and apply reviewed migrations.
- Run integration tests and stop Supabase in an always-run cleanup step.
- Run critical browser journeys.
- Complete an adversarial security review.
- Reconcile every R1 requirement with evidence.
- Record AI authorization-invariant gates for the R5 through R9 module plans.
- Update project memory through the required brain protocol.

R1 closes only when all exit criteria pass.

### 10.1 Affected-Path Allowlist

Changes outside a package allowlist require plan-owner approval.

| Package | Existing and proposed paths |
|---|---|
| R1.0 | `.codex/plans/module-r1-secure-platform-base.md`, `.codex/plans/roadmap-v2-implementation.md`, `docs/security/r1-authorization-matrix.md` |
| R1.1 | `docs/security/r1-authorization-matrix.md`, `.env.example`, `.github/workflows/ci.yml`, `eslint.config.mjs`, `next.config.ts`, `supabase/config.toml`, `vitest.config.ts`, `src/middleware.ts`, `src/middleware.test.ts`, `src/server/auth/`, `src/server/trpc/`, `src/app/api/trpc/`, `src/app/(app)/`, `src/app/(admin)/`, `src/app/(auth)/`, `src/app/(marketing)/(site)/contact/`, `src/app/forbidden.tsx`, `src/app/not-found.tsx` |
| R1.2 | `src/server/db/`, `src/server/db/r1-empty-migration.integration.test.ts`, `src/server/db/r1-populated-migration.integration.test.ts`, `src/server/db/r1-rollback-compatibility.integration.test.ts`, `src/server/db/r1-restore.integration.test.ts`, `scripts/r1-with-local-worker.mjs`, `drizzle/`, `drizzle.config.ts`, `supabase/config.toml`, `.env.example`, `package.json` |
| R1.3 | `drizzle/`, `docs/security/r1-emergency-revocation.sql`, `docs/security/r1-emergency-containment.md`, `src/lib/supabase/`, `src/server/auth/`, `src/server/auth/rls.integration.test.ts` |
| R1.4 | `drizzle/`, `src/server/db/`, `src/server/auth/`, `src/server/audit/`, `src/server/commands/`, `src/server/identity/`, `src/server/integrations/auth-admin/`, `src/server/trpc/`, `src/trigger/identity-admin-intents.ts` |
| R1.5 | `scripts/r1-bootstrap-super-admin.mjs`, `src/app/(auth)/`, `src/app/(app)/`, `src/app/(admin)/`, `src/app/(app)/customer/`, `src/app/(app)/vendor/`, `src/server/auth/` |
| R1.6 | `src/app/(admin)/admin/identity/`, `src/app/(app)/settings/`, `src/server/trpc/root.ts`, `src/server/trpc/routers/identity.ts`, `src/server/commands/identity/`, `src/server/identity/`, `src/server/integrations/auth-admin/`, `src/trigger/identity-admin-intents.ts` |
| R1.7 | `docs/security/r1-domain-extension-contract.md`, `src/app/(app)/customer/`, `src/app/(app)/vendor/`, `src/server/auth/portal/`, `src/server/auth/portal-guards.test.ts` |
| R1.8 | `.github/workflows/ci.yml`, `docs/security/r1-evidence.md`, `src/server/auth/r1-security.test.ts`, `src/server/auth/r1-security.integration.test.ts`, `mmhrbrain/STATE.md`, `mmhrbrain/index.md`, `mmhrbrain/knowledge/`, `mmhrbrain/log.md`, `mmhrbrain/journal/` |

## 11. Test Matrix

### 11.1 Required Principals

- Anonymous user
- Authenticated user without membership
- Customer Viewer
- Customer Contributor
- Customer Organization Admin
- Vendor Viewer
- Vendor Contributor
- Vendor Organization Admin
- Internal Staff member
- Delegated Admin
- Super Admin
- Suspended or revoked member
- Suspended or archived identity
- Suspended or archived organization
- Invited but unaccepted user
- Restricted system worker
- One user with two organization memberships

### 11.2 Required Operation Tests

Test select, insert, update, delete, count, filter, join, and every exposed function.

Test subscription and GraphQL access if either surface is enabled.

Test these negative paths:

- Missing, invalid, expired, and revoked identity
- Duplicate or unverified Auth link and unauthorized identity relink
- Unverified email and AAL1 privileged access
- Missing active organization context
- Pending, suspended, and archived organization access
- Forged organization and record identifiers
- Cross-organization reads and writes
- Self-promotion and role escalation
- Concurrent override set, revoke, and replacement operations
- Duplicate, concurrent, revoked, and replacement platform-role assignments
- Delegation above the actor's ceiling
- Separate view, grant, revoke, and delegate ceiling failures
- Direct and indirect delegation cycles
- Organization changes during membership updates
- External administrator changes to platform roles, delegation, organization type, or internal access
- External administrator changes in another organization
- Invitation disclosure, reuse, and concurrency
- Invitation delivery retry, failure, enumeration, and rate-limit behavior
- Audit update, delete, forged actor, and missing reason
- Sensitive value insertion into audit data
- Direct route, action, procedure, and command calls
- Unsafe-method, missing-origin, and foreign-origin cookie mutations
- Worker access outside the command allowlist
- Worker owner, superuser, and `BYPASSRLS` status
- Omitted membership role input
- Repeated or remotely exposed Super Admin bootstrap
- Recovery self-approval, duplicate approval, expired request, and lost approver authority
- Recovery requester-approver overlap and missing-initiator capacity
- Security mutations that would leave fewer than three eligible recovery approvers
- Recovery action outside its approved narrow target
- Invalid recovery-state transitions
- Missing, extra, and unknown permission definitions
- Mutation success when audit writing fails
- Recursive policy and search-path attacks
- Authorization dependencies on AI interfaces or outputs

### 11.3 Integration Test Safety

Use the Supabase secret client only for local fixture setup and cleanup.

Use a test-only migration-owner client only when a database fixture cannot use the Supabase secret client.

Never import either fixture client through an application database module.

Use real anonymous and authenticated clients for user-facing RLS assertions.

Use the restricted worker only for its command allowlist assertions.

The local wrapper must set the restricted worker DSN as `DATABASE_URL` before the application or test imports database code.

Refuse integration tests when the configured URLs do not match the validated local stack.

Do not print environment values, tokens, invitation secrets, or user data.

### 11.4 Validation Commands

Run the smallest package test first.

Before integration or migration work, run:

```text
supabase status
```

If the project stack is stopped, run `supabase start`. Then run `supabase status` again.

Verify the local project name, API URL, and database port without printing secrets.

Run a preflight that compares `MIGRATION_DATABASE_URL` with the validated local host and port.

Block migration when the host is not loopback or the port differs from the local stack.

R1.2 must add these isolated rehearsal tests:

```text
npm run test:integration -- src/server/db/r1-empty-migration.integration.test.ts
npm run test:integration -- src/server/db/r1-populated-migration.integration.test.ts
npm run test:integration -- src/server/db/r1-rollback-compatibility.integration.test.ts
npm run test:integration -- src/server/db/r1-restore.integration.test.ts
```

Each rehearsal must use a unique scratch Supabase work directory and project identifier.

Pass its path through `SUPABASE_WORKDIR`. Use distinct local ports and test-scoped environment injection.

The harness must stop its stack during an always-run cleanup step.

Never use `--linked`. Never reset the normal project stack for these rehearsals.

Generate, review, and apply migrations only inside R1.2, R1.3, or R1.4.

Final R1 validation must run:

```text
npm run type-check
npm run lint
npm test
npm run test:integration
npm run build
```

Browser checks must cover the named roles, responsive states, console, and network failures.

CI must start a local Supabase stack and run `npm run test:integration` before R1 closes.

The CI integration job must use this sequence:

1. Check out the repository.
2. Set up the installed Node.js version.
3. Run `npm ci`.
4. Install the Supabase CLI through the separately approved pinned action.
5. Run `supabase start`.
6. Inject local Supabase values into the job environment without log output.
7. Run the local migration preflight.
8. Run `npx drizzle-kit migrate` through `MIGRATION_DATABASE_URL`.
9. Provision a unique ephemeral restricted worker login and credential without log output.
10. Run `npm run test:integration` with the worker DSN in its child-process `DATABASE_URL`.
11. Remove the ephemeral worker login and run `supabase stop` in always-run cleanup steps.

## 12. Main Risks and Recovery

| Risk | Prevention | Recovery |
|---|---|---|
| Cross-organization access | Explicit grants, RLS, server permission checks, and real token tests | Revoke Data API access, preserve evidence, and apply a forward fix |
| Administrator lockout | One-time bootstrap, tested recovery command, and two active Super Admins before production | Use the approved recovery command with product-security authorization |
| Identity relink abuse | Unique Auth links, two-person approval, narrow actions, and immutable audit | Suspend the command, preserve evidence, and restore through an approved request |
| Role escalation | Deny precedence, delegation ceilings, and self-change blocks | Revoke the grant and preserve audit evidence |
| RLS recursion | Private helpers, pinned search path, and isolated policy tests | Disable the affected route and replace the policy safely |
| Migration backfill error | Additive schema, approved maps, and reconciliation | Roll back application reads and correct data forward |
| Invitation exposure | No application token, short expiry, verified email, one use, and revocation | Revoke immediately; replace only with product-security-operations approval |
| Identity-service partial failure | Durable intent, idempotency, bounded retry, and result events | Stop retries, reconcile the intent, and record terminal failure |
| Auth user deletion | Stable internal identity and non-cascading history links | Anonymize the Auth link and preserve authorization history |
| Audit data leakage | Allowlisted changes and sensitive-value rejection | Stop writes, restrict readers, and correct data under approved procedure |
| Audit write failure | One transaction for database mutation and audit | Roll back the mutation and stop the command |
| MFA lockout | Tested enrollment, separate recovery, and two active Super Admins before production | Use the approved two-person recovery command and preserve audit evidence |
| Privileged credential exposure | Separate roles, narrow adapters, and import boundaries | Rotate the credential and review every command event |
| False requirement closure | Cross-release completion gates and evidence reconciliation | Reopen the requirement and block the affected release |

Never disable RLS, delete audit history, or invent backfill facts during recovery.

## 13. R1 Exit Criteria

- The Section 2 roadmap amendment is approved.
- The approved amendment appears in the parent roadmap matrix and cross-release notes.
- Named owners approve the Section 5 decisions.
- The authorization inventory classifies every current entry point.
- The source and configuration scan finds no impersonation entry point.
- Every current protected route and entry point enforces server authorization.
- Every cookie-backed mutation rejects unsafe methods, missing origins, and foreign origins.
- Every current application table has explicit grants and reviewed RLS behavior.
- Raw Data API access cannot bypass field-safe organization or membership responses.
- Every protected request requires an active identity and active organization where applicable.
- Every permitted operation has same-organization success and cross-organization denial evidence.
- Every deny-only table has expected denial or authorized command success evidence.
- Role defaults, permissions, overrides, and delegation rules pass their full matrix.
- Active overrides are unique by identity, permission, and normalized scope.
- Platform-role assignments preserve history and enforce one active assignment per identity.
- Bootstrap has no remote entry point, verifies AAL2, consumes one-time state, and writes atomic audit evidence.
- Existing assignments follow the single approved role version through audited activation.
- Identity and organization lifecycle commands enforce permission, AAL2, audit, and concurrency rules.
- Portal grants preserve history and enforce one active grant per organization and portal.
- Code and database permission definitions match exactly.
- Omitted membership role input cannot grant Organization Admin.
- Invitation transitions are single-use, expiring, revocable, and audited.
- Invitation delivery has durable, idempotent, and audited result handling.
- Audit events are append-only, redacted, and complete.
- Database mutations and their audit events are transactionally coupled.
- External identity operations have intent and completion audit events.
- Migration owner, worker, and Auth or Storage admin paths are separate.
- The worker is not an owner, superuser, or `BYPASSRLS` role.
- Local and CI runtime database imports use the ephemeral restricted worker DSN.
- Worker credentials never enter logs, files, command arguments, or retained artifacts.
- No user-facing request uses an owner or unrestricted bypass pool.
- Empty, populated, rollback, and restore rehearsals pass.
- Type checking, lint, unit tests, integration tests, and production build pass.
- CI runs the complete local Supabase integration matrix.
- Unverified email and AAL1 cannot perform privileged operations.
- Identity synchronization and relink controls pass their lifecycle and concurrency tests.
- Suspended and archived organizations deny old-token access.
- Recovery requires two current, distinct, non-target, non-initiator approvals.
- Every security mutation preserves one separate initiator and three eligible recovery approvers.
- AAL2 succeeds for every approved privileged operation.
- R1 authorization code has no AI dependency.
- The parent roadmap requires each R5 through R9 module plan to prove the invariant.
- Browser journeys pass with clean console and network results.
- The final adversarial security review has no unresolved critical or high finding.
- FR-IAM-10 and FR-IAM-11 remain Partial after R1.
- FR-IAM-12 has authorized portal grant, revocation, and audit evidence.
- R1 claims no private storage or later domain coverage.

## 14. Approval Record

| Approval | Status | Record |
|---|---|---|
| Parent roadmap v1.6 | Approved | Current Codex task, 2026-08-27 |
| Section 2 roadmap amendment | Approved | Product owner, current Codex task, 2026-08-24 |
| Product-owner R1 plan and defaults | Approved | Rob Speciale, current Codex task, 2026-08-24 |
| Security-owner R1 review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Engineering-owner R1 review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Operations-owner R1 review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| R1 implementation | Approved | User standing instruction, current Codex task, 2026-08-27 |
| Branch creation | Approved | User standing instruction, current Codex task, 2026-08-27 |
| Commit | Approved | User standing instruction, current Codex task, 2026-08-27 |
| Push | Approved | User standing instruction, current Codex task, 2026-08-27 |
| Pull request to `develop` | Approved | User standing instruction, current Codex task, 2026-08-27 |
| Merge into `develop` | Approved | User standing instruction, current Codex task, 2026-08-27 |
| Production dependencies | Not authorized | Separate user approval required |
| Invitation delivery configuration | Not authorized | Separate product-security-operations approval required |
| Legacy invitation revocation | Not authorized | Separate product-security-operations approval required |
| Pinned Supabase CI setup action | Not authorized | Separate user approval required |
| Staging and production Auth settings | Not authorized | R9 activation approval required |
| Production worker login and credential | Not authorized | R9 activation approval required |
| Cloud migration | Not authorized | Separate user approval required |
| Super Admin bootstrap | Not authorized | Separate product-security approval required |
| Deployment | Not authorized | Separate user approval required |

Approval of this plan approves its scope and defaults only.

The standing instruction above separately authorizes R1 implementation and routine Git work through `develop`.

The remaining Not authorized rows still require their named approval.
