# mmhr brain — STATE
Updated: 2026-09-08

## Current focus
September 8, 21:48 continuation: reviewed the full active goal and supplement.
No scope change is required. Prepared scoped active-requirement reads, migration
0106, strict adapters and a read-only tRPC query. Customer screen wiring remains open.
The current inventory contains 107 migrations and 90 integration test files.
Full unit 33155 passes 302 files and 3,217 tests. Final focused checks pass 77 tests;
type checking and lint pass. Build 63432 passed 67 routes before the final error text.
Eight requirement-read database cases collect but have not executed.
Independent review found no read authorization bypass. Fixed its error-text and
projection-test findings. The debugger review corrected invalid legacy fixtures.
The checkpoint remains at a1b2ee3112f1d766f0ce82d24607d6571c8c5ee6.
Created codex/full-delivery-verification without changing the checkpoint or dirty work.
Fresh origin/develop remains 103 commits behind that checkpoint.
Prepare a draft PR with customer, lead, public-site and release-control changes;
use existing disposable GitHub CI as the next database verification path.
Keep local settings and hooks out of commits. No push, merge or deployment yet.
All production gates remain closed. See docs/security/r3-requirement-read.md.
The entries below record historical results, not current inventory totals.

September 8, 21:20 continuation: the full goal and 3,967-character supplement
need no further changes. Added customer saved-intake list/detail views, bounded
pagination and loading, empty, invalid-link and read-error states. Page access
and adapter workspace checks remain separate; query IDs never supply authority.
No customer writes are enabled. Requirements and customizations remain absent.
Independent review found no clear authorization bypass. Its test requests were added.
Final focused tests pass 73 cases. Type, lint and build pass; build has 67 routes.
Full unit 90113 passes 300 files and 3,155 tests. Final type/lint 17548 also pass.
Integration inventory passes for 89 files; tracked-file secret scan passes.
Development startup lacks MIGRATION_DATABASE_URL. The initial port check lacked
permission; port 3000's system-service listener was not stopped or changed.
Local production preview runs on 127.0.0.1:3007 in session 71991. Browser tab 1
shows the release block without console warnings/errors and was retained.
This does not verify the customer UI or authentication redirects. Do not bypass
release controls. Database and authenticated browser evidence remain open.
See `docs/security/r3-customer-intake-view.md`. Continue requirement/customization
reads, customer write policy, forms and registration wiring. No migration,
commit, push, merge or production action occurred. The full goal remains active.

September 8, 20:45 continuation: the previous intake-read turn made concrete progress.
Added requirement creation, strengthened the existing update adapter and prepared
immutable requirement history with guarded SQL writes. Canonical migration:
`drizzle/0105_0105_r3_requirement_commands.sql` (generated ledger name retained).
It is unapplied. The schema inventory now contains 106 migrations and 89 test files.
Parent review corrected optional retry metadata, active-owner checks, weight100,
numeric bounds, SQL name collisions, response limits and current history correlation.
The adapters copy validated response data before asynchronous permission checks.
Fifty final focused tests and 96 adapter/security checks pass. Type checking, lint,
Drizzle ledger checks and the 67-route build pass. Sixteen database cases collect;
Docker's recorded failure still prevents execution. Full unit 43611 passed
298 files and 3,129 tests before the final SQL-only legacy replay correction.
Independent review found that old successful update payloads could not replay.
The public SQL wrapper now checks an exact authorized receipt before new-write
validation, while preserving strict validation for new writes. Separate review
found no authentication bypass. Final focused/type/lint checks pass.
No tests are still running. This remains prepared code, not live workflow closure.
See `docs/security/r3-requirement-writes.md`. Customer AAL1 write policy,
requirement reads, customizations, forms and browser/database evidence remain open.
No migration, commit, push, merge or production action occurred.

September 8, 20:26 continuation: the complete goal and 3,967-character supplement
were reviewed again. No further scope change is needed. The prior full unit
rerun 34258 passed 293 files and 3,024 tests.
Prepared additive migration 0104 and scoped intake list/detail adapters and
tRPC queries. No write authority, raw grants or stored records changed.
The migration inventory contains 105 entries; integration inventory has 88 files.
Independent review found a legacy size mismatch. Read validation now preserves
valid stored data above the new-write limit, padded text and Unicode characters.
The debugger review confirmed expected SQL failures use fixture savepoints;
membership revocation now uses the real command. Eleven database cases collect.
Fifty-eight final focused tests, type checking and lint pass. Build 43092 passes
67 routes; the final Unicode-only validation change has focused/type/lint evidence.
Full unit 16640 passed 296 files and 3,081 tests. The final Unicode regression
also passes in the separate 58-test focused run.
Migration 0104 is unapplied. Docker still blocks live database evidence.
See `docs/security/r3-intake-read.md`. Customer forms, write authentication,
requirements and customization capture remain open. No Git or production action occurred.

September 8, 20:06 continuation: reviewed intake saving before API exposure.
Found lifecycle, payload, AAL1-write, resume-read and customization gaps.
Prepared additive migration 0103 to protect lifecycle and bounded data while
retaining the existing private audit/history writer and AAL2 command boundary.
It is NOT applied. The migration inventory now contains 104 entries.
Reworked the intake adapter; seven final-review regressions failed, then passed.
Forty focused intake checks, type checking, lint and the 67-route build pass.
Twelve database cases collect but remain unexecuted because Docker is unavailable.
Full unit 11539 passed 3,023 tests and failed one boundary check on the prior
registration test's direct postgres import. Replaced it with the existing
two-connection rehearsal pool. The 47 boundary checks pass after the repair.
Full unit rerun 34258 subsequently passed 293 files and 3,024 tests.
See `docs/security/r3-intake-save.md`. Intake API/UI, scoped resume reads,
customizations and a reviewed customer-write authentication boundary remain open.

September 8, 19:44 continuation: the reviewed goal supplement remains 3,967 characters.
Added explicit caller-subject consistency to the unapplied customer setup RPC.
The new static regression failed before the correction; 53 focused tests now pass.
Type checking, focused lint and whitespace checks pass for that correction.
The debugger review confirmed a frozen Docker Desktop UI with no backend.
Normal restart timed out. A force-close was initially rejected due to possible PID reuse.
Fresh CIM checks proved the exact executable and creation time. The approved,
guarded retry closed only that frozen UI, and Docker backend processes started.
The engine did not answer. Lead rehearsal 63348 timed out during startup after
240 seconds and skipped all seven tests. No database assertion executed.
Docker startup 35861 then returned `context deadline exceeded`; recovery failed.
Do not repeat startup probes or reset Docker data. Customer setup remains unwired.
Reviewed the independent subagent patch: registration now collects 38 cases,
including observed concurrent-writer blocking and existing/revoked authority.
SQL rejection checks use nested savepoints; committed fixtures remain disposable.
Post-review type checking and lint pass. The final focused batch passes 54 tests.
The 38 database cases are collected, not executed. The engine-version diagnostic
was stopped after startup failed; no further restart was attempted.

September 8 resumed goal review: the full completion goal remains active.
The user requested review and changes before resumption. The revised execution
supplement is `.codex/plans/goal-full-project-completion.md` (under 4,000 characters).
It prioritizes complete customer workflows, preserves the checkpoint, and records
the existing authorization for routine implementation, Git and deployment work.
Earlier task-specific approval limits and development stops below are historical;
real release evidence, verified identities and non-destructive recovery remain required.
The PRD and roadmap now distinguish all displayed masked options from five selections.
Repaired interrupted Supabase syntax and removed untrusted header forwarding.
Fixed the lead adapter's SQL column mapping and registration rejection handling.
Migration 0102 now prepares an aggregate lead-write ceiling with RLS and atomic
lead/audit rollback. It is NOT applied. Per-client edge protection remains open.
See `docs/security/r2a-lead-rate-limit.md` for the forward path and recovery risks.
Focused checks passed 51 tests; type checking, lint, migration ledger check and
the 67-route build passed. Full unit checks passed 292 files and 2,997 tests.
The integration inventory covers 87 files; seven new lead cases could not run
because Docker startup failed. No database assertion passed for migration 0102.

