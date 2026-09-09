# R1 Authorization Matrix

## Control Record

| Field | Value |
|---|---|
| Status | Local R1.4 permission-evaluation foundation verified; full R1.4 remains open |
| Date | 2026-08-30 |
| Prior baseline | R1.3 grants, RLS, and request-scoped access recorded on `feature/r1-request-scoped-rls` on 2026-08-28 |
| Merge prerequisite | Stable-ID correction `dbac05f` is applied and locally verified; remote merge remains pending |
| Source registry | `src/server/auth/entry-point-inventory.ts` |
| Completeness test | `src/server/auth/entry-point-inventory.test.ts` |
| Identity guard | `src/server/auth/verified-identity.ts` |
| Permission service | `src/server/auth/authorization.ts` |
| Shared tRPC guard | `src/server/trpc/trpc.ts` |
| Recovery | Keep protected routes denied. Add a deny-all change before any rollback. |

This matrix records each application entry point that can expose, change, or process application data.

It also records the current framework monitoring hooks.

The R0 public-release gate remains separate from authorization.

Middleware refreshes sessions. It does not grant route access.

This record describes local implementation only. It does not claim a remote merge or deployment.

## Response Contract

| Condition | Response |
|---|---|
| Missing, invalid, or expired identity | Redirect to `/sign-in` before protected content renders |
| Verified identity at `/home` | Show pending access only |
| Verified identity at `/admin` | Return the generic 403 response |
| tRPC mutation without POST or exact canonical Origin | Return `FORBIDDEN` before input or permission processing |
| Permission-protected tRPC call without identity | Return `UNAUTHORIZED` after any mutation transport check |
| Malformed permission scope | Return `BAD_REQUEST` |
| Denied platform permission | Return generic `FORBIDDEN` |
| Denied organization permission | Return generic `NOT_FOUND` |
| Inaccessible future resource identifier | Return the generic not-found response |
| Public content | Apply R0 release control, but no R1 permission gate |

`getClaims()` supplies the verified subject.

The verified `aal` claim supplies the authentication assurance level.

Claims alone do not prove active identity state, organization membership, or permission.

R1.3 supplies stored-state reads. The local R1.4 evaluator adds current permission, scope, and assurance checks.

Protected page activation remains pending. `/home` still shows pending access, and `/admin` still returns the generic 403 response.

## Local R1.4 Permission-Evaluation Foundation

The [permission-evaluation record](./r1-permission-evaluation.md) describes the local policy and migration package.

The typed registry defines permission keys, allowed scopes, minimum assurance, and explicit role defaults.

The server service repeats verified-claims checks for each call. It invokes the caller-bound `mmhr_authorize(permission_key, organization_id)` function.

The function accepts no actor identifier. Its narrow result contains the stable identity ID, authorized organization ID, and assurance level.

The service validates that result against the requested scope and verified assurance. It does not use a service credential or direct database pool.

Permission-aware tRPC builders require a complete input schema, a permission key, and a scope resolver.

They resolve scope only after input validation. They expose only query and mutation terminals, so later input transforms cannot change the authorized scope.

The tRPC context uses one cookie-authenticated request client. The permission service rechecks that same client.

`health.whoami` remains identity-only. No application router now exposes a permission-protected operation or mutation.

The stable-ID correction at `dbac05f` is applied and locally verified for the
existing request-scoped helper. Remote merge remains a prerequisite.

This package is a permission-evaluation foundation, not full R1.4.

R1.4 command, recovery, identity-adapter, and worker implementations are locally verified. Route activation and MFA foundations are now in R1.5.

The inventory also classifies command support modules. They validate inputs or receipts and provide no independent authority.

## Validation Evidence

### Historical R1.1 through R1.3 evidence

The unit suite covers identity parsing, direct guards, tRPC denial, entry discovery, and exact-origin Server Actions.

The local integration suite rejects malformed and tampered expired tokens against the MMHR Supabase stack.

Local HTTP checks redirected malformed and expired cookie requests for `/home` and `/admin` to `/sign-in`.

Browser checks proved sign-up, pending access, sign-out, sign-in, and the authenticated 403 response.

The browser extension produced unrelated message-channel errors during one sign-up check.

### Local R1.4 evidence

Registry and service tests cover permission keys, scope validation, assurance checks, caller-bound RPC use, and denied or malformed results.

tRPC tests cover validated scope resolution, transformed input types, AAL1 privileged denial, generic organization denial, and mutation transport rejection.

The transport tests call both procedure builders and the installed fetch adapter. They preserve direct identity-only query callers.

`src/server/auth/authorization-boundaries.test.ts` checks production imports for fixture, direct-pool, and privileged-credential violations.

Its synthetic cases prove detection. Exact existing fixture exceptions do not authorize a future provider adapter.

`src/server/auth/permissions.integration.test.ts` and migration rehearsals cover database policy, field filtering, scope isolation, and registry parity.

Type checking, lint, the production build, focused unit tests, and local integration rehearsals passed. The latest unit run passed 271 files and 2,739 tests. The complete integration run passed 82 files and 678 tests.

