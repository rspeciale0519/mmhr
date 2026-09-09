# R1 Secure Platform Base Module Plan

## Document Control

| Field | Value |
|---|---|
| Version | 0.12 R1.4 recovery and worker delivery decisions |
| Date | 2026-08-31 |
| Status | R1.0 through R1.8 foundations implemented and locally verified; invitation delivery and target-environment evidence remain gated |
| Parent roadmap | [roadmap-v2-implementation.md](./roadmap-v2-implementation.md) |
| R0 control record | [module-r0-roadmap-and-public-release-control.md](./module-r0-roadmap-and-public-release-control.md) |
| Product authority | [docs/PRD.md](../../docs/PRD.md) |
| Architecture authority | [docs/TECH_STACK.md](../../docs/TECH_STACK.md) |
| Baseline branch | develop |
| Required owners | Product, security, engineering, and operations |

The user authorized R1 implementation, branches, commits, pushes, pull requests, and integration into `develop` on 2026-08-27.

That authorization remains active until the user revokes it.

The full-delivery goal of 2026-08-30 also authorizes dependencies, configuration, migrations, bootstrap, releases, and deployments after their required checks.

Purchases and new paid commitments remain prohibited.

The sandbox reviewer blocked the R1.3 correction's remote push. Explicit approval of that remote write remains pending.

## 1. Outcome

Build a fail-closed identity, permission, organization-isolation, and audit foundation for every current protected surface.

R1 must secure current routes, tables, procedures, actions, and privileged commands.

Later releases must extend the same controls when they add domain resources.

R1 must not create fake deal, portal, document, commission, or workflow tables.

FR-IAM-08 remains Deferred. R1 must not add impersonation code, routes, commands, or configuration.

R0 records its decision ownership, claim inventory, and public-release block in
[module-r0-roadmap-and-public-release-control.md](./module-r0-roadmap-and-public-release-control.md).

R0 named every release owner before R1.1 started.

The R0 exact public-claim register is complete as a blocked inventory. R1 must
not treat its source paths or local checks as public-claim approval.

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

The [parent roadmap](./roadmap-v2-implementation.md) records the approved rows and cross-release notes.

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

## 4. Historical Pre-R1 Evidence and Risks

This table preserves the pre-R1 planning baseline. It does not describe the current implementation.

Use the [authorization matrix](../../docs/security/r1-authorization-matrix.md) and [local evaluation evidence](../../docs/security/r1-permission-evaluation.md) for current controls and remaining gaps.

| Area | Pre-R1 evidence | Pre-R1 gap |
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
| Identity state | Use pending, active, recovery_pending, suspended, and archived states; permit recovery_pending only on fixed MFA enrollment and verification paths |
| Identity relink | Require a separate two-person command; never relink from browser input |
| Password policy | Match server and interface rules; require at least 12 characters before production use |
| Portal URLs | Use `/home` for routing, `/customer` and `/vendor` for portals, and `/admin` for internal administration |
| Privileged MFA | Require AAL2 for security administration, member administration, invitations, and portal-grant changes |
| Recovery approval | Require one current AAL2 approval from the other named Super Admin; deny self-approval |
| Recovery request expiry | Expire each request 30 minutes after creation; reject approval or reset dispatch after expiry |
| Recovery action | Permit only an MFA enrollment reset that removes every MFA factor of any status before one replacement factor can activate; keep password reset and identity relink separate |
| Lost-factor identity check | The approving Super Admin calls the target at the company-record phone number that existed before the request; deny recovery if identity is not confirmed |
| Recovery session binding | Bind the request and replacement factor to the target's verified Auth session through an opaque recovery reference; never store an access token |
| Invitation lifetime | Use a configured duration of 72 hours |
| Invitation resend | Revoke the old invitation before requesting replacement delivery |
| Invitation identity | Verify identity first; accept only when the normalized verified email matches the invitation |
| Invitation delivery | Use provider-neutral identity email for new users; show pending invitations after existing users sign in |
| First Super Admin | Use a local-only command with verified AAL2 identity, durable one-time state, and product-security approval |
| Recovery capacity | Before recovery, bind both names to distinct active, MFA-enrolled, authorized identities; during recovery_pending, stop all other recovery and privileged actions |
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

Permit recovery_pending only on the fixed MFA enrollment, challenge, verification, and reset-result reconciliation paths.

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

Reject a change that leaves fewer than two active named Super Admins or removes the last administrator of any active organization.

The only exception is an atomically claimed, approved MFA reset that moves its target to recovery_pending.

During recovery_pending, deny every other recovery or privileged mutation until fresh AAL2 reactivation.

Reject a recovery request when the other named Super Admin cannot approve it.

Permit each named Super Admin to request or approve recovery across different requests.

Reject same-request self-approval and approval by the recovery target.

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

### 6.3.1 R1.4 Registry and Role Decisions

These implementation decisions resolve unspecified metadata under the full-delivery goal.

`P` means platform scope. `O` means one validated organization.