September 8: the user approved implementation of the confirmed ten-step customer
journey and independent testing. The development stop below is historical.
The user separately approved automatic private workspace access for verified
customers, without staff approval or administration rights. The narrow policy
exception is recorded in the R1 plan's initialization section.
Prepared migration 0101, customer registration schema/adapter, and regression tests.
Added the caller-bound identity synchronization RPC with audit and receipt writes;
runtime wiring remains disabled until database rehearsal evidence passes.
Corrected two stale R1 evidence references and added a regression check for the
canonical R0 control record and R9 evidence migration.
Marked older integration results as historical and recorded the current 86-file
inventory with the Docker engine blocker, so stale results cannot imply closure.
Added route-specific canonical, Open Graph, and Twitter metadata across the
stable marketing routes and dynamic blog and case-study pages, with coverage tests.
Added dynamic blog and case-study URLs to the public sitemap with route coverage
tests; public release remains fail-closed until claim and environment evidence passes.
Added a repository-reference check so every local artifact named by the R1
evidence record must exist.
Strengthened R2A marketing-content approval with source reference and capture
time, and made passed R9 security reviews cover all eight security domains.
The current lead boundary validates consent, work email, phone, and idempotency,
but durable public rate limiting and live lead rehearsal remain open.
Added explicit platform-authority, existing-membership, and adapter-concurrency cases.
The setup RPC now locks the live Auth user before first-time writes to serialize retries.
The adapter is NOT wired to registration and the migration is NOT applied locally
or remotely. Fifteen focused adapter and migration tests pass. Database tests are
blocked by Docker startup.
The production build still passes with all 67 routes. An isolated temporary Docker
configuration removes the local config warning, but the Docker engine pipe remains
missing. The expanded 30 registration and synchronization integration cases still
skip before execution.
The Drizzle migration ledger check passes with a loopback-only placeholder URL.
The R9 readiness checker validates the manifest and correctly reports all 12
release checks blocked until real evidence exists.
Docker's backend log reports an inaccessible sailor-ingest.sock runtime file.
The crashed Desktop instance was stopped. Backup move and removal of that exact
socket both failed; no containers or volumes were removed. Windows service startup
also returned access denied. Do not factory-reset Docker or delete its data.
See journal/2026-09-08.md. Finish database verification before enabling the new RPC.
No new commit, push, merge, or production action is authorized by this work record.

September 7 checkpoint task: the user approved a reviewed commit and push to a
separate checkpoint branch. This does not authorize a merge or renewed development.
Current branch: checkpoint/pre-workflow-review-2026-09-07, created from the
unchanged feature HEAD 98d11c0 to retain all accumulated work.
See docs/CHECKPOINT-2026-09-07.md for the clarified customer workflow and open work.
The September 5 integration session handle is no longer available. Its final
result is unverified; references below to a live session are historical.
Type checking, lint, build (67 pages), secret scan, integration inventory,
whitespace checks, and dependency audit passed on September 7. The current
worktree also passes 291 unit test files and 2,972 tests, plus the 67-route
production build. The customer-registration integration suite remains blocked
by Docker startup.
This record is included in the checkpoint commit. Verify the remote branch SHA
against local HEAD before treating the GitHub backup as confirmed.

USER-REQUESTED DEVELOPMENT STOP (September 5, 20:14): The user wants to discuss
the intended product and correct a possible expectation mismatch before more
implementation. Do not resume development from automatic goal continuations.
Wait for that discussion and an explicit direction to resume. The full goal is
not complete. The progress heartbeat mmhr-goal-progress is PAUSED.
Current code checkpoint passed build 97672 (67 routes), type checking, focused
lint, 35 organization/membership tests, and 23 organization/inventory tests.
Existing integration session 42302 is still running; let it finish without
starting replacement suites or further implementation. Development servers
remain available. Changes are preserved locally; no new commit, push, or release.

The canonical product baseline is in docs/README.md, docs/PRD.md, and
docs/TECH_STACK.md. The approved roadmap is in
.codex/plans/roadmap-v2-implementation.md. R1 implementation decisions are in
.codex/plans/module-r1-secure-platform-base.md, version 0.12.

The active full-delivery goal authorizes normal project implementation,
dependencies, Git, cloud configuration, migrations, bootstrap, releases, and
deployment. Required checks and real identity evidence still apply.
Purchases and new paid commitments remain prohibited.

The sandbox reviewer rejected an earlier exact remote push for
bugfix/r1-stable-identity-context. Do not bypass that rejection.
The stable-ID correction is now applied and locally verified on the active
feature branch. Remote merge remains pending.

R1.0 through R1.3 are merged into develop at b1ffbe1. Two late review
findings remain open. The local correction dbac05f fixes the stable-ID
comparison and restores the earlier journal text. It passed all local
checks but is not pushed or merged.

Current branch: feature/r1-permission-evaluation, based on b1ffbe1.
R1.4 through R1.8 foundations are implemented and verified locally, including
invitation lifecycle contracts. R2A through R9 now have bounded contracts,
schemas, or safety helpers with focused tests. Database delivery, target
environment evidence, and production release work remain open.

## Latest synopsis
September 5, 20:14: registered organization status/type tRPC endpoints using
separate platform AAL2 permissions and existing audited commands. Added strict
input, origin, assurance, permission-loss, scope-substitution, error-redaction,
and receipt-target tests. Sessions 35234 and 97672 passed focused checks and
the 67-route build. The authorization inventory and matrix match. No new schema
or organization records changed. Organization UI and real router integration
remain unfinished. Stopped new development at the user's request for product
clarification; do not treat this checkpoint as R1 or full-goal completion.

September 5, 20:00: reproduced sign-out false success with three failing
regressions. The action now checks returned errors, maps transport errors to a
generic failure, and does not redirect or revalidate after unconfirmed sign-out.
All 27 authentication/home tests, focused lint, type checking, and whitespace
checks passed. Build 42911 passed; integration 42302 remains live. The installed SDK
can clear local session storage while returning a remote revocation error; the
action therefore reports unconfirmed completion, not guaranteed retained login.
No database inventory or production state changed. Identity synchronization
still needs its guarded, audited RPC and registration wiring.

September 5, 19:55: recovered the prepared, unused identity synchronization
adapter and registered its exact boundary in the authorization inventory.
Added missing-provider-response guards and three regression cases. All 28
focused adapter/inventory tests, focused lint, and type checking passed in 2724.
Full lint/unit 75646 completed: 287 files and 2,909 tests passed. It does not
prove later adapter edits. Full integration 42302 remains live; inventory stays
at 101 migrations and 85 integration files. No sign-in wiring or synchronization
RPC exists yet. The canonical R1 plan requires the private revision guard and
atomic audit/receipt handling for identity synchronization; resolve setup AAL
requirements before implementation. Registration and production remain unfinished.

September 5, 19:43: source review found suspended members still offered a role
change although the audited SQL command permits only active target memberships.
The page and controls now require active status; suspended members retain restore
and revoke controls according to permission. Two regression tests were added.
All 21 focused member tests, type checking, and lint passed in 52459. Build 72701
passed with 67 routes. Full lint/unit 75646 and full integration 42302 remain live; keep the
101-migration/85-file inventory stable. The strict R9 release gate returned exit
1 with all 12 evidence categories open. No evidence record was promoted or changed.
Signed-in browser checks still need approval; no sign-in attempt was repeated.

September 5, 19:35: connected /members to the bounded read and audited membership
router. Added role, suspend/restore, and revoke confirmation forms with separate
permissions, reasons, stable retry keys, duplicate-submit guards, and self-change
suppression using application identity. Existing approved read fields expose member
references, not account names/email. The screen states this limit explicitly.
All 27 page/control/home tests and 20 inventory/router checks passed, with type
checking, focused lint, and whitespace checks. Browser tab 5 showed static loading
then /sign-in for an unsigned caller; no authentication form was submitted.
Build 47981 passed with 67 routes. Full lint/unit 75646 and full integration
42302 are live. Keep the 101-migration/85-file inventory stable during the full
integration run. Signed-in layout/interaction evidence needs approval.
No new migration or production change occurred. Full release remains unfinished.

