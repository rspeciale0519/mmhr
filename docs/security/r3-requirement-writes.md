# R3 requirement creation and history

Status: prepared. Migration 0105 is not applied or verified against PostgreSQL.
This package does not complete the customer intake workflow.
The canonical migration file is `drizzle/0105_0105_r3_requirement_commands.sql`.
Its generated ledger name contains the repeated prefix. Both refer to the same migration.

## Behavior

The creation adapter accepts structured and custom requirements for an existing intake.
It accepts importance, weight, ownership, response data, evidence references and vendor response links.
The caller supplies a stable requirement identifier and a retry key.
Creation requires revision zero. New records start at revision one.
Updates must supply the current revision and return the next revision.
Exact retries can return a later revision without making another change.

Response data has bounded depth, field counts, list counts, string lengths and serialized size.
The application copies validated response data before asynchronous authorization.
This prevents later caller changes from bypassing validation.
The SQL functions independently validate their inputs.
The application limits serialized response JSON to 8,000 UTF8 bytes.
The database separately limits its JSONB storage representation to 10,000 bytes.
These are different transport and storage bounds, not equal byte measurements.
Future reads must not reject valid stored records merely because the application write budget is smaller.

New writes require a draft or in-progress parent intake.
Submitted and later intake states reject new requirement changes.
The functions lock the parent before changing requirements.
Exact successful retries remain available after a later parent transition.
The SQL update function checks authorized, exact legacy receipts before applying new-write validation.
It can replay an older successful payload without accepting that payload for a new write.
Replay still requires the original payload, current permission and matching actor, organization, intake and requirement.
Current application adapters retain their strict new input contract.
Duplicate identifiers and stable keys fail without adding history.

## Authority and history

The existing `workspace.access` permission and shared AAL2 command boundary remain in force.
No customer AAL1 write permission is added.
Both functions verify the actor and organization scope.
Assigned owners must have active, reviewed organization membership and an active identity.
Raw runtime roles cannot read or write the new history table.

Each inserted or updated requirement produces an immutable snapshot.
Snapshots retain the data needed to explain revisions.
Audit events and command receipts remain in the same transaction as the data and history.
An audit failure must roll back all related writes.

Older requirements receive a marked snapshot of their previous state when they next change.
The history record uses the actual capture time.
It does not invent a historical actor or change time.
Earlier states that were never recorded remain unavailable.

## Forward and recovery

1. Run focused adapter, history and migration checks.
2. Rehearse the migration and database cases in the disposable local stack.
3. Verify old update requests, exact retries, organization isolation and audit rollback.
4. Verify migration compatibility and preserved records in staging.
5. Connect customer mutations only after the authentication policy and database evidence pass.

If a defect appears, revoke both public requirement write functions.
Retain the requirement records, snapshots, audit events and receipts.
Use a reviewed forward correction to restore service.
Do not restore unrestricted submitted-state edits or delete history.

## Remaining work

Docker's recorded startup failure prevents live database testing.
Prepared tests and static checks do not prove SQL execution or live authorization.
Requirement reads, customer-write authentication, connected forms and browser verification remain open.
Custom requirement records do not establish complete software-customization capture or review.
No migration, Git promotion or production deployment occurred for this package.

## Verification record

The final focused adapter and static migration batch passed 50 tests.
The separate adapter and authorization-boundary batch passed 96 tests.
Type checking, full lint and the production build passed. The build generated 67 routes.
The final SQL guard corrections passed the four static migration checks.
Sixteen database cases collect without running PostgreSQL.
The integration inventory covers 89 files. The migration ledger contains 106 entries.
Drizzle ledger validation passed with a loopback-only placeholder connection string.
Full unit run 43611 passed 298 files and 3,129 tests.
The later SQL-only legacy replay correction passed focused checks and a separate independent review.
Its new database fixture passed type checking and lint but has no PostgreSQL execution evidence.