| Keys | Kind | Scope | Minimum assurance |
|---|---|---|---|
| `workspace.access` | feature | P/O | AAL1 |
| `admin.access` | feature | P | AAL2 |
| `portal.customer.access`, `portal.vendor.access` | feature | O | AAL1 |
| `org.members.view`, `org.members.invite`, `org.members.change_role`, `org.members.revoke`, `org.members.status.change` | action | O | AAL2 |
| `identity.status.change`, `identity.relink`, `identity.recovery.request`, `identity.recovery.approve` | action | P | AAL2 |
| `org.status.change`, `org.type.change` | action | P | AAL2 |
| `platform_roles.assign`, `platform_roles.revoke`, `role_versions.activate` | action | P | AAL2 |
| `permissions.view`, `permissions.grant`, `permissions.revoke`, `permissions.delegate` | action | P/O | AAL2 |
| `portal.access.grant`, `portal.access.revoke` | action | O | AAL2 |
| `audit.view`, `audit.export` | action | P/O | AAL2 |
| `org.name.read`, `member.role.read` | field | O | AAL1 |
| `member.role.update` | field | O | AAL2 |
| `audit.change_summary.read` | field | P/O | AAL2 |

`org.members.status.change` covers activation and suspension. It does not replace role-change or revocation permission.

The AAL1 recovery self-request remains a fixed exception. The general evaluator does not provide that exception.

All identity, platform-role, role-version, organization-lifecycle, portal-grant, delegation, and `admin.access` operations require an active internal platform role.

An internal user also needs active membership and an explicit organization-scoped `workspace.access` allow to enter a customer or vendor organization.

Platform assignment history keeps a principal internal. A revoked assignment or inactive role version denies access instead of converting that principal to external membership.

Every organization permission requires the same organization's `workspace.access` permission.

Platform `admin.access` requires platform `workspace.access`. Other platform permissions also require `admin.access`.

Internal-only organization permissions require platform `admin.access` in addition to the organization workspace gate.

These fixed parent gates apply before any child allow. Parent retirement, metadata drift, and explicit denial block child access.

Portal permission requires the matching organization type and an active portal grant.

Portal revocation blocks the portal feature. Later portal resources must require that feature as well as their action permission.

The shared organization-read set is `workspace.access`, `org.name.read`, and `member.role.read`.

| Role | Explicit defaults |
|---|---|
| `super_admin` | All 30 configured keys, stored individually |
| `admin`, `staff` | Shared read set and `admin.access` |
| `organization_admin` | Shared read set, both portal keys, the five `org.members.*` keys, `member.role.update`, and scoped `audit.view` |
| `contributor`, `viewer` | Shared read set and both portal keys |

All other defaults deny. Later domain modules will separate Contributor and Viewer actions.

An explicit override takes priority over role defaults. A matching role-default deny takes priority over another role-default allow.

A delegation ceiling never grants permission use by itself. Permission administration needs its action permission and the separate target-specific ceiling.

New version-two roles hold these defaults. Version-one content remains immutable and available for reviewed reactivation.

The first package adds no security mutation grants, recovery activation, or worker commands.

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

The worker cannot use any generic identity-state, organization-state, platform-role, or active-role-version command.

Only the fixed reset-intent claim can move its exact approved target from active to recovery_pending.

Every other worker identity-state transition must fail.

### 6.5.1 R1.4 Command Decisions

These decisions define the next command package. They do not activate a mutation or weaken the existing evaluation gates.

#### Serialized authority

Every security writer must update one existing private guard row before reading authority.

The update must change a transactional revision. A missing guard row must deny the command.

Use fixed `VOLATILE` command functions with an empty search path.

Read authority in a separate statement after the guard update. Capture the authorization time after any lock wait.

Recheck identity, actual AAL2, expiry, permission, scope, and applicable delegation ceilings before changing data.

Recompute effective administration after the proposed change. Write the audit event and command receipt in the same transaction.

Bootstrap, identity synchronization, recovery transitions, and later security migrations must use the same guard.

Propagate serialization failures. Retry only through a new complete transaction.

An advisory lock or unchanged row lock does not replace the revision update.

The revision update makes a stale Repeatable Read writer conflict with a committed security change.

Keep provider calls outside database transactions. Claim the exact durable intent before external dispatch.

#### Durable administration

Capacity requires active, reviewed identities, verified email, and current verified MFA enrollment.

A previous AAL2 token alone does not prove current enrollment.

Evaluate durable permission capability at AAL2. Separately validate the command actor's actual assurance.

Do not count an expiring positive override or an expiring delegation ancestor as durable capacity.

Apply every current matching deny, including a deny that expires later. Require durable positive authority for every parent gate.

Both approved stable Super Admin bindings must independently retain these platform permissions:

`workspace.access`, `admin.access`, `identity.status.change`, `identity.relink`, `identity.recovery.request`, `identity.recovery.approve`, `org.status.change`, `org.type.change`, `platform_roles.assign`, `platform_roles.revoke`, `role_versions.activate`, `permissions.view`, `permissions.grant`, `permissions.revoke`, `permissions.delegate`, `audit.view`, `audit.export`, and `audit.change_summary.read`.

Each binding also requires an active `super_admin` assignment. Additional administrators cannot replace either approved binding.

Each active organization requires an active, reviewed `organization_admin` membership with these durable permissions in that organization:

`workspace.access`, `org.name.read`, `member.role.read`, `member.role.update`, `org.members.view`, `org.members.invite`, `org.members.change_role`, `org.members.status.change`, `org.members.revoke`, and `audit.view`.