September 5, 19:26: reproduced and fixed a member-read review gap. The old RPC
returned a target membership with migration_review_required=true (70495 red
regression). Additive migration 0100 filters those rows in the compatible old
signature and adds mmhr_get_organization_members_page with bounded UUID cursor
pagination. A strict permission-bound adapter rejects wrong scope, extra fields,
invalid roles/status, duplicate/unsorted rows, and invalid bounds. All six isolated
database tests passed (50012), 25 adapter/migration/inventory checks passed, and
type checking, focused lint, and whitespace checks passed. Inventory now covers
101 migrations, 108 tables, and 85 integration files. Migration applied locally.
Existing real-token permission suite 6135 passed all 33 tests after the migration.
The new member read is not yet wired to a screen. Full release remains open.

September 5, 19:15: registered membership role, status, and revoke tRPC commands.
Revocation has a separate permission and fixed status; status changes allow only
active/suspended. Strict schemas reject actor fields and platform roles. Existing
command adapters and SQL retain scope, AAL2, audit, receipt, and capacity checks.
All 27 membership/invitation router tests and 70 command/inventory tests passed,
plus type checking, focused lint, and the 66-route build 64111. Disposable real
Auth suite 43168 passed all 10 tests, including membership router replay. Fresh
suite 99479 passed all 10 tests with the explicit one-audit-event assertion.
Full unit suite 85198 passed 282 files and 2,855 tests in 408.37 seconds; it began
before the membership router changes. Member list and controls remain unfinished.
The old member read has no pagination and no explicit target membership review
filter; inspect and test these before using it for the new screen.

September 5, 19:06: connected the invitation read to /invitations with bounded
pagination, redacted roles, UTC expiry, empty/error/loading states, and separately
authorized resend/revoke controls. Commands require an explicit confirmation
and audit reason; unchanged retries keep their receipt keys. Home navigation
checks org.members.view independently from invitation creation. All 25 page,
control, and home tests passed; all 15 inventory/router checks passed after
registering the public data-free loading boundary and matching table order.
Type checking and focused lint passed. Browser tab 4 showed loading then
/sign-in for an unsigned caller. Signed-in browser evidence still needs approval.
Build session 86953 passed with 66 routes. Full-project lint passed in 85198;
its full unit suite is live. No new database, cloud, or production change in this step.

September 5, 18:54: added organization invitation read RPC in migration 0099
and its permission-bound server adapter. Reads enforce organization scope,
bounded cursor pagination, review flags, and member.role.read field redaction.
All 18 isolated invitation tests passed in session 60675; migration applied
locally. The failing redaction fixture had tried to remove a required permission
from the only capable organization administrator. PostgreSQL diagnostics proved
the existing capacity guard denied that change. The corrected fixture tests the
denial, adds a backup administrator, then proves redaction. No policy weakened.
Type checking, focused lint, and 21 adapter/inventory/migration tests passed.
Source inventory is now 100 migrations, 108 tables, 84 integration files.
The read adapter is not yet connected to the administration screen. Full fresh
integration, browser authentication approval, remote delivery, and release remain open.

September 5, 18:35: added caller-only account setup RPC in additive migration
0098 and connected MFA/pending-access pages. It returns only own ID, status,
and synchronized verification state. Pending setup does not broaden active-only
protected reads or grant membership. All 10 isolated database tests, 33 focused
page/guard/migration tests, four inventory tests, type/lint, and 65-route build
67526 passed. Migration applied locally. Fresh real-token suite 26329 passed
33 tests, including pending setup read with denied workspace access. Inventory
is 99 migrations, 108 tables, 84 integration files. General blocked-state guard
fixtures now use valid IDs; all 18 guard tests passed again. Browser MFA/setup
interaction evidence still awaits approval. No cloud or production change.

September 5, 18:25: full integration 34031 finished: 82/83 files and 713/714
tests passed in 5700.10 seconds; its earlier finance expectation failure was
the only failure. Full unit/build 58712 passed 279 files, 2,821 tests, 65 routes.
New isolated review-flag tests then reproduced two real invitation-read gaps.
Additive migration 0097 excludes unreviewed invitations and organizations;
all 15 isolated tests now pass, plus five migration checks, type, and lint.
Drizzle generated its metadata. Inventory is now 98 migrations (108 tables).
The migration applied successfully to local MMHR. Fresh real-token permission
suite 18020 passed all 33 tests in 29.42 seconds. No production change occurred. Browser auth approval,
pending-state read access, invitation administration, and full delivery remain open.

September 5, 18:17: isolated invitation suite 30886 passed all 13 tests in
61.31 seconds. The acceptance test now uses the server action's stable natural
key and proves one membership, audit event, and receipt after replay. Another
caller cannot reuse that key. Focused lint and whitespace checks passed.
Full unit/build 58712 and full integration 34031 remain live. Browser
authentication still awaits explicit approval. No migration inventory changed.

September 5, 18:13: browser approval review rejected a local sign-in attempt
using nonexistent synthetic account inputs. Do not retry or use another path
until the user approves local authentication form tests. An asynchronous
approval question is open. In-app tab 3 is retained at local /sign-in.
Full unit/build 58712 and integration 34031 were rechecked and remain live.
This limits browser authentication only, not independent project work.

September 5, 18:09: home navigation now checks the same customer/vendor
permission constants as the route guards. Invitation navigation stays separately
authorized. No-access guidance replaces an empty navigation block. All 28
focused home/portal/page-guard tests and scoped whitespace checks pass.
Type/lint session 41616 passed. Fresh full unit/build session 58712 is live.
Integration 34031 remains live. Invitation administration still needs a fixed
organization-scoped read RPC; keep migrations stable during the full run.
Rendered signed-in navigation and full production requirements remain open.

September 5, 18:05: invitation acceptance now uses the immutable invitation ID
as its operation key. Receipts remain caller/command scoped and input-digest
checked. Correlation IDs remain unique per attempt. Duplicate invitation
fields fail before provider access. All 26 focused action/adapter tests,
type checking, focused lint, and scoped whitespace checks pass. Session 46082
completed successfully. Previous pending-access build 10804 passed (65 routes)
before this action change. Full integration 34031 remains live. No migration
or production change occurred; real lost-response browser evidence remains open.

September 5, 18:00: corrected the pending-access parser to accept the actual
four-field caller identity RPC response while discarding unused fields.
All 31 focused page/guard tests and scoped whitespace checks pass. Type/lint
session 81323 and fresh build 10804 remain live. Browser tab 2 confirmed that
anonymous /workspaces requests redirect to /sign-in on development port 3018.
Signed-in verification remains open. Integration 34031 remains live; Docker
shows healthy MMHR services and a newly started r4document rehearsal container.
The known earlier finance expectation failure still needs a fresh test result.
Pending identities still need a reviewed database read path for MFA/access
guidance; this parser fix does not close that requirement.

September 5, 17:52: the guarded development command now pins Next to loopback
without widening its command allowlist. Five wrapper checks, syntax, focused
lint, and the 83-file integration inventory pass. Development session 50465
is ready on 127.0.0.1:3018; the OS confirms that exact listener (PID 5732).
Type/whitespace session 73585 passed. Build 16499 passed all 65 routes
before the wrapper-only change. Integration 34031 remains live with its known
earlier finance expectation failure. Signed-in browser evidence remains open.
No migration, cloud, release-gate, or production change occurred.

September 5, 17:40: connected `/workspaces` to the caller-filtered membership
RPC and tested selection action. Home links to the list and routes missing
context there. Empty, error, redacted-name, duplicate-row, and anonymous cases
are covered. All 43 focused checks, type checking, focused lint, and whitespace
checks pass. Full unit/build 26306 completed: 276 files, 2,781 tests, 64 routes
(before this new page). Fresh build 16499 is live. Integration 34031 remains
live with its previous finance expectation failure. Signed-in browser tests
remain open; the dev wrapper accepts only bare `next dev`, so loopback binding
needs a reviewed path before starting it on a free port. No wrapper change yet.

September 5, 17:32: added `selectOrganizationAction` for the existing selected
organization cookie. It requires exact origin and current workspace access,
normalizes one non-nil UUID, then sets an HttpOnly, SameSite=Lax, host-only
eight-hour cookie (Secure in production). It never grants membership. All
15 focused action/inventory tests, type checking, focused lint, and scoped
whitespace checks pass. The organization-list page is not yet connected.
Prior lint session 40740 also passed. Full unit/build 26306 and integration
34031 remain live. Keep the migration inventory stable.

