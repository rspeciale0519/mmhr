# R1.4 Permission Evaluation

Status: permission-evaluation foundation implemented and verified locally on 2026-08-30. Full R1.4 remains open.

## Boundary

The typed registry defines 30 permissions and 60 explicit role-default allows.

The database evaluates the caller through `auth.uid()`. Public functions do not accept an actor identifier.

`mmhr_authorize(permission_key, organization_id)` returns one narrow row or no rows.

Its result contains `identity_id`, `authorized_organization_id`, and `assurance`.

The stable identity ID is separate from the verified Auth subject.

The server service verifies claims and validates both the requested scope and the database response.

Protected tRPC builders require a complete input schema, a permission, and a scope resolver.

They expose only query and mutation terminals. Later input transforms cannot change an authorized scope.

All exported mutation builders require POST and the exact canonical Origin.

## Stored Policy

The evaluator checks active identity, scope, membership, platform assignment, and minimum assurance before permission precedence.

An active explicit deny wins across matching platform and organization scopes.

An active explicit allow takes priority over role defaults.

A matching role-default deny wins over a role-default allow.

Missing policy denies access. An expiry equal to the authorization time is expired.

Internal users need active membership and an explicit organization-scoped workspace grant for customer or vendor data.

External membership cannot provide internal platform access.

Platform assignment history keeps a principal internal. Lost platform authority cannot convert that principal into an external member.

Each organization permission also requires the same organization's workspace permission.

Platform administration requires platform workspace access. Other platform permissions require both features.

Internal-only organization operations also require platform administration access.

Parent denial, retirement, or metadata drift blocks child permissions before any explicit child allow.

Portal access requires the matching organization type and an active portal grant.

Stored scope or assurance metadata must match the fixed registry. Metadata drift denies access.

The owner-only registry synchronization command inserts missing reviewed definitions. It rejects unexpected or changed definitions.

The command writes an audit event with its changes. A repeated matching call changes nothing.

## Field Controls

| Fixed function | Required permission | Field control |
|---|---|---|
| `mmhr_get_my_identity` | Verified active caller | Caller-bound identity fields only |
| `mmhr_get_organization` | Scoped `workspace.access` | Name requires `org.name.read` |
| `mmhr_get_my_memberships` | Scoped `workspace.access` for each row | Names and role keys require their field permissions |
| `mmhr_get_organization_members` | Scoped `org.members.view` at AAL2 | Role keys require `member.role.read` |
| `mmhr_get_audit_events` | Scoped `audit.view` at AAL2 | Metadata only; no raw summaries |

Denied text fields return `NULL`. Denied records return no rows.

A NULL audit organization selects platform events only. It does not select every organization's history.

Raw table access remains denied. Worker access remains unchanged.

## Migration and Recovery

Migration `0003_r1_permission_evaluation.sql` adds fail-closed permission metadata.

It preserves version-one role content as approved history and creates active version-two defaults.

It records registry synchronization and each role-version change in the migration transaction.

Default changes lock their role row before checking draft state. Approval must wait for that lock.

Run the local MMHR Supabase preflight before migration. Use only its validated loopback database address.

Apply the reviewed migration with `npx drizzle-kit migrate` through `MIGRATION_DATABASE_URL`.

Validate staging before any production migration.

Use the [emergency revocation script](./r1-emergency-revocation.sql) if authorization evidence fails.

Keep RLS enabled during containment and rollback.

An application rollback keeps all additive columns and role history. Old read-function signatures remain available.

Do not restore the earlier role-label-only function bodies.

Use a reviewed forward correction if policy or field behavior is wrong.

## Required Evidence

- Typed registry and service unit tests.
- tRPC scope, input, and transport denial tests.
- Real AAL1 and AAL2 role matrices against local Supabase.
- Direct fixed-function field and cross-organization denial tests.
- Code-to-database registry and role-default parity.
- Empty, populated, compatibility, and restore rehearsals.
- Role-approval concurrency and stored precedence tests in a disposable stack.
- Independent security review and all standard application gates.

## Local Verification Record

| Check | Result on 2026-08-30 |
|---|---|
| `npm run type-check` | Passed |
| `npm run lint` | Passed |
| `npm test` | 320 tests passed across 23 files |
| `npm run test:integration` | 82 tests passed across nine files; 779.15 seconds |
| `npm run build` | Passed; 55 static pages generated |
| `npx drizzle-kit migrate` | Applied migration 0003 to the validated local MMHR stack |
| Independent security review | All identified findings corrected; no remaining finding in this foundation |
| `git diff --check` | Passed |

The integration suite includes real AAL1/AAL2 checks and empty, populated, compatibility, restore, and emergency-containment rehearsals.

Two injected audit failures prove that the actual migration rolls back schema, grants, rows, and migration history.

The role-default lock test proves that approval cannot pass a concurrent default change.

An earlier unit run failed when one Vitest worker did not start before its deadline.

The isolated 44-test boundary suite passed. A later full unit run passed without test or configuration changes.

The worker-startup cause remains unconfirmed. The final suites ran separately to reduce concurrent load.

The build reports existing Sentry and Next.js middleware deprecation warnings.

No rendered behavior changed. Historical browser checks do not prove these new database controls.

The tRPC HTTP tests use the installed fetch adapter with mocked Supabase. Separate integration tests use real local Auth tokens.

The import-boundary scanner covers its tested syntax. It is not a complete JavaScript dataflow proof.

These results apply to this local branch. They do not prove remote checks, staging, production, or the separate stable-ID correction.

## Still Required For R1.4

This package does not activate routes, privileged mutations, recovery, bootstrap, or worker commands.

The stable-identity correction from `dbac05f` is applied and locally verified on
this branch. Its remote merge remains a release prerequisite.

The remaining R1.4 work includes audited security commands, separate delegation ceilings, effective-administrator invariants, identity adapters, and leased worker dispatch.

Before mutation access opens, narrow platform allows to platform scope as recorded in the owning plan's command decisions.

The atomic two-identity bootstrap and complete recovery protocol also remain required.

Permission evaluation success alone does not prove command authorization or R1 completion.

## September 5 Domain Authorization Corrections

Migration `0093_r7-finance-authorization.sql` adds internal, organization-scoped
`finance.manage`. Migration `0094_r4-mmhr-rfp-authorization.sql` adds
`rfp.approve` and `rfp.distribute` with the same internal AAL2 requirement.
Only Super Admin defaults include these permissions. Other internal users need
an explicit authorized grant. External workspace access does not grant them.

RFP distribution requires an immutable `rfp.mmhr_approve` audit event from the
corrected approval command. The event must match the RFP version, organization,
and recorded reviewer. Older approval records remain intact but cannot authorize
a new distribution. An authorized, distinct MMHR reviewer can review an older
approved version again with a new idempotency key. Existing distributed history
remains unchanged.

The migrations preserve prior role defaults and link immutable activation
authority. Emergency containment revokes the affected public RPC execute grants.
Recovery uses a reviewed forward correction, not workspace-only authorization.
Local focused evidence does not establish staging or production readiness.

Migration `0095_r4-amendment-authorization.sql` extends `rfp.approve` to amendment
approval. Draft creation retains its existing workspace permission. Approval
requires a distinct internal AAL2 reviewer and exact MMHR approval evidence for
the common base. Invalid or missing actions fail before permission selection.
New approval events use `rfp.amendment.mmhr_approve`. Legacy approval receipts
cannot represent new MMHR review. Preserve legacy approved versions and create
a new amendment version when new approval is required. No migration sends content.