The role label is necessary but insufficient. An expired grant, denied field, or denied feature can remove effective capacity.

Do not include portal feature access in organization administration capacity. Portal grants remain separate.

Check every active organization after a global security change. Pending organizations do not provide capacity.

Keep the approved fixed recovery exception. Do not create another one-person bypass.

#### Four delegation limits

Add independent `can_view`, `can_grant`, `can_revoke`, and `can_delegate` flags. Each flag defaults to false.

| Capability | Required action | Limit |
|---|---|---|
| View | `permissions.view` | Read covered permission-administration metadata |
| Grant | `permissions.grant` | Increase authority, including adding an allow or removing a deny |
| Revoke | `permissions.revoke` | Reduce authority, including adding a deny or removing an allow |
| Delegate | `permissions.delegate` | Issue a bounded child ceiling; this does not grant permission use |

No capability implies another. Restrict these administrative ceilings to the approved internal administration workflow.

A delegated grant must store its parent. Its issuer must equal the parent's grantee.

Require the same permission key and exact scope. The child can contain only capabilities present in its parent.

Issuance also requires `can_delegate`. A child cannot outlive any ancestor.

Invalidate positive delegated authority when its required ancestor becomes invalid.

Store the source ceiling on an allow issued through delegated authority. That allow cannot remain effective after its source chain becomes invalid.

Keep an issued deny effective until its explicit revocation or recorded expiry. Losing issuer authority must not silently remove a deny.

Mixed replacements must pass both increase and decrease checks.

Reject direct self-changes and changes to an ancestor that supplies the actor's authority.

Reject delegation cycles across keys, scopes, and capabilities, not only cycles inside one permission key.

Role assignments also form authority edges. A recipient cannot change the ancestor that assigned their active platform role.

Delegated role changes require the applicable increase or decrease ceilings for every explicit permission default in the role bundle.

Adding an allow or removing a deny requires grant authority. Adding a deny or removing an allow requires revoke authority.

Only a current Super Admin can issue or remove the Super Admin role, which carries independent ceiling authority.

Delegated role-version changes require both ceilings for every affected principal and scope. Shared-role changes cannot affect the actor.

Shared-role changes also cannot affect an authority ancestor. This restriction includes a Super Admin acting without delegated ceilings.

Removing a delegated deny must retain its grant-authority source until the original deny expires.

A replacement ceiling cannot restore access through that removed deny.

An explicit override deny has higher priority than role defaults. A later allow-only write cannot remove its source dependency.

A new, authorized deny followed by its authorized removal can record a new source. Both actions require audit evidence.

A removed role-default deny does not override a separate, authorized user allow. New role authority must also pass its own source checks.

#### Command and record scopes

Organization-only keys require an exact organization override or ceiling. Platform-only keys require platform scope.

For dual-scope keys, platform allows and ceilings authorize platform use only. Organization allows and ceilings require the exact organization.

Retain inherited platform denies for dual-scope keys. Never ignore an unsupported deny and thereby increase access.

Retain unsupported existing records for review. Deny affected access until an authorized correction resolves them.

The next migration must update evaluator semantics and tests before these command grants open.

Keep command authority separate from the target record scope.

A platform permission-administration command can manage an explicitly covered organization grant without giving its actor tenant-data access.

#### Initialization and shared roles

Expand bootstrap storage to two immutable stable targets before completion can run. Never infer the second target from an existing row.

Preserve consumed bootstrap state. Require explicit review for any earlier single-target prepared state.

Use a fixed organization-initialization command for pending organizations. Add explicit initialization authority before exposing that command.

September 8 product-owner exception: a verified customer may automatically create one
new private customer workspace. The fixed caller-only command may activate a new or
reviewed, otherwise unassigned identity and grant contributor access to that new
workspace. It cannot claim existing organizations, restore revoked access, clear
review or containment flags, or grant staff, vendor, or administration authority.
The caller must have a live verified session; AAL1 is sufficient for this fixed setup.
Single-customer workspaces without administrative roles do not require a customer
administrator with MFA. Other organizations and the platform retain existing
administrator-capacity requirements. Serialize setup and write its audit and receipt
atomically. Database and real-session evidence are required before enabling this flow.

Require reviewed organization facts and an explicitly approved initial administrator. Do not infer membership creation from `org.status.change` alone.

Create or validate the required membership and durable grants atomically. Activate the organization only when post-change administration checks pass.

Do not weaken ordinary organization authorization to admit pending organizations.

Application role-version activation must deny a change to a stable role that affects the acting identity.

Use reviewed owner migrations for those shared-role changes. They must retain serialization, audit, and post-change capacity checks.

#### Retry contract

Add an immutable command receipt with a unique actor, command, and idempotency key.

Bind the receipt to a digest of the complete validated request. Reject key reuse with different input.

The digest includes every mutation input, including reason and expected effect. Correlation IDs are transport context, not mutation input.

An identical retry can use a new correlation ID. Keep the original correlation ID in the immutable event referenced by the receipt.

Do not use the audit table's non-unique idempotency field as the command deduplication boundary.

#### Recovery and worker continuation

The next additive package stores each intent's original correlation, initiating identity, and fixed provider subject.

Legacy intents without that complete context cannot dispatch. Do not infer their missing authority or target binding.

