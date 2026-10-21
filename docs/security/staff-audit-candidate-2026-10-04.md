# Staff audit search candidate — October 4, 2026

The audit source and accessibility correction are integrated.
Local simulated checks passed.
Genuine SQL, Auth, browser, and performance checks remain open.
This record does not establish feature or release completion.

## Source and authority

The product requirement is FR-ADM-04 in `docs/PRD.md`.
Sections 9, 10, and 14 of `docs/TECH_STACK.md` define the access and audit controls.
Installed Next.js page, Server Component, error, and loading guides were read before integration.
The Supabase RPC documentation was checked.
The changelog fetch failed because the web tool rejected its Markdown content type.
No changelog clearance is claimed.

The retained draft is `staff-audit-viewer-draft-v1-2026-10-04`.
The retained correction is `staff-audit-focused-checks-v6-accessibility-2026-10-04`.
Both reside under the September 30 session scratch directory:

`C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/`

Fifteen audit-specific files were copied from V6.
Every copied file matched its source hash at integration.
Root also integrated the audit router registration and administration navigation tests.
Four audit access inventory entries were added.
The authorization matrix retained all previous table rows and matches the inventory.
No dependency, permission, cloud, provider, production, or Git write occurred for this task.

## Behavior and access

The screen searches exact actor, entity, action, and UTC date values.
Platform events and selected workspace events use separate scopes.
The reader rechecks platform `admin.access` and exact-scope `audit.view` at AAL2.
The fixed SQL function independently checks current identity, session, recovery state, and permissions.
The proposed function returns only event ID, action, entity type, entity ID, and occurrence time.
The result parser rejects additional fields.
User searches distinguish user actors from workers with an initiating user identity.

Searches use POST with the existing exact-origin check.
Actor filters stay out of URLs and application persistence.
The client disables retries and clears the mutation observer after each read.
The reference input has a separate help element and an explicit accessible description.
Current Sentry sanitization removes request bodies, headers, cookies, and query strings.
Runtime instrumentation and proxy logging remain unverified.

The search keeps all six timestamp fractional digits for pagination.
Rows use descending occurrence time and ascending event ID.
Each page rechecks access.
Backdated inserts can affect later pages.
The source does not promise an immutable result snapshot or a query performance bound.

## Actual checks

The check runner uses credential blanking and disabled activation values.
Vitest uses `envDir:false`, the canonical setup, one fork, and sequential files.
No saved environment file was loaded.
No local service was started.

| Check | Actual result |
|---|---|
| Initial integrated audit tests | 68 cases passed in seven files; 83.406 seconds |
| Final audit tests after navigation integration | 70 cases passed in seven files; 20.071 seconds |
| Access inventory tests | 14 cases passed; 8.721 seconds |
| Focused ESLint with `--max-warnings 0` | Exit 0; no diagnostics; 105.317 seconds |
| Full `tsc --noEmit` with scratch `--tsBuildInfoFile` | Exit 0; no diagnostics; 178.118 seconds |
| Scoped `git diff --check` | Passed for inventory and authorization matrix |
| Exact matrix synchronization | Passed; all prior table rows retained |

Receipt files changed while TypeScript ran.
This type result does not establish acceptance of the final combined source.
Root must run the final type check after assembly.
The focused lint preceded the four inventory entries and root navigation changes.
The final combined lint gate remains required.

The first scratch matrix helper failed because Node required a Windows `file:///` import URL.
The helper was corrected.
The exact matrix synchronization then passed.
The failed preparation attempt did not alter the matrix.

Actual logs and JSON reports reside here:

`C:/Users/rob/.codex/visualizations/2026/10/04/01a10918-17c6-7272-b7a9-caedeac93d50/staff-audit-integrated-checks/`

The initial 68-case report remains preserved separately.
The predecessor V5 failure remains unchanged in its original packet.
These checks use simulated provider responses and component rendering.
They do not establish genuine database authorization or signed-in browser behavior.

## Initial migration checkpoint

The reviewed fragment is `proposed/staff-audit-read.sql` in the retained V6 packet.
Its SHA-256 is `14fde2872b62e5c92d469342c3d4b35e11cc588edf79363d649723bfd6bf6341`.
It creates `public.mmhr_search_staff_audit_events_v1(jsonb)`.
It revokes execution from PUBLIC and application roles.
It contains no activation grant, table, index, or permission-default change.
No migration was generated or applied for this task.

The packet requires accepted receipt migration 0166 before its database rehearsal.
The audit source has no receipt type or function dependency.
Its fixture applies all current migrations, so the receipt baseline must be accepted first.
The 32 genuine test registrations remain in scratch.
Their scratch-relative SQL path must be replaced with the reviewed migration source before repository integration.
Their fragment hash check must stay bound to the actual accepted bytes.

Next, review and generate the additive migration with the project migration workflow.
Review its SQL and metadata before local application.
Run the owned genuine Auth fixture with an authenticated-only execution grant in its disposable database.
Check current revocation, exact scopes, actor filters, append-only controls, and legacy RPC compatibility.
Add genuine receipt-event compatibility and recovery-containment evidence.
Measure query plans and performance with representative synthetic data.
Check signed-in staff navigation, searches, pagination, denied access, responsive views, console, and network behavior.
Keep cloud and production migration actions subject to separate authorization.

Recovery removes the new application navigation, page, router, and reader.
If database recovery is approved, revoke the new function before removing it.
Preserve the legacy RPC, audit history, permissions, and append-only controls.
Dispose of test state through the exact owned fixture cleanup.
Do not delete audit records to clean up tests.

## SQL and genuine test assembly successor