September 5, 17:26: corrected page guards that compared separate Auth and
application identity IDs. The caller-bound authorization result remains the
permission authority. MFA parsing now accepts the actual identity read shape.
Invitation acceptance now verifies the current provider user and uses a strict
caller-only command; pending users no longer require an active workspace read.
SQL still validates identity, live session, provider state, and email matching.
All 115 focused tests and eight acceptance-action tests pass; type checking and
scoped whitespace checks pass. Lint session 40740 is still live. Full unit/build
session 26306 is live. Full integration 34031 remains live with its earlier
finance expectation failure. No migrations changed.

September 5, 17:11: `/invitations/new` now has a selected-organization,
permission-checked creation form. Home shows its link only with invitation
permission. The form defaults to Viewer, retains retry keys, blocks duplicate
submissions, and does not claim email delivery. All 23 focused tests, type
checking, full lint, and scoped whitespace checks pass. Build session 36807
passed all 64 routes, including `/invitations/new`. Browser verification remains
open; no server was listening on port 3000 at inspection. The in-app browser
is available. No authentication guard was bypassed or test route added.

Follow-up: port 3000 is occupied by PID 5884; its command line was unavailable,
so it was left unchanged. MMHR production server session 77296 is live on
127.0.0.1:3017. In-app browser tab 1 shows the expected public-release
quarantine on `/invitations/new`. This proves quarantine only, not the signed-in
form. Use the development workflow for remaining browser checks. Keep the
release ID and gate unchanged.

September 5, 16:57: invitation integration now passes 13 tests. New cases
cover deleted/anonymous providers and exact expiry, replay, one audit event,
and no membership. Type checking and focused lint pass. Full integration
session 34031 remains live with a known finance test failure. Its positive
expectation used an external organization without a required workspace grant.
The test now uses internal scope for success and keeps external denial;
that correction needs a fresh integration result. No migrations changed.

The shared local database now applies all 97 migrations through 0096. Cloud
and production remain unchanged. The latest full unit suite passed 274 files
and 2,765 tests, and the production build passed 63 routes. Ten invitation
integration cases pass, including pending-user reads and live session/provider
denial. A new full 83-file integration run is starting with stable migration
inventory; avoid changing migrations during that gate.

The prior aggregate run finished with 680 passing tests, four failed assertions,
and one skipped test. Stale role/count expectations caused four failures; a
temporary Docker port conflict prevented invoice-suite setup. A targeted rerun
then encountered malformed generated SQL, corrected before shared application.

The application router now exposes four invitation procedures: caller-only
pending reads and permission-checked create, resend, and revoke commands.
Actor identity comes from server authorization, not caller input. All 66 focused
tRPC and inventory tests, type checking, and lint pass. Six new invitation
lifecycle integration tests pass after migration 0096 corrects ambiguous local
variable naming and unsupported audit keys. Acceptance verifies email matching,
single membership creation, and replay. The matrix covers 83 integration files.
The new full unit/build sequence is running. Expiry, concurrency, real-token
API journeys, and rendered administration still need evidence for R1 closure.

September 5 follow-up: the full unit suite passed 2,750 tests after separating
server and browser environments. Runtime fell from 1,066 to 412 seconds.
Migration assertions were updated for explicit role and audit history.

The next RFP security correction is implemented in migration 0094, with
`rfp.approve` and `rfp.distribute`, Super Admin version four, and immutable
MMHR approval evidence. Five approval and six distribution tests pass in
isolated databases. The existing-administrator upgrade rehearsal also passes.
Migration 0094 is not yet applied to the shared local or cloud databases.
The ongoing aggregate integration run has known failures and cannot count as
a green release gate. The latest full unit run passed 2,752 tests, and the
production build passed all 63 routes. Expanded approval and distribution
checks pass six and seven tests, including external override denial, private
helper grants, and exact approval provenance. Migration 0095 now corrects
amendment approval with internal AAL2 permission, MMHR base evidence, and
invalid-action rejection. Ten amendment integration tests and eight focused
unit tests pass. Type checking, lint, and the 63-route production build pass.
The command-upgrade rehearsal preserves legacy rows and audit events while
denying reuse of legacy approval receipts as new MMHR review evidence.
Migrations 0094 and 0095 remain unapplied to shared local and cloud databases.

September 5: dependency audit reports zero vulnerabilities. Shared CI now starts
Auth and API services and blocks on the full dependency audit. Remote CI remains
unverified. Migration 0093 adds internal AAL2 `finance.manage` to seven finance
commands and Super Admin version three, with immutable prior-version authority.
Six isolated finance integration files pass. The local migration is applied.
Old local diagnostic assignments were revoked with audit entries; no records
were deleted. Full current-suite verification remains open.

The finance regression confirmed that workspace permission alone allowed
external administrators and viewers to write commission data. Remaining generic
workspace-authorized domain commands require review before UI wiring or release.
Functional domain routers and portal screens remain incomplete.

The following summary describes the earlier R1 baseline:
The current package adds 30 typed permissions, 60 explicit role defaults,
caller-bound database evaluation, field filtering, permission-aware tRPC
builders, audited commands, recovery, identity adapters, restricted worker
delivery, guarded portal routes, and an identity-only MFA flow.

Migration 0003 preserves approved version-one role history and activates
version-two defaults. It is applied only to the validated local MMHR stack.
No cloud or production migration occurred.

Type checking, lint, recovery cases, worker cases, boundary cases, and the
production build pass. The latest unit suite passes 271 files and 2,739 tests.
The complete integration suite passes all 82 files and 678 tests. This run
includes identity, recovery, migration, restore, rollback, and guarded API
rehearsals with approved local Docker access.

Docker Desktop 4.89.0 recovered after two stale generated socket directories
were archived. The Linux engine reports 29.7.2, and all nine MMHR containers
are healthy. The guarded proxy deadlock was caused by buffered Docker wait
headers; immediate header flushing removes the deadlock.

The local migration ledger now applies 93 migrations through
`drizzle/0092_r1_invitation_read.sql`. Public `mmhr_*` functions revoke
inherited PUBLIC access. Only `mmhr_create_lead` permits anonymous execution.
The empty-database and rollback rehearsals match the current R0-R9 inventory.

The focused R4 workflow migration review passed 8 tests, including required
tables, RLS, deny policies, organization-scoped composite keys, replay and
idempotency constraints, and recovery comments.

The focused R2B activity-task migration review passed 7 tests, including
required tables, RLS, deny policies, organization-scoped history, indexes, and
append-only posture. The focused R3 intake migration review also passed 7 tests,
and the focused R2B CRM foundation migration review passed 7 tests.
The latest complete unit suite now passes 265 files and 2,670 tests. The
verbose reporter exposed steady progress on the Windows worker pool.

The focused R2A lead-command migration review passed 8 tests, including raw
table revocation for all runtime roles, consent and idempotency checks, fixed
search-path command security, and audit recording. Its reviewed migration is
applied in the local rehearsal database.

The focused R2B deal and vendor-evidence migration review passed 8 tests,
including scoped deal history, renewal windows, vendor-source and fact links,
immutable evidence versions, approval and freshness rules, and deny-first raw
access. Its reviewed migration is applied in the local rehearsal database.

The focused R3 scorecard migration review passed 8 tests, including
organization-scoped intake and candidate links, weighted criteria, unique
scorer entries, immutable replacement history, bounded scores, and deny-first
raw access. The migration is applied in the local rehearsal database.

The focused R3 candidate-transition migration review passed 3 tests. The
elevated local rehearsal passed 2 tests for lifecycle transitions, replay,
optimistic revisions, approval-bound reactivation, and cross-organization
denial. The migration is applied in the local rehearsal database.

The focused R3 candidate-add migration review passed 3 tests. The elevated
local rehearsal passed 2 tests for replay, the initial five-candidate cap,
review-only additions, and cross-organization denial. The migration is applied
in the local rehearsal database.

The focused R3 candidate-masking migration review passed 3 tests. The elevated
local rehearsal passed 2 tests for masked labels, replay, approval-bound
unmasking, immutable disclosure state, and cross-organization denial. The
migration is applied in the local rehearsal database.

The focused R3 comparison migration review passed 2 tests. The elevated local
rehearsal passed 2 tests for organization-scoped masked candidate reads,
approved-scorecard filtering, hidden vendor fields, and cross-organization
denial. The migration is applied in the local rehearsal database.