Use three fixed worker mutation functions: `mmhr_claim_identity_intent`, `mmhr_claim_identity_intent_reconciliation`, and `mmhr_record_identity_intent_result`.

Claim arguments contain only an intent ID. Result arguments contain only the intent ID, current opaque lease token, and an allowlisted outcome.

Each claim creates an attempt record with a unique lease token and a fifteen-minute deadline. Permit at most five total attempts.

An expired dispatch lease becomes `outcome_unknown`. The next claim permits provider reads only, never another unconfirmed write.

Only invitation delivery can retry a write after a confirmed `provider_rejected` result marked safe. Preserve its original idempotency key.

An MFA reset can dispatch only once. A failed reset remains terminal. Unknown outcomes permit reconciliation, not another reset.

Accept a late result only while its lease token remains current. A newer claim fences every earlier result.

Result recording must check the stored operation and current provider facts. Zero factors of every status are required for reset success.

Keep attempt identity and completed outcome fields immutable. A lost acknowledgement cannot restore dispatch eligibility.

Store an authorization timestamp on the target when reset dispatch starts. Reject tokens issued before or within that timestamp's second.

Keep that timestamp after reactivation. Fresh replacement-factor verification cannot revive an earlier AAL2 token.

Reject refreshed tokens from every other Auth session created before the reset fence.

The bound recovery session can remain usable only after the exact reset and replacement-factor completion records prove reactivation.

Bind that exception to the current fence and original dispatch attempt. An earlier recovery cannot authorize a later reset.

Require complete, ordered attempt history before a retry, reconciliation claim, or result write. Missing or conflicting history must deny access.

Validate UUID metadata against the worker contract before any lease or containment write.

Lock the target Auth user before the final zero-factor check. Hold that lock through the atomic result and request update.

Verify that the provider factor foreign key makes concurrent enrollment wait for this lock. Do not change provider schema.

Use Read Committed transactions for worker result recording. Reject older transaction snapshots that can hide a committed provider factor.

While any identity is recovery_pending, deny every AAL2 permission at the request boundary, including privileged reads.

Keep ordinary authorized AAL1 reads available for other active identities. Internal capacity checks do not grant request access.

Recovery presence stores its verified Auth subject and session binding. Neither value can be supplied as a browser-selected provider target.

An owner-only preparation record binds the approved pair to the phone procedure and its operations and rehearsal references.

That setup adds no recovery approver. Each request still requires only the other named Super Admin's approval.

Keep recovery disabled until this preparation and all required verification pass. Store opaque reference IDs, never phone numbers or call content.

#### Durable worker delivery

Use the existing intent ledger as the transactional outbox. An external enqueue acknowledgement must not control dispatch eligibility.

Add one fixed read-only discovery function: `mmhr_list_identity_intent_candidates()`.

It returns at most five due intent IDs. It accepts no actor, provider target, operation, state, or query input.

Verify the actual expiring worker login, worker-role constraints, and absence of raw table or schema-creation rights before discovery.

Filter invalid, terminal, busy, and future work. Include expired leases so the existing reconciliation command can finish or contain them.

Keep the three mutation commands authoritative. A discovered ID is not a claim, permission, or provider-write authorization.

Run one scheduled Trigger task each minute, with one queue slot and no automatic task retry.

Process each discovered ID once per run. Use the existing dispatcher for claims, provider calls, and result recording.

Keep `IDENTITY_INTENT_WORKER_ENABLED` disabled until the target environment passes its migration, identity, and provider checks.

Report storage failures and operator-review outcomes explicitly. Log only intent IDs, fixed outcome codes, and counts.

Validate empty, invalid, duplicate, concurrent, expired, terminal, failed, and recovered work. Verify the Trigger build and server-only boundary.

Recovery disables the worker flag and schedule. It preserves intents, attempt history, containment, and the previous compatible application.

These delivery decisions use the active full-delivery goal's implementation authority. They do not record production activation or human recovery evidence.

#### Fixed recovery command inputs

Generate each recovery reference from 32 random bytes on the server. Store only its SHA-256 digest.

Use fixed reason codes: `lost_factor`, `compromised_factor`, and `replace_device`.

Bind command receipts to all semantic input. Represent phone-check time as an absolute timestamp, independent of database time zone.

An explicit retry must retain its original reference and idempotency key in memory. A lost reference requires a new key.

Presence creation can replace only the current caller's unlinked presence in the same verified session.

It can also expire that session's linked request after its deadline, but only before dispatch starts.

Record request, intent, and presence changes with audit events in the same transaction. Never extend an old deadline or reuse its reference.

#### Bound replacement-factor completion

Expose one caller-bound context read, one expected-factor registration command, and one recovery reactivation command.

The provider enrollment and challenge calls must use the verified caller's Auth client. Never accept another provider subject or session.

Register only one new TOTP factor created after the successful reset. Store its ID, not its secret.

Factor registration keeps the identity contained. Its fixed command writes an audit event and receipt without restoring administrator capacity.

Reactivation requires fresh AAL2 from the bound session and exactly one verified factor with that recorded ID.

Lock the target Auth user, session, and factor rows before final checks. Use Read Committed transactions for these fixed writes.

Restore active status, complete the presence, verify full administration capacity, and write audit and receipt in one transaction.

