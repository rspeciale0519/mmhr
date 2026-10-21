# Customer deal follow-up task verification

Date: October 3, 2026. Implementation and verification remain active.

The task workflow now has staff list, detail, history, and editing screens.
The new router reaches request-scoped commands and protected database functions.
This package does not complete all work or CRM requirements.
Reminders, escalation, project templates, full approval queues, scheduling, finance, and onboarding queues remain required.

## Required result and authority

Use `crm_tasks` as the canonical task record.
Bind a managed follow-up to one actual customer deal and organization.
Keep the original creator separate from its current owner and assignee.
Require a verified live AAL2 staff session, platform administration access, and current customer workspace access.
The current owner or scoped reviewed team manager can change task metadata, assignments, ownership, or cancellation.
An assignee can start, block, resume, or complete its current assignment.
Former owners, former assignees, and historical creators do not gain current authority through a receipt.

Changes require a current revision and a reason.
Completed and cancelled tasks reject new changes.
Exact retries return the original result after current authority checks.
Unknown replies keep their original request identifiers.
Known stale or denied replies require reload; invalid fields permit correction with a new request.

## Source and migration boundary

- [Task schemas](../../src/lib/deal-follow-up.ts)
- [Request-scoped commands](../../src/server/commands/deal-follow-up.ts)
- [Task router](../../src/server/trpc/routers/tasks.ts)
- [Staff screens](../../src/components/workflow/task-workspace.tsx)
- [Task persistence](../../src/server/db/schema/r8-deal-follow-ups.ts)
- [Migration 0159](../../drizzle/0159_r8_deal_follow_ups.sql)
- [Signed Auth and adversarial tests](../../src/server/db/r8-deal-follow-up-auth.integration.test.ts)

Drizzle generated the three tables and metadata through the installed CLI.
A separate generation configuration avoided loading private environment values.
The first attempt failed because this CLI duplicated an absolute output path, despite returning exit zero.
The corrected relative output produced the expected artifact.
Review moved the generated scope uniqueness before its referencing foreign key.
Only SQL ordering changed; generated metadata was not edited by hand.

The custom functions require current identities, sessions, roles, scopes, active organizations, and no unresolved recovery state.
New tables deny raw request-role access and enable RLS.
Immutable events require the matching security receipt and audit record.
Deferred guards require the complete saved snapshot, revision chain, and exact state transition evidence.
Additional guards reject duplicate or fabricated managed state history and queue resets without matching immutable events.
Legacy unbound task records remain unchanged.

Queue pagination binds organization, actor, queue, source revision, anchor, and a retained observation time.
Cursor observations expire after fifteen minutes.
A due-time crossing cannot change membership between pages of the same observation.
Current writes still invalidate the cursor through its queue revision.

## Executed checks and limits

The first focused unit run passed three files and 51 checks.
Its remaining component worker failed before loading the file.
This runner failure has no proven cause and remains failed evidence.
The isolated component run then passed eighteen checks and failed four field-label checks.
Help text was part of the field label, which prevented the exact accessible names.
The correction preserves the visible help text as an accessible description.
The unchanged assertions and added description checks passed all twenty-two component checks.

The [entry-point inventory checks](r1-entry-point-discovery-performance-2026-10-03.md) passed fourteen checks with their original time limits.
The durable authorization matrix records the new tasks routes and operations.
The integration inventory passed with 119 registered files.
Seven new direct-write regression cases passed focused lint; their database execution remains pending.
Full type checking and focused lint passed with exit zero.
A complete relevant unit run passed six files and seventy-six checks in 37.83 seconds.
That run covered task schemas, command bindings, controls, workspace rendering, migration ordering, and public table inventory.
Signed fixture setup now uses the existing 420-second setup and 180-second cleanup limits.
The integration configuration retains its twenty-second test limit.
Setup and cleanup cannot complete within Vitest's default ten-second hook limit.
No application request deadline, assertion, or testcase limit changed.
Migration rehearsals, signed Auth, browser, and complete candidate acceptance remain pending.
No saved local or hosted database received this migration.

The first signed Auth run failed while compiling migration 0159.
PostgreSQL returned `42601`, position 2210, before account setup.
An unparenthesized `CASE` expression in an `IF` condition caused the syntax failure.
All thirty-three checks were skipped, and owned cleanup passed.
The correction adds the required parentheses; the assertions and test limits remain unchanged.
The next run loaded all 160 migrations but failed before the task cases.
Its permission fixture used the target identity as the issuer, which violated `user_permission_overrides_actor_ck`.
The fixture now selects the other existing administrator as its issuer.
The next signed run passed seven checks and failed twenty-six checks.
Both application permission checks passed, but positive writes returned SQLSTATE `42501`.
Queue and choice reads also returned SQL failures.
All migration setup and owned cleanup steps passed.
The task workflow remains unaccepted.
A new isolated diagnostic run checks the existing public RPCs without additional grants or authorization exceptions.

The first 161-migration diagnostic snapshot failed in finance migration 0160 before task setup.
It skipped all thirty-four task checks; the separate finance record retains the syntax failure and correction.
The next diagnostic run passed seven checks and failed twenty-seven checks in 69.00 seconds.
Verified AAL2 identity and both permission checks passed.
Create failed at the security evidence or administration-capacity boundary with `42501`.
Queue and choice reads returned `22P02` in 21 and seventeen milliseconds.
The create request took 368 milliseconds.
Owned cleanup passed without remaining fixture resources.