The local migration ledger now contains 93 migrations through
`drizzle/0092_r1_invitation_read.sql`.

R4 versioning is now decided and implemented as one common RFP base plus
additive, immutable, vendor-scoped amendments. The amendment command requires
an approved base, active vendor, replay-safe audit receipts, and a distinct
approver. Focused tests, type checking, lint, production build, and the
elevated authenticated local amendment rehearsal pass.

R5 durable AI run recording is now implemented as provider-neutral metadata and
hashes with an audited create, human approval, and replay-safe RPC. The creator
reference is nullable for expand-and-contract compatibility with existing rows.
Focused command and migration tests, type checking, and the elevated
authenticated local rehearsal pass for creation, replay, approval, and distinct
reviewer enforcement.

R5 provider-evaluation evidence is now durable and platform-scoped. The command
stores fixture-set and report hashes, requires a passed evaluation before
approval, denies self-review, and records replay-safe audit receipts. Focused
command and migration tests plus an authenticated local rehearsal pass.

R9 operational evidence now has an organization-scoped command and migration
for redacted availability observations and route performance measurements.
Focused command, migration, type, lint, build, matrix, and secret checks pass.
The authenticated local rehearsal passes recording, replay, audit-safe
summaries, and cross-organization denial. Target measurements and release
evidence remain open.
Performance percentile validation now matches the integer-millisecond database
schema, with regression coverage for fractional input rejection.

Added `drizzle/0063_r6_demo_round_commands.sql` with audited demo lifecycle transitions and bounded feedback. Authenticated rehearsal passes lifecycle, replay, transition, and feedback checks.
Added `drizzle/0064_r6_proposal_commands.sql` with immutable proposal versions and approved-only comparisons. Authenticated rehearsal passes.
Authenticated R6 demo and proposal rehearsals now pass their local isolation checks.
Added `drizzle/0065_r6_contract_handoff_commands.sql` with deal-scoped selection, transitions, revision checks, and immutable history. Authenticated rehearsal passes selection, transition history, and signed terminal outcome checks.
Added `drizzle/0066_r7_commission_commands.sql` with effective-dated structures and idempotent signed-contract events. Authenticated rehearsal passes effective-date scope, calculation integrity, and idempotent event replay checks.
Added `drizzle/0067_r7_payment_commands.sql` with bounded payment recording and automatic paid/partial balance state. Authenticated rehearsal passes.
Added `drizzle/0068_r7_invoice_commands.sql` with invoice draft, issue, and void controls. Authenticated rehearsal passes.
Added `drizzle/0069_r7_dispute_commands.sql` with audited dispute open, resolve, and reject controls. Authenticated rehearsal passes.
The authenticated R7 invoice and dispute rehearsals now pass scoped lifecycle and replay checks.
Added `drizzle/0070_r7_adjustment_handoff_commands.sql` with compensating adjustment and approved finance-handoff controls. Authenticated rehearsal passes adjustment, replay, closed-event handoff, and replay checks.
Added `drizzle/0071_r7_reconciliation_reports.sql` with immutable source-event reconciliation reports and invoice, payment, period, and dispute checks. Authenticated rehearsal passes report recording and replay.
Added `drizzle/0072_r8_onboarding_commands.sql` with deal-scoped onboarding creation, lifecycle transitions, failure retention, and approval-bound reactivation. Authenticated rehearsal passes.
Added `drizzle/0073_r8_work_item_commands.sql` with audited role-scoped work-item creation, optimistic status updates, escalation guards, and replay. Authenticated rehearsal passes.

Added `drizzle/0074_r8_renewal_commands.sql` with audited renewal creation, source and follow-on deal scope, forward-only transitions, approval-bound terminal outcomes, and replay. Authenticated rehearsal passes.

Added `drizzle/0075_r8_project_plan_commands.sql` with audited template creation and approval, deal-scoped plan generation, revision checks, and replay. Authenticated rehearsal passes.

Added `drizzle/0076_r8_administration_configuration.sql` with deny-first versioned configuration storage, approval and retirement controls, self-approval denial, and replay. Authenticated rehearsal passes.

Added `drizzle/0077_r8_approval_queue.sql` with deny-first approval requests, organization scope, optimistic transitions, requester self-review denial, and replay. Authenticated rehearsal passes.
Added `drizzle/0078_r8_follow_up_schedules.sql` with organization-scoped vendor, customer, product, and risk check-in schedules, bounded cadence, approval, pause, retirement, and replay controls. Authenticated rehearsal passes.
Added `drizzle/0079_r2b_vendor_fact_overrides.sql` with source-linked, expiring vendor-fact overrides, audited permission checks, replay, and organization scope denial. Authenticated rehearsal passes.
Added `drizzle/0080_r2b_deal_commands.sql` with audited deal creation, vendor-link checks, optimistic stage transitions, immutable stage history, replay, and stale-transition denial. Authenticated rehearsal passes.
Added `drizzle/0081_r2b_relationship_commands.sql` with audited relationship creation and updates, endpoint validation, influence, preference, ownership, replay, and stale-revision denial. Authenticated rehearsal passes.

Added `drizzle/0082_r2b_vendor_source_registry.sql` with source ownership, capture method, cadence, licensing, review requirements, and audited retirement. Authenticated rehearsal passes.
Added `drizzle/0083_r4_document_search.sql` with approved extracted content, metadata indexing, organization-scoped search, and audited content updates. Authenticated rehearsal passes.
Added `drizzle/0084_r4_evaluation_routing.sql` with MMHR-first evaluation routes and won-deal final-selection transition to direct communication. Authenticated rehearsal passes.
Added `drizzle/0085_r2b_vendor_acquisition.sql` with provider-neutral manual and automated acquisition runs, active-source checks, optimistic revisions, bounded artifacts, replay, and audited lifecycle transitions. Focused, type, lint, build, and authenticated checks pass.
Added the server-only vendor extraction and validation boundary with a versioned structured schema, source references, cost limits, low-confidence review, and material-change detection. Focused and type checks pass.
Added the published vendor freshness assessment with the 95 percent PRD threshold and empty-population guard. Focused checks pass; scheduled production measurement remains open.
Reconciled existing R1 delegation, organization-member administration, and portal sharing commands as Partial roadmap coverage with local authorization and audit evidence. Target-environment portal evidence remains open.
Added work-email validation with a personal-domain deny list and bounded reviewed exception. Reconciled the existing consent-aware newsletter route as Partial coverage. Focused checks remain required before release.
Added approval-bound marketing content and deal-scoped evaluation collaboration contracts. FR-MKT-04 and FR-EVL-07 moved to Partial; durable wiring and target-environment journeys remain open.
Reconciled existing availability, performance, deletion, and recovery evidence contracts as Partial coverage. Production measurements, deletion completion, and restore drills remain open.
Marked the tested LCP and INP performance budget contracts as Partial roadmap coverage. Required percentile measurements remain open.
Marked customer portal isolation and public claim quarantine as Partial roadmap coverage. Complete resource journeys and approved claim records remain open.
Added the gated-resource access boundary requiring identity, consent, and active lead routing. FR-MKT-08 moved to Partial; full resource inventory and target-environment evidence remain open.
The authenticated R1 security boundary check now covers all R7 finance tables, including reconciliation reports, with no raw authenticated read grants. FR-IAM-11 remains Partial pending target-environment portal evidence.
The authenticated R7 commission rehearsal now passes structure creation, vendor/deal scope, and idempotent event replay checks.

The R4 response-normalization package is implemented in migration 0056 with
bounded extraction arrays, organization-scoped inbound-event links, pending
human-review state, replay protection, and audited output. Focused command,
migration, type, lint, and integration-matrix checks pass. The authenticated
local isolation rehearsal also passes for recording, replay, and denial.

The R4 response-review package is implemented in migration 0057 with
separate review, approval, and rejection transitions. Approval requires a
distinct MMHR identity and an approval reference. Focused command, migration,
type, lint, and integration-matrix checks pass. Its authenticated rehearsal
also passes for distinct review, approval, replay, and audit recording.

The R4 response-clarification package is implemented in migration 0058. It
links clarification requests to normalized responses, records deadlines and
vendor response references, and enforces audited ask and respond transitions.
Focused checks and the authenticated local rehearsal pass.