Permit an identical completion retry only after the current bound-session proof passes again. Reject other sessions and changed input.

### 6.6 Deterministic Authorization

AI output must never evaluate permissions, select roles, create grants, approve identity actions, or influence RLS.

Authorization must depend only on verified identity and stored deterministic policy state.

R5 through R9 must repeat tests that prove AI code cannot change authorization results.

### 6.7 First Super Admin Bootstrap

The bootstrap must exist only as `scripts/r1-bootstrap-super-admin.mjs`.

Do not expose it through a page, action, handler, procedure, worker, or public database function.

Both approved targets must supply current AAL2 access tokens through standard input.

The script must verify each token with `getClaims()` and keep both tokens only in memory.

Each verified identity must match its approved stable identity binding.

Use two distinct targets in one atomic bootstrap. A single-target bootstrap cannot satisfy section 6.2.

The fixed completion function may activate both approved pending identities as part of that same transaction.

It must create both assignments, consume the state, and write all audit events together.

A failure must create neither assignment and must not activate either identity.

The script must require distinct product and security approval references.

Its prepare mode must store both targets and distinct product-security approval references without granting access.

Prepared bindings are immutable. Display names and email addresses cannot select or replace a target.

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
| `identities` | Add stable identities, unique nullable Auth links, normalized email, verification time, recovery-aware status, and synchronization time | Keep non-archived verified emails unique; authorize recovery_pending only for fixed MFA enrollment and verification |
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
| `identity_admin_intents` | Add durable identity-service requests, recovery-reset results, and delivery state | Use unique idempotency keys, bounded retries, and `outcome_unknown` reconciliation |
| `identity_recovery_presence` | Add target, verified Auth session ID, opaque-reference hash, state, expiry, request link, and expected replacement factor ID | Permit one active presence per target session; never store an access token, refresh token, or factor secret |
| `identity_recovery_requests` | Add target, recovery-presence link, initiator, immutable action, reason, expiry, and status | Allow only MFA enrollment reset; never accept or store a phone number |
| `identity_recovery_approvals` | Add distinct approver, decision, assurance, pre-existing-contact attestation, phone-check result, check time, and evidence reference | Require one valid approval from the other named Super Admin, who cannot be the target; never store the phone number or call content |
| `security_bootstrap_state` | Add singleton target, approval references, consumption state, and time | No reset through application or worker roles |
| `audit_events` | Add versioned, append-only, redacted security events | Mutation and audit must share one transaction |
| `audit_log` | Freeze the legacy table and mark its format | Preserve existing records |

### 8.1 State Transitions

Use these allowed transitions:

- Pending identity: active or archived
- Active identity: recovery_pending, suspended, or archived
- Recovery-pending identity: active only through fixed recovery reactivation; suspended or archived through emergency containment
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
- Pending recovery presence: linked, expired, or cancelled
- Linked recovery presence: completed or cancelled
- Completed, expired, and cancelled recovery presence: terminal
- Pending recovery request: approved, expired, or cancelled
- Approved recovery request: completed, expired, or cancelled
- Completed, expired, and cancelled recovery requests: terminal
- Pending recovery reset intent: in_flight or cancelled
- In-flight recovery reset intent: succeeded, failed, or outcome_unknown
- Outcome-unknown recovery reset intent: succeeded or failed only after provider reconciliation or manual review

An approved request with an in-flight or outcome-unknown intent cannot expire or cancel through another command.

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

1. The target establishes a verified Auth session and receives an opaque recovery reference bound to its session ID.
2. Either named Super Admin creates a 30-minute recovery request linked to that recovery presence.
3. The request names MFA enrollment reset and records a reason without accepting or storing a phone number.
4. Before approval, the other named Super Admin calls the target, who confirms the request and recovery reference.
5. The AAL2 approver records the call result, check time, and external evidence reference without evidence content.
6. The command rechecks approver authority, session binding, and the 30-minute expiry before approval.
7. One transaction consumes the approval, marks the request approved, creates an idempotent MFA reset intent, and writes audit events.
8. One fixed command atomically claims a pending intent linked to a still-approved, unexpired request.
9. The claim rechecks request and intent state, authority, target, action, session binding, and recovery capacity.
10. The claim marks the intent in flight, moves the target to recovery_pending, and writes an audit event.
11. The restricted worker then uses the original idempotency key for the external reset call.
12. The worker records success, confirmed failure, or `outcome_unknown` with audit evidence.
13. Only provider confirmation that no MFA factor of any status remains marks the reset intent succeeded and the request completed.

Partial factor removal or a verified or unverified factor enrolled during reset cannot produce success.

The only allowed recovery action is resetting the target's MFA enrollment by removing every MFA factor of any status.

Password reset remains in the normal identity-provider flow. Identity relink remains a separate two-person command.

Recovery cannot grant roles, permissions, memberships, organization access, or change account data outside the controlled recovery_pending lifecycle.

The request must fail before dispatch when the required approver loses authority.

After dispatch starts, the worker must record the external outcome even when authority changes.

Recovery cannot activate until both stable named identities are distinct, active, MFA-enrolled, and authorized.

Require both named Super Admins to be active and MFA-enrolled before request creation, approval, and dispatch claim.

Each person can hold request and approval authority, but cannot use both authorities on one request.

Every security mutation must recheck the two-person recovery capacity.