Root generated the custom migration and metadata with the installed Drizzle tool.
The placeholder in `drizzle/0167_staff_audit_search.sql` was replaced with the exact reviewed fragment.
Its hash remains `14fde2872b62e5c92d469342c3d4b35e11cc588edf79363d649723bfd6bf6341`.
The migration retains revoked execution and contains no activation grant.
No migration was applied during this assembly task.

The genuine suite is now `src/server/audit/staff-audit.integration.test.ts`.
Its source path points to the accepted migration.
Its hash check remains unchanged.
The suite no longer creates the function after the fixture already applies the migration.
It checks the guarded test environment and nonce-owned loopback fixture.
It checks the migrated function and revoked execution for all five named application roles.
Only then does it grant authenticated execution inside the disposable fixture transaction.
That grant does not activate the function in an application or cloud database.

The wrapper rehearsal allowlist now includes the exact suite path.
The application migration count is 168.
Generated migration metadata was not hand-edited.
The predecessor scratch packets remain unchanged.

Static checks passed for the exact SQL, migration sequence, source path, absent activation grant, and absent duplicate application.
The static registration count is 32.
Every test body matches V6 exactly.
TypeScript syntax validation reported zero diagnostics.
The wrapper passed `node --check`.
Scoped `git diff --check` passed.

The first static sequence check used an incorrect assumed receipt tag.
The actual journal tag is `0166_rfp_receipts`.
The scratch check was corrected and passed.
No application or migration change was needed for that failure.

The three-file assembly lint timed out at 180.093 seconds without diagnostics.
Its failure and logs remain preserved.
A narrower integration-file lint passed without diagnostics in 9.421 seconds.
That pass does not replace the incomplete three-file lint result.
The final combined type and lint gates remain required.
The genuine suite remains unrun.
Root will run genuine receipt checks before the audit suite.
Recovery, receipt-event compatibility, browser, and performance evidence remain open.

## Final assembled TypeScript check

The final full TypeScript check failed with exit code 2 in 126.483 seconds.
It reported one TS2352 diagnostic at `src/server/trpc/routers/rfp-receipt.test.ts:15:46`.
The cast test context lacks the required `user` field.
The receipt test fixture needs a typed context correction before the check can pass.
No lint, test, build, or service command ran during this type check.

The check used the same safe environment allowlist and credential blanking.
Its incremental output stayed in the current session scratch directory.
The earlier overlapping pass remains preserved separately.
The source guard covered 1,371 files before and after the check.
Both source digests are `92aa1b9a55c6771199009158d319df89121aa09870266957996869f73126dc65`.
The guarded source remained unchanged.
The final failure, logs, and source manifests remain in `staff-audit-integrated-checks/type-final.*`.

## Corrected assembled TypeScript check

Root corrected the receipt fixture to use the real `Context` type.
The caller now supplies the required user and POST transport.
The original Supabase placeholder remains limited to mocked-command routing tests.

The corrected full TypeScript check passed with exit code 0 in 76.084 seconds.
It reported no diagnostics.
It used a separate scratch incremental output and the same safe environment.
All 1,371 guarded source files remained unchanged.
Both source digests are `e829ee4d2e20c6a4ad7b2cd45309d264d9500fd5a29d98ce0cf0393262a47920`.
Logs, results, and manifests remain in `staff-audit-integrated-checks/type-corrected.*`.
The earlier failed result remains unchanged.
No lint, tests, build, services, or migration application ran during this check.
Genuine audit and other final gates remain open.

## Owner append-only test correction

Read-only review found two incorrect owner-test assumptions.
The immutable trigger raises plain `P0001` with `audit_events is append-only`.
An owner `TRUNCATE` with default `RESTRICT` encounters foreign keys before that trigger.
The corrected test requires the exact trigger code and message for owner update and deletion.
It uses `TRUNCATE CASCADE` inside an explicit transaction.
An unconditional throw follows any unexpected truncation success.
That throw rolls back the transaction and fails the expected `P0001` assertion.
The unchanged snapshot assertion remains.

All 32 cases, titles, matrices, and deadlines remain.
The other 31 bodies and authenticated raw-table `42501` assertions are byte-identical.
Syntax and four synthetic control-flow probes passed.
These probes do not establish genuine database denial.
The corrected file hash is `c2bab418324addb969d6578f86ce041670e206abf6c0a8a86cbe26e07a57d8ca`.
Evidence is in current scratch `staff-audit-owner-fixture-correction-v1/`.
The first synthetic adapter probe failed because its matcher omitted `FROM` in `DELETE FROM`.
That failed record remains preserved.
The adapter correction did not change the final integration test bytes.
Genuine execution remains required after accepted receipt history prerequisites.

## 23:53 EDT — Genuine audit acceptance

Fresh runtime collection registered all 32 cases without running bodies or fixtures.
The genuine suite passed 32/32 with zero skipped, pending, or failed cases.
Its process closed with exit0 in 266.785 seconds.
The root and snapshot source guards passed for all 1614 captured files.
The report validator confirmed the complete exact tuple multiplicity.
The owner append-only case passed against the genuine database.

Evidence: current scratch `staff-audit-genuine-results/` and `audit-title-collection/`.
Report SHA256: `826bfeed5827a8f01f15ccc3b72465dbc081516e3142cf8910df6db6c5a740ad`.
Six independent Docker queries found the owned fixture resources absent.
Sequential checks found seven observed processes, direct children, snapshot markers, and fixture ports absent.
Complete unobserved descendant absence remains unproved.
Browser acceptance and current broad application gates remain open.
The owned fixture grant does not authorize deployed function access.