The R4 response-failure package is implemented in migration 0059. It keeps
redacted ingestion and extraction failures visible as terminal records with
optional retry metadata and prevents raw response content from entering the
failure record. Focused checks and the authenticated local rehearsal pass.

The R4 workflow-communication package is implemented in migration 0060. It
queues provider-neutral outbound or inbound records and updates delivery state
with strict references, replay protection, and audited transitions. Focused
checks and the authenticated local rehearsal pass.

The R4 document-controls package is implemented in migration 0061. It stores
bounded quarantined metadata, tracks scan state, permits approval only after a
clean scan, and preserves immutable versions. Focused checks and the
authenticated local rehearsal pass; provider scanning and signed URLs remain
open.

The R4 job-controls package is implemented in migration 0062. It provides
audited enqueue, claim, completion, failure, retry, and manual-rerun records
with bounded attempts and redacted failure details. Focused checks and the
authenticated local rehearsal pass; durable worker deployment remains open.

R6 demo, proposal, and contract-handoff contracts, R7 finance contracts, and
R8 onboarding, work-queue, and project-plan contracts have focused unit
evidence. Their persistence commands and authenticated database rehearsals
remain open.

The focused R3 requirement-metadata migration review passed 2 tests. The
elevated local rehearsal passed 2 tests for structured and custom metadata,
bounded evidence references and vendor links, optimistic revisions, replay,
audit recording, and cross-organization denial. The migration is applied in
the local rehearsal database.

The focused R3 workspace-view migration review passed 2 tests. The elevated
local rehearsal passed 2 tests for latest-snapshot selection, organization
scope, stage, candidates, tasks, approvals, events, recent activity, and audit
recording. The migration is applied in the local rehearsal database.

The focused R3 workspace-comment migration review passed 2 tests. The
elevated local rehearsal passed 2 tests for bounded customer comments,
idempotent replay, audit recording, and cross-organization denial. The
migration is applied in the local rehearsal database.

The focused R4 RFP-create migration review passed 2 tests. The elevated local
rehearsal passed 2 tests for submitted-intake revision binding, bounded
versioned sections, idempotent replay, audit recording, and cross-organization
denial. The migration is applied in the local rehearsal database.

The focused R4 RFP-approval migration review passed 2 tests. The elevated
local rehearsal passed 2 tests for distinct reviewer approval, approval
references, replay, audit recording, and self-approval denial. The migration
is applied in the local rehearsal database.

The focused R4 RFP-distribution migration review passed 2 tests. The elevated
local rehearsal passed 2 tests for approved-version gating, active vendor
scope, delivery fields, replay, audit recording, and denial of unapproved
versions. The migration is applied in the local rehearsal database.

The focused R4 RFP-clarification migration review passed 2 tests. The elevated
local rehearsal passed 2 tests for ask, answer, decision, distinct MMHR
approval, replay, audit recording, and answerer self-approval denial. The
migration is applied in the local rehearsal database.

The focused R4 response-ingestion migration review passed 2 tests. The
elevated local rehearsal passed 2 tests for signed metadata, approved-RFP and
active-vendor association, replay, redacted attachment counts, audit
recording, and cross-organization denial. The migration is applied in the
local rehearsal database.

The focused R3 workspace migration review passed 8 tests, including
organization-scoped intake and workspace links, bounded snapshots, revision
uniqueness, participant state timestamps, visibility labels, and deny-first
raw access. The migration remains unapplied until local Supabase and Docker
access returns.

The focused R5 AI run-record migration review passed 10 tests, including
provider-neutral identifiers and hashes, raw-payload exclusion, bounded
capabilities and review states, usage and timestamp constraints, organization
scope, immutable approval history, and deny-first raw access. The migration
is applied in the local authenticated rehearsal database, and the create,
replay, approval, and distinct-reviewer checks pass.

The focused R6 demo, proposal, and contract-handoff migration review passed 8
tests, including organization-scoped deal links, demo scheduling and feedback
bounds, source-backed proposal versions, approved comparison scope, handoff
status boundaries, immutable history, and deny-first raw access. The migration
remains unapplied until local Supabase and Docker access returns.

The focused R7 finance migration review passed 8 tests, including effective-
dated commission structures, idempotent commission events, payment and invoice
bounds, dispute and adjustment evidence, finance handoff scope, immutable event
history, and deny-first raw access. The migration remains unapplied until local
Supabase and Docker access returns.

The focused R8 customer-success and operations migration review passed 8 tests,
including onboarding snapshots and history, approved project-plan templates,
revisioned plans, role-scoped queue work, retained failure states, organization
isolation, and deny-first raw access. The migration remains unapplied until
local Supabase and Docker access returns.

The focused R9 evidence persistence migration review passed 8 tests, including
deletion deadlines and retention, legal-hold decisions, bounded availability
observations, route performance budgets, duplicate prevention, organization
isolation, and deny-first raw access. The migration remains unapplied until
local Supabase and Docker access returns.

R9 now has a checked-in evidence manifest and CI validation command. A
server-only recovery evidence contract validates restore drills and rollback
rehearsals, including RPO, RTO, approval, freshness, and duplicate checks. The
release mode remains fail-closed until each real gate has an evidence record.
CI also runs a high-confidence repository secret scan. Dependency auditing is
visible but remains advisory until the current findings receive remediation.
The latest full audit reports 86 vulnerabilities: 59 high, 25 moderate, 1 low,
and 1 critical. The production-scope audit reports 54: 35 high, 18 moderate,
and 1 low, after the Next.js 16.3.4 upgrade. Remaining advisories include
transitive packages with no available fix. A remediation dry-run could not
fetch registry metadata because npm cache writes are denied here.

See docs/security/r1-permission-evaluation.md, docs/security/r1-evidence.md, and
[[journal/2026-09-01]].
The existing request-scoped helper still needs dbac05f before integration.
Permission-protected home, admin, customer, and vendor route foundations are active in code. R1.8 local evidence records and matrix checks are present. Runtime recovery and production worker scheduling remain disabled.

## Open threads
- Submit dbac05f after exact remote-write approval. Close the late PR 8 and PR 9 findings after remote validation.
- Integrate the local evaluation foundation only after its stable-ID prerequisite and remote checks pass.
- R1.6 invitation database commands now call reviewed token-free SQL functions with permission checks, receipts, and audit records; target-environment wiring and evidence remain open.
- Complete R1.8 target-environment evidence and browser evidence.
- Narrow platform allows to platform scope before mutation access opens. See the owning plan's command decisions.
- Keep recovery disabled until stable identity bindings, verified factors, contact preparation, audited commands, and all recovery tests pass.
- The interim recovery pair has no backup. Recovery stops when the required other administrator is unavailable.
- Do not use a stale AAL2 token as proof of current MFA enrollment.
- Complete end-to-end R2A through R9 workflows with objective evidence.
- Keep the R9 evidence manifest blocked until complete integration, browser, accessibility, performance, recovery, deployment, and release approvals exist.
- Remediate the dependency audit findings before making the dependency check blocking.
- R0 claim review, public-release controls, old deployment aliases, and live verification remain open.
- Production state was not reverified during this local package. Do not infer current production safety from local checks.
- The environment rejected the authorized feature-branch push because the configured private GitHub remote is unverified. Do not bypass that control.
- Validate staging before production migration or deployment. The active goal grants authority, not evidence.
- Target environments must set NEXT_PUBLIC_APP_URL to one canonical origin.
- RLS remains enabled on every application table. Request access uses fixed functions and a request-scoped public client.
- The restricted direct PostgreSQL worker has no raw table access. Worker delivery is locally verified but not activated in a target environment.
- Customer and vendor routes have guard foundations. CRM, workflow, finance, and operations foundations are additive and deny-first.
- R2B now includes strict search, duplicate-review, activity-history, and task-transition contracts. CRM contact and product writes use reviewed fixed RPCs with authenticated local isolation evidence.
- R2B vendor evidence now has strict source, fact, evidence-version, approval, freshness, and expiring-override contracts. Persistence and approval commands remain fail-closed.
- R2B controlled exports now require a same-organization approval, allow only resource-specific fields, redact all other row fields, and emit an audit record.
- R2B CRM export requests and decisions now use fixed audited RPCs with explicit `audit.export` approval, self-approval denial, replay receipts, and closed raw tables.
- R2B vendor evidence now has fixed audited record and approval RPCs with exact organization scope, draft-to-published approval, replay receipts, and closed raw tables.
- R2A lead routing now has a fixed audited command with active-owner membership checks, terminal-state protection, replay receipts, and exact organization scope.
- CRM command functions use fixed reviewed RPCs by default, with optional injected adapters for tests and replacements. They validate operation, organization, revision, outcome, and correlation fields.
- The guarded recovery-MFA API file passes both AAL1 and AAL2 cases with exact scratch cleanup. The full integration suite also passes.
- Public claims and commission copy still need approved evidence before release.
- Drizzle metadata is reconciled with all 34 checked-in migrations. Review the generated ledger before any target deployment.
- A provider-neutral server-only AI service boundary, immutable run-record
  contract, approval transition checks, and fixture tests now exist. Database
  storage, provider evaluation, and target environment evidence remain open.