After dispatch claim, recovery_pending is a controlled fail-closed state that temporarily suspends that capacity.

During recovery_pending, deny old AAL2 sessions and every privileged action except fixed reset-result reconciliation and MFA enrollment verification.

Server checks, fixed database commands, and RLS must check current identity status before trusting an AAL claim.

Stop every new recovery request until the target verifies a replacement factor with a fresh AAL2 session.

If either person is unavailable, recovery must stop. No one-person application or local emergency bypass is approved.

A target Super Admin must establish recovery presence and start their own request. The other named Super Admin must verify the target.

For another target, the target establishes recovery presence. Either named Super Admin can start the linked request, and the other approves it.

Normal recovery requests require requester AAL2.

A lost-factor target must have verified AAL1 bound to their stable identity and Auth session ID.

The fixed recovery-presence command is the only AAL1 exception available to every recovery target.

A target Super Admin can use that presence to create only their own MFA reset request without AAL2.

AAL1 cannot approve, create an intent, dispatch, complete, or execute an MFA reset.

The approving Super Admin must call the target at the company-record phone number that existed before the request.

The approver must place the outbound call. The target must answer and confirm that they requested the MFA reset.

The approver cannot use a new number or a number supplied with the recovery request.

The approver must attest that the number existed in company records before the request.

The request must be denied when no pre-existing number exists, the target does not answer, or the target does not confirm the request.

A failed phone check records a denial decision and atomically moves the pending request to terminal `cancelled`.

That transaction also cancels the linked recovery presence.

The evidence reference is an opaque pointer to the operations record. It cannot contain the phone number or call content.

An unlinked recovery presence expires after 30 minutes. Linking it consumes its opaque reference for one request.

Linking must occur before the presence expires. The new request then receives its own 30-minute deadline.

Keep the presence's original creation and expiry times immutable. Its linked time must equal the request's creation time.

After linking, the request deadline controls approval and reset dispatch. The consumed reference cannot create another request.

Request cancellation or pre-dispatch expiry cancels its linked presence.

After reset success, the linked presence remains usable only by its bound session until reactivation or emergency containment.

If cancellation or expiry wins before the atomic claim, the claim must fail without calling the identity service.

After the intent is in flight, cancellation and expiry commands must not change the request.

The recorded provider outcome makes the next terminal request transition, even when the deadline passes during the call.

An `outcome_unknown` result blocks completion and another reset call until provider reconciliation or manual review confirms the outcome.

Confirmed success keeps the target recovery_pending and denies every old session, including a stale AAL2 token.

After reset success, only the bound Auth session can use the fixed MFA enrollment, challenge, and verification flow.

The enrollment command records the expected replacement factor ID without its secret.

Reactivation requires the bound session, a succeeded reset intent, completed request, exactly one total factor, the expected factor verified, and fresh AAL2.

Only the fixed recovery reactivation command can return recovery_pending to active. Generic identity-status commands must deny it.

A replacement requires an approved contract change, stable identity binding, active status, MFA enrollment, authorization, and a passed rehearsal before removal.

Never authorize recovery by comparing display names or email addresses.

Keep all recovery disabled until identity bindings, implementation, the phone-check procedure, and required tests are complete.

R1.0 approves the stable-ID binding method. R1.2 creates the identities and IDs. Create and verify the actual bindings before recovery activation.

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
| `identity_recovery_presence` | No direct Data API access; fixed recovery commands bind verified sessions and return redacted state |
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

R1.2 and R1.3 each add one reviewed additive migration.

R1.4 can use several focused additive migrations. Each must pass its own security, compatibility, and recovery checks before integration.

This change permits separate evaluation and command packages. It does not reduce any R1.4 requirement or authorize stacked pull requests.

Each database package must generate, review, and apply its migration before package validation.

### R1.0 — Approve the Security Contract

Completion status on 2026-08-28: complete.

The named interim two-Super-Admin pair and other-admin approval rule are approved.

The request expires 30 minutes after creation.

The only allowed recovery action is an MFA enrollment reset.

The lost-factor identity check is a phone call to the target's company-record number that existed before the request.

R1.4 and R1.5 route and MFA foundations are locally verified. Recovery activation remains blocked until target-environment approval.

Named owners:

| Role | Named owner | Responsibility |
|---|---|---|
| Product | Rob Speciale | Product behavior and final product decisions |
| Security | Rob Speciale | Authorization, private data, and technical risk |
| Engineering | Rob Speciale | Architecture, implementation, and technical recovery |
| Operations | Rob Speciale (temporary) | Business workflows and customer operations |

Interim recovery pair:

| Named Super Admin | Recovery rule |
|---|---|
| Rob Speciale | Can start an eligible request; Jason Reichard must approve it |
| Jason Reichard | Can start an eligible request; Rob Speciale must approve it |

The initiator cannot approve the same request. The approver cannot be the recovery target.

The rows above are subject to the target rule in Section 8.2.

No third recovery approver is required for this interim model.

This model has no backup. Recovery stops when the required other Super Admin is unavailable.

Outcome:

- Confirm the parent roadmap records the approved Section 2 amendment.
- Name the product, security, engineering, and operations owners.
- Record security, engineering, and operations approval for their areas.
- Confirm the product owner approved the Section 5 defaults.
- Approve the permission registry and role matrix.
- Approve audit redaction and retention rules.
- Approve identity, intent, and recovery redaction and retention rules.
- Approve the first Super Admin bootstrap procedure.
- Approve the named Super Admin pair, other-admin approval, expiry, and allowed recovery actions.
- Approve the lost-factor independent identity-check procedure.
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
- No unresolved recovery-policy decision

R1.0 is complete. R1.2 schema implementation can start.

Recovery remains disabled until the required implementation and tests pass.

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
- AAL1 denial and AAL2 success except fixed recovery presence and target-Super-Admin self-request creation
- Field allowlist tests
- Separate view, grant, revoke, and delegate ceiling tests
- Direct and indirect delegation-cycle denial tests
- Self-escalation denial tests
- Transaction rollback when audit writing fails
- Audit immutability and sensitive-value rejection tests
- Two-Super-Admin direction, self-approval, target-approval, expiry, and pre-dispatch authority-loss tests
- Verified-AAL1 lost-factor request creation and wrong-identity denial tests
- Recovery-presence session binding, 30-minute expiry, single-use reference, and wrong-session denial tests
- Recovery records never store access tokens, refresh tokens, factor secrets, or raw opaque references
- Request-supplied or missing pre-existing company-contact denial tests
- No-answer and unconfirmed-request phone-check denial with atomic request-and-presence cancellation
- Phone-check result, time, and evidence-reference tests
- Phone-number and call-content non-storage tests
- Expiry-before-dispatch request-and-presence cancellation without an identity-service call
- Expiry-during-dispatch result recording and confirmed-success completion
- Authority-change-during-dispatch result recording without another identity-service call
- Cancel-versus-dispatch and expire-versus-claim concurrency tests
- Atomic dispatch claim requires approved request, pending intent, valid authority, exact action, and unexpired deadline
- Reset-intent idempotency, `outcome_unknown`, provider reconciliation, and duplicate-call prevention tests
- Multiple factors with mixed status, partial deletion, and factor-enrollment-during-reset tests
- Reset success requires provider confirmation that zero MFA factors of any status remain
- Pre-existing and concurrently enrolled unverified-factor removal tests
- Dispatch claim moves the target to recovery_pending before the identity-service call
- Recovery-pending state denies stale AAL2 tokens, privileged actions, and every new recovery request
- Every invalid recovery-state transition test
- Recovery cannot change roles, permissions, memberships, or organization access
- Worker command allowlist tests
- Worker identity-state denial except the exact active-to-recovery_pending reset-intent claim
- Worker database-role property tests
- Worker credential non-disclosure, concurrent provisioning, expiry, renewal, child-process injection, and cleanup tests
- Concurrent role-version activation tests
- Existing-assignment propagation and prior-version reactivation tests
- Duplicate, concurrent, revoke, and reassign platform-role assignment tests
- Identity and organization state permission, AAL2, audit, concurrency, and worker-denial tests
- Two-active-Super-Admin and affected-organization-administrator protection during concurrent identity-state changes
- Effective-administrator protection during role-version, override, delegation, and assignment changes
- Recovery-capacity checks that preserve both named Super Admins and the other-admin approval path
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
- Require AAL2 for every recovery approval and ordinary recovery request.
- Keep lost-factor recovery disabled until the approved phone identity-check procedure is implemented and tested.
- Require AAL2 for identity-state, role-version, platform-role, permission, and delegation commands.
- Require AAL2 for membership, invitation, portal-grant, and organization-state administration.

Validation:

- Unverified-email denial and verified-email success
- Server and interface password-policy parity tests
- AAL1 privileged denial except fixed recovery presence and target-Super-Admin self-request creation, and AAL2 success
- Unassigned-user denial
- Pending bootstrap target MFA access and every other protected-route denial
- Organization switching across two valid memberships
- Tampered and revoked organization-context denial
- Suspended and archived organization denial with an old active token
- Local Auth configuration matches the approved plan.
- Record staging and production parity as an R9 activation requirement.
- MFA enrollment failure and cancelled challenge
- Recovery-pending access permits only fixed MFA enrollment, challenge, and verification
- Replacement-factor enrollment and verification deny every session except the bound recovery session
- Replacement-factor verification and fresh AAL2 atomically restore active status and recovery capacity
- Failed or outcome-unknown reset intent denies replacement-factor enrollment and reactivation
- Extra verified factor and generic identity-status reactivation denial tests
- Old-token denial before and after replacement-factor verification
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
- Fewer-than-two-active-Super-Admins single-user and concurrent-revocation protection
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
- Approval by anyone except the other named Super Admin
- Approval by the recovery target
- Recovery authorization from a display name or email match
- Lost-factor recovery without verified AAL1 bound to the stable target identity and Auth session ID
- Expired, reused, forged, wrong-target, or wrong-session recovery presence
- Raw opaque reference, access token, refresh token, or factor secret in recovery records
- AAL1 recovery approval, reset-intent creation, dispatch, completion, or reset execution
- Request-supplied or missing pre-existing phone number
- Unanswered call or target failure to confirm the MFA reset request, with atomic terminal cancellation
- Missing phone-check result, check time, contact attestation, or evidence reference
- Stored phone number or call content in recovery records
- Cancellation or expiry racing an atomic reset-intent claim
- Cancellation, expiry, or duplicate dispatch after the reset intent becomes in_flight
- Privileged access or another recovery request while the target is recovery_pending
- Stale AAL2 access after the MFA factor reset
- Partial factor removal or verified or unverified factor enrollment racing the reset
- Replacement-factor enrollment or reactivation from an unbound Auth session
- Reactivation after a failed or outcome-unknown reset intent
- Generic identity-status transition from recovery_pending to active
- Security mutations that would leave fewer than two active named Super Admins outside the controlled recovery_pending transition
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