The foreign test organization lacked the administrator required by the existing capacity guard.
The fixture correction adds an actual signed administrator; the application capacity rule remains unchanged.
Six array concatenations used unknown string literals, which PostgreSQL treated as invalid array input.
The correction uses explicit one-element arrays.
The audit summary now uses narrow task state and revision keys.
The existing generic status and version rules retain their original limits.
Event and commit guards also bind the exact audit actor, action, reason, identifiers, timestamps, and state summaries.
The corrected signed run remains required.

The next frozen run passed thirty-two checks and failed four in 122.69 seconds.
Its signed create, queue, and choice requests passed.
Three immutable-helper checks expected the wrong existing SQLSTATE; that helper uses `P0001`.
The forged receipt used an unsupported audit status and failed before the intended entity check.
Fixture corrections preserve exact helper messages and require successful receipt creation before the entity denial.

The corrected fixture run again passed thirty-two checks and failed four in 197.10 seconds.
All four fixture corrections passed.
Two composed pagination journeys reached their unchanged twenty-second aggregate limits.
Their remaining writes continued and affected two later checks.
The final snapshot confirmed a later task creation after its baseline.
The effect of those unfinished writes requires an isolated measurement before budget changes.
The measurement keeps every request assertion and uses a separate scratch diagnostic budget.
Owned cleanup passed with no remaining containers, volumes, or networks.
Both runs used frozen 161-migration snapshots; current migration 0161 is outside their scope.

The isolated measurement passed four selected cases in 166.73 seconds with all original assertions.
The history journey took 36,287 milliseconds; the queue journey took 28,260 milliseconds.
Individual signed writes took 735 through 3,349 milliseconds.
The later overdue and retry checks passed after those loops finished.
Only those two many-write journeys now have a 120-second aggregate test budget.
Every other case budget, request limit, and assertion remains unchanged.
The complete thirty-six-case run now uses a fresh 1,446-file snapshot with all 162 migrations.
That complete run passed all thirty-six signed Auth checks in 199.86 seconds with exit zero.
The history and queue journeys took 25.881 and 28.228 seconds.
All denial, replay, rollback, immutable history, and genuine positive request assertions passed.
Final hashes matched all 1,446 frozen files and thirty-nine shared dependency metadata files.
Owned cleanup passed with no remaining containers, volumes, or networks.
This is focused R8 evidence on 162 migrations.
Task browser behavior and complete candidate acceptance remain separate required checks.

## Additive request evidence correction

Independent source review found a remaining owner-write evidence gap after the signed baseline passed.
The existing guards bind receipt metadata but do not bind the original request digest or complete action effects.
A database owner with triggers active could construct matching task records for a different request.
Public RPC validation does not prove this separate owner-write boundary.

Generated migration 0163 adds nullable `original_request` evidence and a bounded JSON object constraint.
New events must retain the exact request and match its SHA256 receipt digest.
The private helper also checks exact audit metadata, current actor authority, assignments, transitions, and complete snapshot effects.
Checked function patches retain public arguments, results, function identity, owner, grants, volatility, and search path.
Existing immutable rows retain NULL requests because omitted fields and original timestamp text cannot be recovered.
The migration does not backfill or rewrite historical evidence.

Ten additional genuine Auth cases now register in the existing signed suite.
They check seven complete-looking create forgeries, a false completion, exact omitted fields, and direct microsecond timestamp requests.
Separate historical verification requires actual pre-additive create and edit calls before migration application.
The reviewed historical fixture is now registered as a separate four-case suite.
It captures actual create/edit results before the additive migration.
It then compares events, receipts, audit records, task state, queue state, and function properties.
It also tests later exact retries and eight valid actions within one consistent non-UTC transaction.
The named stage freezes migration bytes and requires a fresh, registered disposable target.
Its completion method rejects repeated or concurrent application.
Normal Auth fixture startup still applies all current migrations.
Full type checking and focused six-file lint passed after integration.
Four fixture selection and rehearsal files passed 37 checks in 10.38 seconds.
The integration matrix now passes with 122 registered files.
These local checks started no database service and establish no historical SQL result.
No fake historical rows or disabled triggers can establish compatibility.

Full type checking and focused three-file lint passed after integration.
Eight static source marker and compatibility checks passed.
These checks do not establish SQL execution or genuine Auth behavior.
The generated migration raises the current migration inventory to 164.
The earlier 36-case signed result remains evidence for its unchanged 162-migration snapshot only.
No saved or hosted database received migration 0163.

## Risk and recovery

The main risks are incorrect assignment, scope leakage, unauthorized transitions, duplicate retries, and altered task history.
The first independent review found missing history-insert and queue-mutation guards.
The source correction adds guards and no-mutation regression cases; actual signed database tests must verify them.
Large pagination cases also require measured aggregate timing before any test-budget decision.

If a defect appears, disable the new routes or revoke the new public RPC execution grants.
Retain tasks, bindings, events, receipts, and audit rows.
Use a reviewed forward correction.
Do not delete or rewrite prior customer work.
Saved migrations, hosted changes, actual account grants, and production remain separate controlled actions.