- R5 AI routing now validates adapter capability and data-class profiles, deterministic selection, bounded retries, timeout handling, schema failures, and explicit approved fallbacks.
- R5 fixture evaluation now validates complete input and output hashes, schema and provider failures, deterministic ordering, and redacted results without retaining raw provider output.
- R3 candidate lifecycle transitions now enforce allowed paths, positive expected revisions, terminal selected and archived states, and approval-bound reactivation.
- R3 intake now has immutable snapshots, strict organization-scoped requirements, submission prerequisites, and revision-checked status transitions.
- R2B deals now have strict organization scope, stage and status alignment, forward-only transitions, terminal outcomes, optimistic revisions, and immutable history.
- R2A lead capture now uses a private implementation with isolated parameter names behind the stable public RPC, removing the authenticated `idempotency_key` ambiguity while preserving replay and audit behavior.
- R3 scorecard entry persistence now uses a fixed organization-scoped RPC with scorer binding, optimistic revision checks, replay receipts, and immutable entry history.
- R3 candidate lifecycle transitions now use a fixed organization-scoped RPC with replay receipts, optimistic revisions, and approval-bound reactivation.
- R3 candidate identity masking now records masked labels and requires an approval reference and reason for unmasking.
- R3 comparison reads now expose only organization-scoped masked candidates and approved scorecard values.
- R3 saved intake persistence now stores bounded draft revisions with immutable history and replay-safe audited writes.
- R3 deterministic matching now evaluates approved rule versions against published vendor facts, records bounded explanations, and excludes commercial fields from scoring.
- R3 matching rule sets now require an audited approval transition before active matching runs can use them.
- R3 comparison exports now use deny-first request and separate reviewer-decision records with replay and scope checks.
- R3 duplicate-product review now archives confirmed duplicate candidates while retaining immutable review evidence.
- R2B activity and task persistence now has an additive deny-first migration with organization-scoped tables and append-only task history; application remains unverified until local Supabase access returns.
- R3 workspace controls now validate scoped snapshots, participant status timestamps, immutable comments, and customer filtering of internal comments.
- R4 workflow persistence now has an additive deny-first schema for RFP versions, inbound email, immutable documents, communications, jobs, and job attempts; application and provider integration remain unverified.
- R4 now has a strict RFP version, approval, recipient, and distribution contract. Unapproved versions cannot distribute, recipients must be scoped and unique, and distribution freezes version content.
- R4 inbound email now has strict signature, timestamp, replay, address, and reference validation. Raw message content never enters the normalized event.
- R4 document access now validates immutable version scope, excludes superseded versions, and limits HTTPS signed access to fifteen minutes.
- R6 now has a strict demo request contract with distinct customer/vendor organizations, revision-checked scheduling, audited transitions, and terminal outcomes.
- R7 commission events now have audited forward-only state transitions with stale-state checks and terminal voided or written-off outcomes.
- R8 renewals now have immutable customer-success snapshots, scoped renewal windows, linked follow-on deal checks, audited approvals, and terminal outcomes.
- R8 onboarding now has immutable plans with milestone, check-in, risk, failure, completion, cancellation, and approval-bound reactivation controls.
- R8 project plans now generate only from approved templates and support revision-checked edits that protect completed milestones and go-live dates.
- R8 analytics now accepts only bounded non-sensitive event properties and blocks provider calls until explicit consent exists.
- R8 approval queues now enforce immutable decisions, anti-self-approval, reviewer metadata, and optimistic revisions.
- R8 customer-success outcomes now require distinct organizations, valid satisfaction scores, linked follow-on deals, and immutable source-event history.
- R8 customer-journey reports now reconcile onboarding, renewal, and outcome snapshots by organization with deterministic as-of checks.
- R8 vendor-performance reports now aggregate allowlisted response, qualification, demo, win, onboarding, payment, and failure events with organization isolation.
- R8 operations reports now summarize role-scoped open, overdue, and escalated queue work from source snapshots.
- R8 audit-viewer searches now enforce organization scope, actor/entity/action/date filters, stable pagination, and immutable redacted rows.
- R8 administration configuration now has versioned draft, approval, and retirement transitions with creator separation and secret-key rejection.
- R8 analytics reports now summarize consented marketing, lead, intake, evaluation, activation, and workflow-use events with as-of and duplicate checks.
- R8 revenue reports now summarize signed deals and commission lifecycle amounts by currency with organization, as-of, and duplicate checks.
- The complete suite now passes 116 files and 2,231 tests after the audit-viewer, administration-configuration, analytics-report, revenue-report, performance-evidence, accessibility, security-review, deployment-smoke, AI-routing, AI fixture-evaluation, R3 intake, R2B deal-lifecycle, R2B CRM entity, R2B activity-task, R2B activity-task persistence migration, R3 scorecard, R3 workspace, R4 workflow persistence migration, overflow, analytics-boundary, and fail-closed release-payload fixes.
- R9 performance evidence now validates required routes, LCP and INP percentile budgets, sample counts, as-of timestamps, and complete route coverage.
- R9 operational evidence now has an organization-scoped audited RPC with exact-request replay and authenticated local rehearsal evidence.
- R9 deletion requests now persist the requesting identity, and a fixed audited RPC records requests and distinct reviewer decisions with replay protection. Focused migration review and authenticated local isolation rehearsal pass.
- The latest complete unit suite passes 265 files and 2,670 tests after the R9 command and inventory additions. Type checking, lint, integration-matrix, secret scan, and staged diff checks pass.
- Local Chromium and axe-core checks now pass all 21 public marketing and gallery routes at desktop size, plus home, Pulse, and sign-in at mobile size, with zero violations. The Chromium accessibility tree reports zero unnamed controls. Target and manual screen-reader evidence remain open.
- R9 security-review evidence now requires domain coverage, reviewer evidence, immutable findings, and no open findings in a passed review.
- R9 deployment smoke evidence now validates canonical HTTPS origin, health, protected-route closure, commit identity, and migration rollback compatibility.
- Commission structure input now rejects an effective end before its effective start, matching the database constraint; focused validation tests pass.
- R7 now enforces one commission event per organization and signed contract with an additive unique index; duplicate rows require preflight review before migration.
- Local HTTP checks return 200 for the home, Pulse, sign-in, and resources routes; the lead API correctly rejects GET with 405.
- The manual production release workflow now runs standard CI gates before evaluating the R9 evidence manifest; remote execution is still pending.
- The release workflow now also requires a separate integration-test job before R9 evidence evaluation; remote execution remains pending.
- The Drizzle work-item schema now matches the R8 table's role, reminder, escalation, and timestamp checks; focused validation passes.
- R8 work-item tests now cover exact scope, actor matching, authorized-client use, malformed responses, and update prerequisites.
- R8 onboarding tests now cover exact scope, actor matching, authorized-client use, malformed responses, and reactivation approval.
- R4 workflow-document upload validation now matches the database quarantine-reference limit and has a regression test for overlong references.
- R7 Drizzle finance schemas now include the SQL amount, date, state, approval, resolution, timing, and handoff-bound checks.
- R5 Drizzle AI schemas now include SQL identifier, failure-state, identity-reference, creator-index, and scoped-history constraints; focused checks pass.
- R6 Drizzle workflow schemas now include the reviewed demo, feedback, proposal, comparison, and contract-handoff metadata checks; focused checks pass.
- Contract-handoff commands now reject illegal lifecycle transitions before authorization or RPC; focused checks pass.
- R3 Drizzle scorecard schemas now include reviewed intake, candidate, criteria, entry, history, and evidence constraints; focused checks pass.
- R3 Drizzle workspace schemas now include reviewed intake and child-record scope foreign keys, snapshot arrays, and participant lifecycle checks; focused checks pass.
- The post-hardening production build completes 61 routes; integration matrix and secret scan pass. The aggregate unit run remains too slow in this environment and was stopped after ten minutes.
- R3 Drizzle intake schemas now include structured metadata, immutable intake history, and approval-bound candidate-mask columns and checks; focused validation passes.
- R3 now has Drizzle matching rule-set and deterministic-run models with reviewed scope, approval, bounds, snapshot, and index constraints; focused validation passes.
- R3 now has a Drizzle initial-evaluation assessment model with scoped intake ownership, masked-only state, bounded snapshots, and review-aligned indexes; focused validation passes.
- The latest build completes 61 routes after R3 schema additions; integration matrix and secret scan pass, while all 12 R9 evidence checks remain blocked.
- R2B CRM Drizzle schemas now include reviewed scope foreign keys and export or duplicate-candidate integrity checks; focused validation passes.
- The latest build completes 61 routes after R2B schema additions; integration matrix and secret scan pass, while all 12 R9 evidence checks remain blocked.
- R4 workflow schemas now include reviewed response normalization, clarification, failure association, amendment, and document-search constraints; focused validation passes.
- R4 evaluation-route scope and timestamp checks plus clarification approval-reference validation now match SQL; the forward-declared clarification association remains SQL-only.
- The remaining Drizzle parity review now covers R9 evidence, R7 finance, R6/R8 workflow records, R2B CRM and leads, and R3 comparison exports and duplicate reviews. Focused R3 suites, type checking, lint, build, integration-matrix, secret scan, and diff checks pass. One forward-declared R4 clarification association remains SQL-only.
- R1 authorization, bootstrap, invitation, and worker boundaries were rechecked against the approved contract. Seven focused R1 test files passed 275 tests; a broader auth-and-command batch produced no progress and was stopped, so it is not claimed as passed.
- Request-scoped organization lookup now canonicalizes uppercase UUID input before the authorization RPC and comparison. The regression test, type check, lint, and diff checks pass.
- Audit-event Drizzle schema now includes both immutable summary safety checks backed by `r1_audit_summary_is_safe`; the migration parity regression test passes with focused audit tests.
- CRM search status contracts now include product/contact states and filter open deals by their returned stage/status value; focused CRM suites pass 15 tests.
- Authentication actions now redact raw Supabase sign-in and sign-up errors; focused action tests pass 16 tests with type-check and lint green.
- Local HTTP smoke checks confirm authentication pages return 200, protected pages redirect, and public mutation routes reject GET with 405; browser and production evidence remain open.
- Production build passes after the CRM and authentication fixes and generates all 61 routes; only known middleware and Sentry deprecation warnings remain.
- The lead command now validates unknown route input directly, removing an unsafe API-route cast; lead command and route tests pass 16 tests and type-check remains green.
- R1.5 now has a guarded `/pending-access` route for authenticated pending or active identities without workspace permission; page-guard tests pass 19 tests and the production build contains 62 routes.
- Git staging remains blocked because `.git/index.lock` cannot be created; local changes and unrelated work remain preserved, so commit and remote delivery are still pending.
- The pending-access page is now recorded in the R1 entry-point inventory and authorization matrix; inventory and R1 security suites pass 8 tests.
- Integration-matrix and secret-scan gates remain green after the latest changes: 82 test files and 919 tracked files scanned.
- Verified continuation files are staged, but commit creation was rejected because separate commit approval is required; no remote delivery occurred.
- The manual production release workflow now provisions a disposable Supabase stack, exports its local API key and database URL, applies Drizzle migrations, and then runs integration tests; local secret scan passes after removing the inline credential URL.
- The post-workflow production build passes and generates 62 routes; the known Next middleware and Sentry deprecation warnings remain.
- The post-workflow focused boundary suite passes 36 tests across authentication, pending access, CRM search, migration contract, and entry-point inventory files.
- Pending-access now trusts the caller-bound application identity RPC instead of comparing its application ID with the separate Auth subject ID; a distinct-ID regression test passes.
- R1.6 now includes generated migration 0092 with a fixed verified-email invitation read RPC, a token-free `/invitations/accept` page, and an exact-origin audited acceptance action; focused invitation and inventory tests pass 24 tests.
- The latest production build passes with 63 routes. The aggregate Vitest run was observed for several minutes without output and was stopped; it remains unverified.
- The release workflow now validates that both the generated local database URL and anonymous key are present before migration and integration steps.
- A focused commit attempt for the staged invitation package was rejected by the repository commit-authorization policy; no workaround was used and the staged files remain intact.
- RLS integration coverage now checks anonymous denial and active-member empty results for `mmhr_get_my_invitations`, plus fixed-function inventory parity; the test remains environment-gated.
- The latest focused package passes 24 tests, type check, lint, and integration-matrix validation after this RLS coverage addition.
- Local Supabase is available on the configured MMHR ports. Migration 0092 applied successfully, and the focused RLS integration file passed 9 tests when run directly with generated local keys. The npm wrapper can inject stale `.env.local` keys, so the direct command is the reliable local evidence.
- The guarded recovery-MFA API rehearsal was retried after removing stale scratch artifacts and hardening Docker context and resolved-binary selection. Unguarded disposable startup succeeds, but the guarded API startup still exits 125 before the guard receives requests. The API recovery evidence remains blocked pending a compatible Supabase/Docker guarded startup path.
- Guard tracing now proves the guarded socket receives the full startup sequence, including healthy database polling and helper-container lifecycle calls. The installed Supabase CLI still aborts with Docker exit 125 after those proxied calls, so the remaining issue is an incompatibility in the guarded Windows Docker lifecycle rather than routing or stale artifacts.
- The complete unit suite now passes 271 files and 2,739 tests. The dependency audit could not reach the npm advisory endpoint, and all twelve R9 evidence records remain blocked.
- The guarded Docker proxy now permits a bounded ten-minute upstream wait for Supabase helper lifecycle calls; guard and CLI tests plus type checking pass. A retry could not run because Docker Desktop stopped and did not restore its Linux daemon in this session.
- Docker Desktop process launch succeeded, but `com.docker.service` remains stopped and Windows denied service start. The guarded recovery rehearsal therefore remains externally blocked, not application-verified.
- Docker Desktop recovered after archiving stale generated sockets in its run and secrets-engine directories. The engine reports 29.7.2, all nine MMHR containers are healthy, and no disposable recovery containers remain.
- The guarded Docker proxy now flushes upstream response headers before streaming the body. Its 11 focused tests, type check, lint, build, and both real recovery-MFA API cases pass.
- Canonical R1 evidence paragraphs now cite the latest complete unit result of 271 files and 2,739 tests. The post-edit secret scan passed for 932 tracked files; R9 remains fail-closed.
- A resumed-state check confirms the R0 control record still requires separate approval for branch, commit, cloud, deployment, and release actions. Integration-matrix remains complete at 82 files, while the R9 readiness command reports all twelve checks blocked.
- The complete integration suite passes all 82 files and 678 tests after the schema-inventory repair.
- The complete unit suite passes 271 files and 2,739 tests. Type checking and lint also pass.
- The shared test inventory now covers 108 public tables, 93 migrations, and the one approved anonymous lead function.
- Docker engine 29.7.2 runs all nine healthy MMHR containers. No MMHR scratch containers, volumes, networks, or temporary directories remain.
- Retain all 22 gallery layouts. Verify both Pulse routes and themes if shared UI changes.
- Keep unrelated local settings and generated Codex hooks outside task commits.
- Keep the copied public-site corpus and questionnaire audit in docs/temp/ internal.

## Active skills in play
- (none)

## Notes
- Use docs/README.md as the project entry point.
- Use docs/PRD.md for product authority.
- Use docs/TECH_STACK.md for architecture and security authority.
- Use docs/security/r1-authorization-matrix.md for current entry-point classes.
- Use [[knowledge/superseded]] before consulting legacy plans.
- Verified identity does not prove membership or permission.
- Keep immutable audit history and deny-first recovery controls.
- Do not run consolidation before the current full-delivery task ends.