Before integration or migration work, capture `supabase status --output json` in memory.

Never print, paste, or retain raw status output. It can contain credentials and keys.

Emit only allowlisted project, host, and port facts.

If the project stack is stopped, capture `supabase start` output in memory. Then capture status again.

Verify the local project name, API host, and database port without printing secrets.

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
| Administrator lockout | One-time bootstrap, tested recovery command, and two active Super Admins before production | Use the approved other-admin recovery command; if the pair is unavailable, keep recovery and privileged commands disabled |
| Identity relink abuse | Unique Auth links, two-person approval, narrow actions, and immutable audit | Suspend the command, preserve evidence, and restore through an approved request |
| Role escalation | Deny precedence, delegation ceilings, and self-change blocks | Revoke the grant and preserve audit evidence |
| RLS recursion | Private helpers, pinned search path, and isolated policy tests | Disable the affected route and replace the policy safely |
| Migration backfill error | Additive schema, approved maps, and reconciliation | Roll back application reads and correct data forward |
| Invitation exposure | No application token, short expiry, verified email, one use, and revocation | Revoke immediately; replace only with product-security-operations approval |
| Identity-service partial failure | Durable intent, idempotency, bounded retry, and result events | Stop duplicate calls, record `outcome_unknown`, reconcile provider state, and require manual review when needed |
| Auth user deletion | Stable internal identity and non-cascading history links | Anonymize the Auth link and preserve authorization history |
| Audit data leakage | Allowlisted changes and sensitive-value rejection | Stop writes, restrict readers, and correct data under approved procedure |
| Audit write failure | One transaction for database mutation and audit | Roll back the mutation and stop the command |
| MFA lockout | Tested enrollment, separate recovery, stale-token denial, and two active Super Admins before recovery | Keep the target recovery_pending until fresh AAL2; stop privileged actions and further recovery; require manual review when re-enrollment fails |
| Phone verification error or spoofing | Outbound call to a pre-existing company record, target confirmation, other-admin AAL2 approval, and immutable audit | Deny or disable recovery, preserve evidence, and review the contact record before a new request |
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
- Unverified email and AAL1 cannot perform privileged operations except fixed recovery presence and target-Super-Admin self-request creation.
- Identity synchronization and relink controls pass their lifecycle and concurrency tests.
- Suspended and archived organizations deny old-token access.
- Recovery requires one current AAL2 approval from the other named Super Admin, who cannot be the target or initiator.
- Each recovery request expires after 30 minutes and permits only an MFA enrollment reset.
- Lost-factor recovery verifies the target through the approved call to the pre-existing company-record phone number.
- Lost-factor recovery requires verified AAL1 bound to the stable target identity and Auth session ID.
- Missing pre-existing numbers, unanswered calls, and unconfirmed requests deny recovery.
- Recovery records phone-check metadata without the phone number or call content.
- Recovery dispatch uses a durable idempotent intent and records external results before completion.
- Expired requests cannot start a reset, and uncertain results cannot trigger a duplicate reset call.
- Atomic dispatch claim moves the target to recovery_pending before the external reset call.
- Recovery-pending state denies stale AAL2 sessions, privileged actions, and every new recovery request.
- Replacement-factor verification with fresh AAL2 restores active status and two-person recovery capacity.
- Reset success requires provider confirmation that every MFA factor is removed and no factor of any status remains.
- Reactivation requires a succeeded reset, completed request, exactly one total factor, the expected factor verified, and fresh AAL2.
- Generic identity-status commands cannot reactivate a recovery-pending identity.
- Every security mutation preserves both active named Super Admins, except the controlled fail-closed recovery_pending transition.
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
| Parent roadmap v1.8 | Approved | Current Codex task, 2026-08-28 |
| Section 2 roadmap amendment | Approved | Product owner, current Codex task, 2026-08-24 |
| Product-owner R1 plan and defaults | Approved | Rob Speciale, current Codex task, 2026-08-24 |
| Security-owner R1 review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Engineering-owner R1 review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Operations-owner R1 review | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Interim recovery pair and other-admin approval rule | Approved | Product and security owner, current Codex task, 2026-08-27 |
| 30-minute recovery request expiry | Approved | Product and security owner, current Codex task, 2026-08-28 |
| MFA enrollment reset as the only recovery action | Approved | Product and security owner, current Codex task, 2026-08-28 |
| Lost-factor phone identity check | Approved | Product and security owner, current Codex task, 2026-08-28 |
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

The Not authorized rows above record the earlier approval state.

The 2026-08-30 full-delivery goal authorizes those normal project actions after their required verification.

This authority does not supply real administrator tokens, identity bindings, contact evidence, or approval references.

The rejected remote push still requires explicit approval of that write before retry.
