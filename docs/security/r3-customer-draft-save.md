# Customer intake draft saving

Status: implementation and verification in progress. This does not complete the customer intake workflow or approve a release.

## Decision and scope

The full completion goal permits implementation choices within the approved customer journey.
Customers need to save ordinary intake answers after verified account setup.
The R1 plan assigns AAL2 to security administration and reserves domain action defaults for later modules.
The [domain contract](r1-domain-extension-contract.md) requires separate action permission and current customer portal access.

This package adds `intake.draft.save`, an organization action with minimum assurance AAL1 and required customer portal scope.
New immutable role versions add this explicit default to contributor, organization administrator and Super Admin roles.
Viewer, staff and administrator defaults do not gain this action.
Existing permission overrides and internal workspace restrictions remain effective.
Portal permission alone does not grant editing permission.

This is not an exception to the shared AAL2 security command helper.
The existing `mmhr_save_intake` operation gains a same-lock platform `admin.access` check in addition to scoped workspace access.
This closes an alternate path where external viewers with AAL2 could write through workspace access alone.
Internal AAL2 users retain the existing input, revision, receipt and submission checks.
External clients must use the new customer draft operation instead.
No connected application consumer used the legacy adapter before this change.
Requirement writes remain unchanged in this package.
The new command cannot change roles, membership, portal grants, requirements, ranking, approvals or submitted records.
Requirement entry and submission still need connected, separately reviewed customer operations.

## Entry points and data

- `src/server/trpc/routers/intakes.ts#saveDraft` requires an exact-origin POST and verified caller.
- `src/server/commands/customer-intake-save.ts` checks the new action and customer portal permission through the request client.
- `mmhr_save_customer_intake(jsonb, uuid, uuid)` derives the actor from the current verified session.

The browser can specify the target organization, intake, expected revision, draft state and bounded answer patch.
These identifiers select a target; they do not grant authority.
Correlation and retry identifiers travel separately to the RPC.
The RPC payload rejects actor, role, permission, correlation and retry fields.
The server rejects cross-scope authorization responses and inconsistent save results.

New records start at revision one.
Updates require the current revision and preserve omitted answer fields.
Draft records can remain draft or move to in-progress.
In-progress records cannot return to draft.
Submitted, under-review, completed and archived records cannot change through this command.
Exact retries may report the current later state without creating another write.
The client must not treat a replay as a new save or use it to unlock a submitted record.

## Risks and recovery

The main risks are cross-organization writes, accidental viewer access and lost changes during concurrent saves.
The database must serialize authority checks with the existing security guard and recheck current action and portal access.
History, redacted audit and retry receipts must commit with the saved answers.
Revision checks must reject stale writes rather than overwrite newer answers.
No runtime role gains direct table writes or private helper execution.
Append-only triggers now reject history updates, deletion and truncation, including owner-path mutation attempts.

Apply only after reviewed migration and real database evidence.
For containment, revoke runtime execution of the new RPC and remove its application wiring through a forward patch.
Keep history, receipts, audit, existing role versions and RLS intact.
Use a reviewed forward migration for any default correction.
Do not restore old broad writes or delete customer records.

## Verification

Focused command and registry tests pass: 143 tests across three files.
The expanded application checks pass: 157 tests across five files, including transport and permission-loss cases.
Type checking, full lint and the 67-route build pass before the final legacy containment change.
Final broader checks, SQL review and database evidence remain pending.
The first full run passed 3,377 tests and failed one outdated migration-count assertion.
The corrected inventory contains 109 migrations, and all eight focused migration checks pass.
Independent final source review found no remaining SQL or adapter defect after the corrections.
A later build caught two errors in the expanded integration test file; correction and a new build remain required.
The final test corrections now pass type checking and focused lint.
Build88492 passes all67 routes. Full rerun30521 passes313 files and3,382 tests.
The staged secret scan passes for1,064 tracked files.
All21 new integration cases collect; database execution remains unverified.
No screen changes or browser verification are included yet.
The prior pushed head is still in database CI; it cannot prove this local package.

The subsequent [CI run at cd1772e](https://github.com/rspeciale0519/mmhr/actions/runs/34308802670) passed standard checks and 844 database tests.
It failed three assertions: old active-role versions, old migration audit counts, and an old customer intake audit shape.
Twenty of the 21 customer draft cases passed, including authorization, rollback, history immutability and concurrent writes.
The save case reached its final audit assertion after its persistence, replay, revision and history assertions passed.
The corrected test requires exact `{version: 1}` summaries and retains detailed history assertions.
Fresh CI remains required. This is not a complete integration pass or a release approval.

Sources: [approved R1 plan](../../.codex/plans/module-r1-secure-platform-base.md),
[full goal supplement](../../.codex/plans/goal-full-project-completion.md),
[previous save guards](r3-intake-save.md), and [authorization matrix](r1-authorization-matrix.md).