The [verification record](./r1-permission-evaluation.md#local-verification-record) includes migration, audit-failure, containment, review, and test-retry evidence.

No rendered behavior changed. Historical browser evidence does not prove these new database controls.

These results prove local evaluation behavior only. Command, remote, staging, and production checks remain open.

## Entry Point Inventory

| Key | Surface | Kind | Access | Permission | Scope | Data path | Denial evidence |
|---|---|---|---|---|---|---|---|
| `src/app/(marketing)/(site)/page.tsx#default` | / | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/about/page.tsx#default` | /about | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/blog/page.tsx#default` | /blog | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/blog/[slug]/page.tsx#default` | /blog/[slug] | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/broker-model/page.tsx#default` | /broker-model | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/case-studies/page.tsx#default` | /case-studies | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/case-studies/[slug]/page.tsx#default` | /case-studies/[slug] | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/contact/page.tsx#default` | /contact | page | public | none | none | public lead form; fixed DTO to exact-origin lead route; redacted status | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/faq/page.tsx#default` | /faq | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/partners/brokers-consultants/page.tsx#default` | /partners/brokers-consultants | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/partners/pe-vc/page.tsx#default` | /partners/pe-vc | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/partners/software-vendors/page.tsx#default` | /partners/software-vendors | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/platform/page.tsx#default` | /platform | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/privacy/page.tsx#default` | /privacy | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/page.tsx#default` | /resources | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/hris-landscape-report/page.tsx#default` | /resources/hris-landscape-report | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/partner-finder/page.tsx#default` | /resources/partner-finder | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/resources/requirements-builder/page.tsx#default` | /resources/requirements-builder | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/services/page.tsx#default` | /services | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/terms/page.tsx#default` | /terms | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/(site)/transparency/page.tsx#default` | /transparency | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/designs/page.tsx#default` | /designs | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(marketing)/designs/[slug]/page.tsx#default` | /designs/[slug] | page | public | none | none | checked-in public content | R0 release gate; no R1 permission gate |
| `src/app/(auth)/sign-in/page.tsx#default` | /sign-in | page | public | none | none | Supabase Auth sign-in form | public by R1 contract |
| `src/app/(auth)/sign-up/page.tsx#default` | /sign-up | page | public | none | none | Supabase Auth sign-up form | public identity creation; protected access stays denied |
| `src/app/(auth)/pending-access/page.tsx#default` | /pending-access | page | identity-only | none; verified identity and current account state | caller identity | caller-only account setup RPC; generic verification or access guidance | pending-access page and setup RPC tests; blocked identities denied |
| `src/app/(auth)/invitations/accept/page.tsx#default` | /invitations/accept | page | identity-only | none; caller-bound invitation read and acceptance commands | verified caller and matching pending invitations | fixed invitation read RPC; token-free invitation acceptance form | invitation acceptance page and action tests; SQL read and accept functions |
| `src/app/(app)/invitations/new/page.tsx#default` | /invitations/new | page | privileged | org.members.invite; AAL2 | selected organization | permission-checked invitation form; audited tRPC command | new invitation page and form tests; invitation router tests |
| `src/app/(app)/invitations/loading.tsx#default` | /invitations loading boundary | boundary | public | none; static loading text only | no organization data | static loading status before the page permission check | manual anonymous browser loading state followed by sign-in redirect |
| `src/app/(app)/invitations/page.tsx#default` | /invitations | page | privileged | org.members.view; separate invite and revoke controls; AAL2 | selected organization | permission-bound invitation read; audited tRPC resend and revoke | invitation list and controls tests; invitation router and database tests |
| `src/app/(app)/members/loading.tsx#default` | /members loading boundary | boundary | public | none; static loading text only | no organization data | static loading status before the page permission check | member page tests; no data access in loading boundary |
| `src/app/(app)/members/page.tsx#default` | /members | page | privileged | org.members.view; separate role, status, and revoke checks; AAL2 | selected organization | permission-bound paginated read; fixed audited membership commands | member page/control tests; membership router and database integration tests |
| `src/app/(app)/workspaces/page.tsx#default` | /workspaces | page | caller-only | workspace.access per returned organization | caller-authorized active memberships | fixed membership RPC; field-filtered organization list; authorized selection action | workspace page and action tests; SQL membership read tests |
| `src/app/(app)/home/page.tsx#default` | /home | page | privileged | workspace.access or admin.access | selected organization or platform | authorized workspace shell | page guard and home page permission tests |
| `src/app/(app)/customer/layout.tsx#default` | customer portal layout | layout | privileged | portal.customer.access | selected organization | customer portal children after organization authorization | customer layout guard tests |
| `src/app/(app)/customer/loading.tsx#default` | /customer loading boundary | boundary | public | none; static loading text only | no organization data | static loading status and navigation; no record reads | customer loading component test; anonymous browser verification pending |
| `src/app/(app)/customer/page.tsx#default` | /customer | page | privileged | portal.customer.access; workspace.access for saved reads; intake.draft.save and intake.requirement.save for their respective forms | selected organization | request-scoped intake and requirement reads; separate action-gated draft and requirement forms; query IDs never supply organization authority | customer page, requirement navigation, layout, form and scoped read tests; live database/browser evidence pending |
| `src/app/(app)/vendor/layout.tsx#default` | vendor portal layout | layout | privileged | portal.vendor.access | selected organization | vendor portal children after organization authorization | vendor layout guard tests |
| `src/app/(app)/vendor/page.tsx#default` | /vendor | page | privileged | portal.vendor.access | selected organization | vendor portal shell | vendor page and layout guard tests |
| `src/app/(admin)/admin/page.tsx#default` | /admin | page | privileged | admin.access | platform | authorized administration shell | page guard, forbidden response, and admin page permission tests |
| `src/app/(auth)/mfa/page.tsx#default` | /mfa | page | identity-only | none; Auth MFA enrollment | verified identity | caller-only account setup RPC; Supabase Auth TOTP enrollment and challenge | MFA page guard and component tests |
| `src/app/layout.tsx#default` | root layout | layout | public | none | none | shared presentation providers | authorization remains at each protected entry point |
| `src/app/(marketing)/(site)/layout.tsx#default` | marketing layout | layout | public | none | none | public site chrome | R0 release gate |
| `src/app/global-error.tsx#default` | global error | boundary | framework | none | none | redacted error response and Sentry event | does not return protected records |
| `src/app/forbidden.tsx#default` | 403 boundary | boundary | framework | none | none | generic forbidden response | Next.js forbidden response |
| `src/app/not-found.tsx#default` | 404 boundary | boundary | framework | none | none | generic not-found response | does not reveal resource existence |
| `src/middleware.ts#middleware` | all matched requests | middleware | framework | none | none | R0 release gate, GALLERY_ONLY routing, Server Action validation, session refresh | middleware tests; never the authorization boundary |
| `src/app/api/trpc/[trpc]/route.ts#GET` | GET /api/trpc/* | route-handler | public | procedure-defined | procedure-defined | tRPC query transport | each procedure owns its identity or permission test |
| `src/app/api/trpc/[trpc]/route.ts#POST` | POST /api/trpc/* | route-handler | public | procedure-defined | procedure-defined | tRPC transport; no routed mutations; shared POST and exact-Origin mutation guard | inventory and transport tests; all exported mutation builders require POST and exact Origin |
| `src/app/api/leads/route.ts#POST` | POST /api/leads | route-handler | public | none; database command boundary | unassigned public lead | exact-origin POST; fixed lead DTO; redacted response | lead route boundary tests; SQL idempotency and audit contract |
| `src/app/api/newsletter/route.ts#POST` | POST /api/newsletter | route-handler | public | none; provider-neutral consent boundary | newsletter subscriber | exact-origin POST; normalized email and consent timestamp; redacted response | route and Beehiiv adapter tests; missing configuration fails closed |
| `src/app/(auth)/actions.ts#signUp` | signUp | server-action | public | none | none | lead capture and Auth creation; verified-session caller synchronization and private customer setup | exact-origin, direct-action and setup failure tests; live workflow verification pending |
| `src/app/(auth)/actions.ts#signIn` | signIn | server-action | public | none | none | Auth session creation; caller-bound identity synchronization and private customer setup | exact-origin, direct-action and setup failure tests; live workflow verification pending |
| `src/app/(auth)/actions.ts#signOut` | signOut | server-action | caller-only | none | caller session | Supabase Auth session cleanup | exact-origin guard and direct-action tests |
| `src/app/(app)/workspaces/actions.ts#selectOrganizationAction` | selectOrganizationAction | server-action | caller-only | workspace.access | validated organization | exact-origin action; current permission decision; HttpOnly selection cookie | workspace selection action tests; SQL permission tests |
| `src/app/(auth)/invitations/accept/actions.ts#acceptInvitationAction` | acceptInvitationAction | server-action | caller-only | none; fixed acceptance RPC binds the verified caller and email | one pending invitation matched to the caller | exact-origin action; verified provider user; audited caller-bound invitation acceptance | invitation acceptance action tests; SQL acceptance function and receipt |
| `src/server/trpc/routers/health.ts#ping` | health.ping | trpc-procedure | public | none | none | liveness constant | public by R1 contract |
| `src/server/trpc/routers/health.ts#whoami` | health.whoami | trpc-procedure | identity-only | none | verified identity | caller subject identifier only | identityProcedure and direct-call tests |
| `src/server/trpc/routers/invitations.ts#mine` | invitations.mine | trpc-procedure | caller-only | none; verified caller | current caller pending invitations | fixed caller-bound invitation read | invitations.test.ts; invitation database integration checks |
| `src/server/trpc/routers/invitations.ts#create` | invitations.create | trpc-procedure | privileged | org.members.invite; AAL2 | one authorized organization | strict input; server-bound actor; audited invitation command | invitations.test.ts; invitation database integration checks |
| `src/server/trpc/routers/invitations.ts#resend` | invitations.resend | trpc-procedure | privileged | org.members.invite; AAL2 | one authorized organization | strict input; server-bound actor; audited invitation command | invitations.test.ts; invitation database integration checks |
| `src/server/trpc/routers/invitations.ts#revoke` | invitations.revoke | trpc-procedure | privileged | org.members.revoke; AAL2 | one authorized organization | strict input; server-bound actor; audited invitation command | invitations.test.ts; invitation database integration checks |
| `src/server/trpc/routers/memberships.ts#changeRole` | memberships.changeRole | trpc-procedure | privileged | org.members.change_role; AAL2 | one authorized organization and membership | strict input; fixed audited membership role command | memberships.test.ts; security-command-api.integration.test.ts |
| `src/server/trpc/routers/memberships.ts#changeStatus` | memberships.changeStatus | trpc-procedure | privileged | org.members.status.change; AAL2 | one authorized organization and membership | strict active or suspended status; fixed audited command | memberships.test.ts; security-command-api.integration.test.ts |
| `src/server/trpc/routers/memberships.ts#revoke` | memberships.revoke | trpc-procedure | privileged | org.members.revoke; AAL2 | one authorized organization and membership | fixed revoked status; audited command and matched receipt | memberships.test.ts; security-command-api.integration.test.ts |
| `src/server/trpc/routers/organizations.ts#changeStatus` | organizations.changeStatus | trpc-procedure | privileged | org.status.change; platform scope; AAL2 | one organization lifecycle target | strict input; fixed audited organization status command | organizations.test.ts; security command database tests; router integration pending |
| `src/server/trpc/routers/organizations.ts#changeType` | organizations.changeType | trpc-procedure | privileged | org.type.change; platform scope; AAL2 | one organization type target | strict input; fixed audited organization type command | organizations.test.ts; security command database tests; router integration pending |
| `scripts/r1-with-local-worker.mjs#command` | R1 worker wrapper | command | system-only | local migration owner role | loopback MMHR database | temporary worker login lifecycle; no application records | exact child-command, URL, role, expiry, and cleanup checks |
| `scripts/check-r1-integration-matrix.mjs#command` | R1 integration matrix checker | command | system-only | local repository read | checked-in integration test inventory | test file names only | deterministic allowlist comparison and command test |
| `scripts/check-r9-release-readiness.mjs#command` | R9 release evidence checker | command | system-only | local repository read | checked-in R9 evidence manifest | release check states and opaque evidence references | manifest schema validation and fail-closed release mode |
| `scripts/check-secret-scan.mjs#command` | repository secret scanner | command | system-only | local repository read | tracked source and configuration files | high-confidence credential pattern matches only | CI required check; documented local-placeholder exclusions |
| `scripts/r1-bootstrap-super-admin.mjs#command` | local Super Admin bootstrap | command | system-only | local loopback environment and two current AAL2 identities | local MMHR database only | bootstrap state and redacted completion status | local-only endpoint, input, claim, and single-use checks |
| `scripts/reconcile-drizzle-journal.mjs#command` | Drizzle journal reconciliation | command | system-only | local repository read and migration metadata write | checked-in Drizzle SQL and journal files | migration tags and monotonic journal timestamps only | deterministic SQL-to-journal reconciliation and schema check |
| `src/server/commands/security.ts#command` | security command clients | command | privileged | fixed command permission; current AAL2 | platform or validated organization | caller JWT RPC; atomic mutation, audit, and receipt | security.test.ts; SQL command integration suites |
| `src/server/commands/security-inputs.ts#command` | security input schemas | command-support | internal-only | none; validation only | server command inputs | strict schemas; no database access | security-inputs.test.ts; no authority or RPC input |
| `src/server/commands/permission-administration.ts#command` | permission administration read | command | privileged | permissions.view and independent can_view ceiling; AAL2 | exact permission key and record scope | caller JWT RPC; filtered administration metadata | permission-administration.test.ts; SQL read and ceiling tests |
| `src/server/commands/recovery.ts#command` | recovery command clients | command | caller-only | fixed recovery policy; AAL2 for approval and ending | verified caller and bound recovery reference | caller JWT RPC; server-memory reference; atomic audit and receipt | recovery.test.ts; recovery-presence.test.ts; SQL recovery tests |
| `src/server/commands/recovery-inputs.ts#command` | recovery input schemas | command-support | internal-only | none; validation only | server recovery inputs | strict schemas; no database access | recovery-inputs.test.ts; no caller identity or phone content input |
| `src/server/commands/recovery-receipt.ts#command` | recovery receipt parser | command-support | internal-only | none; validation only | fixed recovery command receipts | strict action and identifier allowlist; no database access | recovery.test.ts; rejects malformed and unexpected receipts |
| `src/server/commands/recovery-mfa.ts#command` | recovery MFA command clients | command | caller-only | fixed recovery context; fresh AAL2 for reactivation | verified caller and bound recovery session | caller JWT RPC; factor proof; atomic audit and receipt | recovery-mfa.test.ts; SQL recovery MFA tests |
| `src/server/commands/recovery-mfa-contract.ts#command` | recovery MFA schemas and receipts | command-support | internal-only | none; validation only | fixed recovery MFA inputs and responses | strict schemas and action allowlist; no database access | recovery-mfa-contract.test.ts; rejects extra authority inputs |
| `src/server/commands/lead-create.ts#command` | lead create command | command | public | none; fixed public capture contract | unassigned lead | strict DTO to mmhr_create_lead; idempotent result contract | lead-create.test.ts; database function validates, audits, and isolates records |
| `src/server/commands/invitation-administration.ts#command` | invitation administration contract | command-support | internal-only | organization invitation administration; current AAL2 required at the database command | one organization and invitation record | token-free invitation lifecycle plan; durable identity delivery intent | invitation-administration.test.ts; no direct database or provider access |
| `src/server/commands/invitation-database.ts#command` | invitation database command boundary | command | privileged | organization invitation administration; reviewed SQL functions enforce AAL2, scope, and receipts | one organization and invitation record | strict command DTO; fixed RPC names; generic failure mapping | invitation-database.test.ts; migration 0026 review and guarded empty-migration rehearsal |
| `src/server/commands/invitation-read.ts#command` | current invitation read command | command | caller-only | none; SQL binds the verified caller and returns allowlisted fields | matching verified email and active organizations | fixed RPC; no token or email response fields | invitation-read.test.ts; migration 0092 review |
| `src/server/commands/customer-registration.ts#command` | self-service customer registration | command | caller-only | verified email and live caller session; approved self-service policy | one new customer workspace; no administration rights | fixed RPC; guard, membership, audit, and receipt transaction; not yet wired | customer-registration.test.ts; database integration pending |
| `src/server/commands/identity-synchronization.ts#command` | prepared caller identity synchronization | command | caller-only | verified matching provider subject and confirmed non-anonymous account | caller identity only; no membership or permission grants | server-only adapter; caller-bound fixed RPC; integration evidence pending | identity-synchronization and account-setup tests; release remains gated on database evidence |
| `src/server/commands/organization-member-read.ts#command` | organization member read boundary | command | privileged | org.members.view; member.role.read for role fields | one authorized organization; reviewed active or suspended memberships | permission-bound fixed RPC; strict fields and bounded cursor pagination | organization-member-read.test.ts; r1-member-read.integration.test.ts; migration 0100 |
| `src/server/commands/intake-read.ts#command` | intake read boundary | command | privileged | workspace.access; AAL1 or AAL2 | one authorized organization; requested intake only | fixed read RPCs; strict projection; bounded cursor pagination | intake-read.test.ts; r3-intake-read.integration.test.ts; migration 0104 unapplied |
| `src/server/commands/requirement-read.ts#command` | requirement read boundary | command | privileged | workspace.access; AAL1 or AAL2 | one authorized organization and intake; active requirements only | fixed read RPC; strict customer projection; bounded cursor pagination | requirement-read.test.ts; r3-requirement-read.integration.test.ts; migration 0106 unapplied |
| `src/server/trpc/routers/intakes.ts#requirements` | intakes.requirements | trpc-procedure | privileged | workspace.access; AAL1 or AAL2 | one authorized organization and intake; active requirements only | strict query input; fixed requirement page read; no writes | intakes.test.ts; database integration pending |
| `src/server/trpc/routers/intakes.ts#saveDraft` | intakes.saveDraft | trpc-procedure | privileged | intake.draft.save; portal.customer.access; AAL1 or AAL2 | one authorized customer organization and editable intake | exact-origin POST; actor-free DTO; fixed audited draft save RPC | customer-intake-save.test.ts; database integration pending |
| `src/server/trpc/routers/intakes.ts#saveRequirement` | intakes.saveRequirement | trpc-procedure | privileged | intake.requirement.save; portal.customer.access; AAL1 or AAL2 | one authorized customer organization and draft intake requirement | exact-origin POST; actor-free DTO; fixed audited requirement save RPC | customer-requirement-save.test.ts; database integration pending |
| `src/server/trpc/routers/intakes.ts#list` | intakes.list | trpc-procedure | privileged | workspace.access; AAL1 or AAL2 | one authorized organization | strict query input; fixed intake page read; no writes | intakes.test.ts; database integration pending |
| `src/server/trpc/routers/intakes.ts#get` | intakes.get | trpc-procedure | privileged | workspace.access; AAL1 or AAL2 | one authorized organization and intake | strict query input; fixed intake detail read; no writes | intakes.test.ts; database integration pending |
| `src/server/commands/organization-invitation-read.ts#command` | organization invitation read boundary | command | privileged | org.members.view; member.role.read for role fields | one active reviewed organization | permission-bound fixed RPC; allowlisted fields and bounded cursor pagination | organization-invitation-read.test.ts; r1-invitation-command.integration.test.ts; migration 0099 |
| `src/server/commands/crm-database.ts#command` | CRM database command boundary | command | privileged | workspace.access; exact organization scope | one organization and contact or product record | strict command DTO; fixed CRM RPCs; audited receipts and optimistic revisions | crm-database.test.ts; CRM migration review and authenticated isolation rehearsal |
| `src/server/commands/crm-search-database.ts#command` | CRM search database boundary | command | privileged | workspace.access; exact organization scope | one organization and selected CRM resource | strict search DTO; fixed redacted CRM search RPC; stable cursor paging | crm-search-database.test.ts; CRM search migration review and authenticated isolation rehearsal |
| `src/server/commands/crm-export-database.ts#command` | CRM export approval command boundary | command | privileged | workspace.access for requests; audit.export for decisions; exact organization scope | one organization and export request or decision | strict export DTO; fixed request and decision RPCs; immutable approval audit and replay receipts | crm-export-database.test.ts; CRM export migration review and authenticated isolation rehearsal |
| `src/server/commands/crm-duplicate-database.ts#command` | CRM duplicate detection database boundary | command | privileged | workspace.access; exact organization scope | one organization and normalized duplicate rows | strict duplicate DTO; fixed review-only candidate RPC; no merge operation | crm-duplicate-database.test.ts; CRM duplicate migration review and authenticated isolation rehearsal |
| `src/server/commands/vendor-evidence-database.ts#command` | vendor evidence database command boundary | command | privileged | workspace.access for recording; audit.export for approval; exact organization scope | one organization and vendor evidence bundle | strict vendor source, fact, evidence, and approval DTOs; fixed audited RPCs; raw tables remain closed | vendor-evidence-database.test.ts; vendor evidence migration review and authenticated isolation rehearsal |
| `src/server/commands/vendor-source.ts#command` | vendor source registry command boundary | command | privileged | workspace.access; exact organization scope; actor identity match | one organization and one vendor profile source record | strict HTTPS source, owner, capture method, cadence, licensing, review, and retirement DTO; fixed audited RPC; raw tables remain closed | vendor-source.test.ts; migration review and authenticated isolation rehearsal |
| `src/server/commands/vendor-acquisition.ts#command` | vendor acquisition run command boundary | command | privileged | workspace.access; exact organization and source scope; actor identity match | one organization, active vendor source, and acquisition run | strict manual or automated acquisition DTO; provider-neutral adapter selection; fixed audited RPC; raw tables remain closed | vendor-acquisition.test.ts; migration review and authenticated lifecycle rehearsal |
| `src/server/commands/vendor-extraction.ts#command` | vendor extraction command boundary | command | privileged | workspace.access; exact organization scope | one organization, source, and bounded vendor evidence extraction | server-only AI service with versioned schema, source references, cost limit, and review-only output | vendor-extraction.test.ts; extraction contract and schema checks |
| `src/server/commands/lead-routing.ts#command` | lead routing database command boundary | command | privileged | workspace.access; exact organization scope | one lead, organization, and active owner | strict routing DTO; fixed audited RPC; owner membership and terminal-state checks | lead-routing.test.ts; lead routing migration review and authenticated isolation rehearsal |
| `src/server/commands/scorecard-database.ts#command` | scorecard entry database command boundary | command | privileged | workspace.access; exact organization scope | one organization, scorecard, and scorer identity | strict score entry DTO; fixed RPC; optimistic revision and immutable history | scorecard-database.test.ts; scorecard entry migration review and authenticated isolation rehearsal |
| `src/server/commands/candidate-transition.ts#command` | candidate transition database command boundary | command | privileged | workspace.access; exact organization scope | one organization and evaluation candidate | strict lifecycle DTO; fixed audited RPC; optimistic revision and approval-bound reactivation | candidate-transition.test.ts; candidate transition migration review and authenticated isolation rehearsal |
| `src/server/commands/candidate-add.ts#command` | candidate add database command boundary | command | privileged | workspace.access; exact organization scope | one organization, intake, and product candidate | strict candidate DTO; fixed audited RPC; initial five-candidate cap and reviewed additions | candidate-add.test.ts; candidate add migration review and authenticated isolation rehearsal |
| `src/server/commands/candidate-masking.ts#command` | candidate identity masking command boundary | command | privileged | workspace.access; exact organization scope | one organization and evaluation candidate identity record | strict mask and approval-bound unmask DTOs; fixed audited RPCs; raw mask table remains closed | candidate-masking.test.ts; candidate masking migration review and authenticated isolation rehearsal |
| `src/server/commands/comparison.ts#command` | evaluation comparison read boundary | command | privileged | workspace.access; exact organization scope | one organization, intake, and redacted candidate set | strict bounded comparison DTO; fixed masked read RPC; approved scorecard values only | comparison.test.ts; comparison migration review and authenticated isolation rehearsal |
| `src/server/commands/intake-save.ts#command` | saved intake command boundary | command | privileged | workspace.access; platform admin.access; internal AAL2 | one organization and intake revision | strict bounded intake DTO; fixed audited RPC; immutable intake history | intake-save.test.ts; intake save migration review and authenticated isolation rehearsal |
| `src/server/commands/customer-intake-save.ts#command` | customer draft intake save boundary | command | privileged | intake.draft.save; portal.customer.access; AAL1 or AAL2 | one authorized customer organization and editable intake revision | strict actor-free patch; fixed RPC; current permissions; immutable history and audit | customer-intake-save.test.ts; customer draft integration pending |
| `src/server/commands/customer-requirement-save.ts#command` | customer intake requirement save boundary | command | privileged | intake.requirement.save; portal.customer.access; AAL1 or AAL2 | one authorized customer organization and draft intake requirement revision | strict actor-free answers; fixed RPC; current permissions; preserved metadata and immutable history | customer-requirement-save.test.ts; customer requirement integration pending |
| `src/server/commands/matching.ts#command` | deterministic matching command boundary | command | privileged | workspace.access; exact organization scope | one organization, submitted intake, and approved rule version | strict matching DTO; fixed audited RPC; published vendor facts only | matching.test.ts; matching migration review and authenticated isolation rehearsal |
| `src/server/commands/matching-rule-approval.ts#command` | matching rule approval command boundary | command | privileged | workspace.access; exact organization scope | one organization and draft matching rule set | strict approval DTO; fixed audited RPC; approval-bound activation | matching-rule-approval.test.ts; matching rule approval migration review |
| `src/server/commands/comparison-export.ts#command` | comparison export request and decision boundary | command | privileged | workspace.access and audit.export; exact organization scope | one organization, intake, masked candidate set, and pending export | strict request and decision DTOs; fixed audited RPCs; separate reviewer | comparison-export.test.ts; comparison export migration review and authenticated isolation rehearsal |
| `src/server/commands/duplicate-product-review.ts#command` | duplicate product review command boundary | command | privileged | workspace.access; exact organization scope | one organization, intake, and candidate pair | strict duplicate DTO; fixed audited RPC; duplicate archival preserves review evidence | duplicate-product-review.test.ts; duplicate product migration review and authenticated isolation rehearsal |
| `src/server/commands/matching-rule-preview.ts#command` | matching rule preview command boundary | command | privileged | workspace.access; exact organization scope | one organization and matching rule set | strict preview DTO; fixed audited RPC; digest and bounded count only | matching-rule-preview.test.ts; matching rule preview migration review |
| `src/server/commands/scorecard-view.ts#command` | scorecard view command boundary | command | privileged | workspace.access; exact organization scope | one organization and scorecard | strict view DTO; fixed audited RPC; weighted aggregate and individual entries | scorecard-view.test.ts; scorecard view migration review and authenticated isolation rehearsal |
| `src/server/commands/initial-evaluation.ts#command` | initial evaluation command boundary | command | privileged | workspace.access; exact organization scope | one organization and submitted intake | strict initial-evaluation DTO; fixed audited RPC; bounded masked snapshot | initial-evaluation.test.ts; initial evaluation migration review and authenticated isolation rehearsal |
| `src/server/commands/scorecard-create.ts#command` | scorecard creation command boundary | command | privileged | workspace.access; exact organization scope | one organization, intake, and active candidate | strict scorecard DTO; fixed audited RPC; bounded weighted criteria | scorecard-create.test.ts; scorecard creation migration review and authenticated isolation rehearsal |
| `src/server/commands/requirement-update.ts#command` | requirement metadata command boundary | command | privileged | workspace.access; platform admin.access; internal AAL2 | one organization, intake, and requirement | strict requirement metadata DTO; fixed audited RPC; bounded evidence references and vendor response links | requirement-update.test.ts; requirement metadata migration review and authenticated isolation rehearsal |
| `src/server/commands/requirement-create.ts#command` | requirement creation command boundary | command | privileged | workspace.access; platform admin.access; internal AAL2 | one draft or in-progress intake and new requirement | strict bounded JSON; fixed audited RPC; immutable history and exact replay | requirement-create.test.ts; r3-requirement-write.integration.test.ts; migration 0105 unapplied |
| `src/server/commands/workspace-view.ts#command` | workspace snapshot view boundary | command | privileged | workspace.access; exact organization scope | one organization and workspace | strict workspace view DTO; fixed audited RPC; latest bounded snapshot only | workspace-view.test.ts; workspace view migration review and authenticated isolation rehearsal |
| `src/server/commands/workspace-comment.ts#command` | workspace comment command boundary | command | privileged | workspace.access; exact organization scope | one organization and workspace | strict bounded comment DTO; fixed audited RPC; customer or internal visibility | workspace-comment.test.ts; workspace comment migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-create.ts#command` | RFP version creation command boundary | command | privileged | workspace.access; exact organization scope | one organization, submitted intake, and RFP version | strict RFP draft DTO; fixed audited RPC; source revision binding and bounded sections | rfp-create.test.ts; RFP create migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-approval.ts#command` | RFP mandatory approval command boundary | command | privileged | rfp.approve; internal AAL2; exact organization scope | one organization and RFP version | strict approval DTO; fixed audited RPC; distinct reviewer and approval reference | rfp-approval.test.ts; RFP approval migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-amendment.ts#command` | RFP vendor-amendment command boundary | command | privileged | workspace.access for drafts; internal AAL2 rfp.approve for approval; exact organization scope | one organization, approved common RFP base, and active vendor | strict bounded amendment DTO; fixed audited RPC; immutable vendor-scoped versions and distinct approval | rfp-amendment.test.ts; amendment migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-distribution.ts#command` | RFP distribution command boundary | command | privileged | rfp.distribute; internal AAL2; exact organization scope | one organization, approved RFP version, and active vendor recipients | strict bounded recipient DTO; fixed audited RPC; deadlines, reminders, delivery references, and replay | rfp-distribution.test.ts; RFP distribution migration review and authenticated isolation rehearsal |
| `src/server/commands/ai-run.ts#command` | AI run recording and approval command boundary | command | privileged | workspace.access; exact organization scope; actor identity match | one organization and one provider-neutral AI run | strict metadata and hash DTO; fixed audited create, approval, and replay RPC; raw prompts and provider payloads excluded | ai-run.test.ts; AI run migration review and authenticated isolation rehearsal |
| `src/server/commands/ai-evaluation.ts#command` | AI provider-evaluation command boundary | command | privileged | admin.access; platform scope; actor identity match | platform evaluation record and fixture-set version | strict hashed fixture report DTO; fixed audited record, approval, and replay RPC; raw outputs excluded | ai-evaluation.test.ts; AI evaluation migration review and authenticated isolation rehearsal |
| `src/server/commands/deletion.ts#command` | deletion request and reviewer decision command boundary | command | privileged | workspace.access; exact organization scope; actor identity match | one organization, deletion request, and separate reviewer decision | strict retention-window DTO; fixed audited request, decision, and replay RPC; requester identity retained | deletion command tests; deletion migration review and authenticated isolation rehearsal |
| `src/server/commands/operational-evidence.ts#command` | operational availability and performance evidence command boundary | command | privileged | workspace.access; exact organization scope; actor identity match | one organization and one bounded availability or performance observation | strict redacted evidence DTO; fixed audited RPC; exact-request replay and route bounds | operational-evidence.test.ts; operational evidence migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-clarification.ts#command` | RFP clarification command boundary | command | privileged | workspace.access; exact organization scope | one organization and approved or distributed RFP version | strict ask, answer, and approval DTOs; fixed audited RPC; distinct MMHR approval and replay | rfp-clarification.test.ts; RFP clarification migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-response-ingestion.ts#command` | RFP response ingestion command boundary | command | privileged | workspace.access; exact organization scope | one organization, approved or distributed RFP version, and active vendor | strict signed metadata DTO; fixed audited RPC; provider replay protection and redacted response metadata | rfp-response-ingestion.test.ts; response-ingestion migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-response-normalization.ts#command` | RFP response normalization command boundary | command | privileged | workspace.access; exact organization scope | one organization, associated inbound response, RFP version, and active vendor | strict bounded extraction DTO; fixed audited RPC; pending state and replay-safe result | rfp-response-normalization.test.ts; response-normalization migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-response-review.ts#command` | RFP response review command boundary | command | privileged | workspace.access; exact organization scope | one organization and pending or reviewed response normalization | strict review, approval, and rejection DTOs; fixed audited transitions; distinct reviewer and MMHR approval | rfp-response-review.test.ts; response-review migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-response-clarification.ts#command` | RFP response clarification command boundary | command | privileged | workspace.access; exact organization scope | one organization, normalized response, and approved or distributed RFP version | strict clarification DTO; fixed audited ask and response RPC; deadline and resulting decision tracking | rfp-response-clarification.test.ts; response-clarifications migration review and authenticated isolation rehearsal |
| `src/server/commands/rfp-response-failure.ts#command` | RFP response failure command boundary | command | privileged | workspace.access; exact organization scope | one organization and optional inbound response or normalization | strict redacted failure DTO; fixed audited terminal failure RPC; retry metadata without raw response content | rfp-response-failure.test.ts; response-failures migration review and authenticated isolation rehearsal |
| `src/server/commands/workflow-communication.ts#command` | workflow communication command boundary | command | privileged | workspace.access; exact organization scope | one organization and provider-neutral communication record | strict recipient and association references; fixed audited queue and delivery RPC; replay-safe provider state | workflow-communication.test.ts; communication migration review and authenticated isolation rehearsal |
| `src/server/commands/evaluation-route.ts#command` | evaluation communication routing command boundary | command | privileged | workspace.access; exact organization scope; actor identity match | one organization and one deal evaluation route | strict MMHR-first route DTO; fixed audited route creation and final-selection transition RPC; direct route requires won deal | evaluation-route.test.ts; evaluation-routing migration review and authenticated isolation rehearsal |
| `src/server/commands/workflow-document.ts#command` | workflow document control command boundary | command | privileged | workspace.access; exact organization scope | one organization and immutable document version | strict quarantined metadata DTO; fixed audited upload, scan, approval, and archive RPC; bounded size and hash | workflow-document.test.ts; document-controls migration review and authenticated isolation rehearsal |
| `src/server/commands/workflow-document-search.ts#command` | workflow document search command boundary | command | privileged | workspace.access; exact organization scope; actor identity match | one organization and approved document metadata or extracted content | strict search and approved-content DTOs; fixed audited content update and search RPCs; bounded query and result size | workflow-document-search.test.ts; document-search migration review and authenticated isolation rehearsal |
| `src/server/commands/workflow-job.ts#command` | workflow job control command boundary | command | privileged | workspace.access; exact organization scope | one organization and durable job with bounded attempts | strict job references; fixed audited enqueue, claim, failure, completion, and rerun RPC; redacted failure state | workflow-job.test.ts; job-controls migration review and authenticated isolation rehearsal |
| `src/server/commands/demo-round.ts#command` | demo round command boundary | command | privileged | workspace.access; exact organization scope | one customer organization and deal-scoped demo lifecycle | strict schedule and feedback DTO; fixed audited lifecycle and transition RPC; bounded evidence references | demo-round.test.ts; demo-round migration review and authenticated isolation rehearsal |
| `src/server/commands/proposal.ts#command` | proposal command boundary | command | privileged | workspace.access; exact organization scope | one organization and immutable proposal versions | strict source and pricing DTO; fixed audited version and approved-comparison RPC | proposal.test.ts; proposal migration review and authenticated isolation rehearsal |
| `src/server/commands/contract-handoff.ts#command` | contract handoff command boundary | command | privileged | workspace.access; exact organization scope | one customer organization and deal-scoped handoff history | strict selection and transition DTO; fixed audited handoff state and immutable history | contract-handoff.test.ts; handoff migration review and authenticated isolation rehearsal |
| `src/server/commands/commission.ts#command` | commission command boundary | command | privileged | finance.manage; internal AAL2; exact organization scope | one organization and vendor-scoped commission records | strict currency and minor-unit DTO; fixed audited structure and event RPC; idempotent event delivery | commission.test.ts; commission migration review and authenticated isolation rehearsal |
| `src/server/commands/commission-payment.ts#command` | commission payment command boundary | command | privileged | finance.manage; internal AAL2; exact organization scope | one organization and commission-event payment balance | strict positive minor-unit payment DTO; fixed audited payment RPC; bounded balance closure | commission-payment.test.ts; payment migration review and authenticated isolation rehearsal |
| `src/server/commands/invoice.ts#command` | invoice command boundary | command | privileged | finance.manage; internal AAL2; exact organization scope | one organization and commission-event invoice | strict invoice and issue DTO; fixed audited draft, issue, and void RPC | invoice.test.ts; invoice migration review and authenticated isolation rehearsal |
| `src/server/commands/dispute.ts#command` | commission dispute command boundary | command | privileged | finance.manage; internal AAL2; exact organization scope | one organization and commission-event dispute | strict reason and resolution DTO; fixed audited open, resolve, and reject RPC | dispute.test.ts; dispute migration review and authenticated isolation rehearsal |
| `src/server/commands/finance-adjustment.ts#command` | finance adjustment command boundary | command | privileged | finance.manage; internal AAL2; exact organization scope | one organization and commission-event adjustment | strict positive adjustment DTO; fixed audited compensating adjustment RPC | finance-adjustment.test.ts; adjustment migration review and authenticated isolation rehearsal |
| `src/server/commands/finance-handoff.ts#command` | finance handoff command boundary | command | privileged | finance.manage; internal AAL2; exact organization scope | one organization and financially closed commission events | strict unique source-event DTO; fixed audited approved handoff RPC | finance-handoff.test.ts; adjustment migration review and authenticated isolation rehearsal |
| `src/server/commands/finance-reconciliation.ts#command` | finance reconciliation command boundary | command | privileged | finance.manage; internal AAL2; exact organization scope | one organization and signed commission-event report period | strict balanced report DTO; fixed audited source-event reconciliation RPC | finance-reconciliation.test.ts; reconciliation migration review and authenticated isolation rehearsal |
| `src/server/commands/onboarding.ts#command` | onboarding lifecycle command boundary | command | privileged | workspace.access; exact organization scope | one organization and deal-scoped onboarding plan | strict milestone, check-in, risk, and transition DTO; fixed audited onboarding RPC | onboarding.test.ts; onboarding migration review and authenticated isolation rehearsal |
| `src/server/commands/renewal.ts#command` | renewal lifecycle command boundary | command | privileged | workspace.access; exact organization scope | one organization and source or follow-on deal-scoped renewal | strict renewal creation and transition DTO; fixed audited renewal RPC | renewal.test.ts; renewal migration review and authenticated isolation rehearsal |
| `src/server/commands/project-plan.ts#command` | project-plan command boundary | command | privileged | workspace.access; exact organization scope | one organization and approved template or deal-scoped plan | strict template, approval, generation, and revision DTO; fixed audited project-plan RPC | project-plan.test.ts; project-plan migration review and authenticated isolation rehearsal |
| `src/server/commands/administration-configuration.ts#command` | administration configuration command boundary | command | privileged | workspace.access; exact organization scope | one organization and versioned configuration category | strict configuration, approval, and retirement DTO; fixed audited administration RPC | administration-configuration.test.ts; migration review and authenticated isolation rehearsal |
| `src/server/commands/approval-request.ts#command` | approval queue command boundary | command | privileged | workspace.access; exact organization scope | one organization and pending approval resource | strict approval creation and transition DTO; fixed audited approval RPC | approval-request.test.ts; migration review and authenticated isolation rehearsal |
| `src/server/commands/follow-up-schedule.ts#command` | follow-up schedule command boundary | command | privileged | workspace.access; exact organization scope | one organization and vendor, customer, product, or risk subject | strict subject, cadence, approval, and lifecycle DTO; fixed audited follow-up schedule RPC | follow-up-schedule.test.ts; migration review and authenticated isolation rehearsal |
| `src/server/commands/vendor-fact-override.ts#command` | vendor fact override command boundary | command | privileged | audit.export; exact organization scope | one organization and source-linked vendor fact | strict source, reason, expiry, and value DTO; fixed audited override RPC | vendor-fact-override.test.ts; migration review and authenticated isolation rehearsal |
| `src/server/commands/deal.ts#command` | deal command boundary | command | privileged | workspace.access; exact organization scope | one customer organization and linked vendor or product deal | strict deal creation and stage-transition DTO; fixed audited deal RPC and immutable stage history | deal.test.ts; migration review and authenticated isolation rehearsal |
| `src/server/commands/relationship.ts#command` | relationship command boundary | command | privileged | workspace.access; exact organization scope | one organization and two distinct organization or contact endpoints | strict relationship, influence, preference, ownership, and lifecycle DTO; fixed audited relationship RPC | relationship.test.ts; migration review and authenticated isolation rehearsal |
| `src/server/commands/work-item.ts#command` | work queue item command boundary | command | privileged | workspace.access; exact organization scope | one organization and role-scoped operational task | strict queue, assignment, status, priority, and reminder DTO; fixed audited work-item RPC | work-item.test.ts; work-item migration review and authenticated isolation rehearsal |
| `src/trigger/health.ts#health-check` | health-check | background-task | system-only | provider invocation control | Trigger.dev project | liveness log and constant response | no application data access |
| `src/trigger/identity-admin-intents.ts#identity-admin-intents` | identity-admin-intents | background-task | system-only | restricted worker command allowlist | identity intent ledger | leased intent dispatch and redacted outcome counts | worker integration, Trigger configuration, and import-boundary tests |
| `src/instrumentation.ts#register` | server instrumentation registration | framework-hook | framework | none | server runtime | loads the matching Sentry server configuration | no request identity or application data access |
| `src/instrumentation.ts#onRequestError` | server request error capture | framework-hook | framework | none | server runtime | Sentry error event when monitoring is configured | generic error boundary and disabled replay |
| `src/instrumentation-client.ts#module` | client instrumentation initialization | framework-hook | framework | none | browser runtime | Sentry client setup when a public DSN exists | disabled without a DSN; session replay remains off |
| `src/instrumentation-client.ts#onRouterTransitionStart` | client route-transition capture | framework-hook | framework | none | browser runtime | Sentry route-transition event when monitoring is configured | disabled without a DSN; session replay remains off |

## Empty Entry Classes

The current source contains no tRPC mutation, webhook, export handler, download handler, provider callback, cron route, or bootstrap executable.

Server-only security and recovery command clients exist. No application route or procedure exposes these clients yet.

The current application request path does not import the direct Drizzle pool.

Request-scoped data access uses `src/server/auth/request-scoped.ts` and fixed
Supabase functions. The helper checks the token, active identity, and selected
active organization before returning a client. Its stable-ID comparison still
needs the separate `dbac05f` merge.

The new permission service uses the caller-bound SQL result without comparing the stable identity ID to the Auth subject.

These empty classes do not authorize future entries.

The completeness test must change with the implementation that adds an entry.

## Origin and Method Controls

Middleware rejects a `Next-Action` request unless it uses `POST` and the exact configured origin.

Each current Server Action repeats the exact-origin check before it reads input or changes a cookie.

Tests reject unsafe methods, missing origins, foreign origins, and direct action execution.

`next.config.ts` adds no `serverActions.allowedOrigins` value.

The current tRPC routers contain zero mutations.

The tRPC Route Handler exports only `GET` and `POST`.

The shared tRPC base procedure now rejects mutations without `POST` or the exact canonical `Origin`.

All exported public, identity-only, and permission-aware mutation builders inherit this guard.

`createContext` captures immutable method and origin values from the fetch adapter's `Request`.

Direct mutation callers without transport facts also receive `FORBIDDEN`.

The guard uses `hasTrustedMutationOrigin` from `src/server/auth/server-action-request.ts`.

Each future Route Handler command still needs its own POST and exact-Origin check before cookie-authenticated changes.

The local canonical origin and Auth site URL use `http://localhost:3000`.

`http://127.0.0.1:3000` remains an Auth redirect for command-line checks.

It is not a trusted mutation origin.

## Impersonation and Unsafe Identity Sources

A manual review found no current impersonation entry point or actor-override input.

The source contract scans application code, executable configuration, workflows, and command directories for prohibited inputs.

This targeted scan is a regression control. It does not replace review of each new entry point.

The same test rejects authorization through `supabase.auth.getSession()`.

FR-IAM-08 remains Deferred.

## Current Risks and Recovery

All current application tables have explicit deny policies for `anon` and `authenticated`.

A privileged direct-pool connection can bypass RLS. The current runtime wrapper uses a restricted worker with no raw table access.

No current application request imports that pool.

The 403 boundary uses the experimental Next.js `authInterrupts` setting.

Each target environment must set `NEXT_PUBLIC_APP_URL` to its one canonical origin before sign-in opens.

Keep `/home` pending and `/admin` denied until their own permission checks and required RLS evidence pass.

If this control fails, add a deny-all route change before a rollback.

Do not bypass the guard.

Historical R1.1 controls required no schema or data recovery.

The R1.4 foundation adds `drizzle/0003_r1_permission_evaluation.sql`. Keep its additive columns, role history, and RLS during application rollback.

Use the [permission recovery guidance](./r1-permission-evaluation.md#migration-and-recovery) and [emergency containment procedure](./r1-emergency-containment.md).

Do not restore the earlier role-label-only function bodies. Use a reviewed forward correction for permission-policy defects.
