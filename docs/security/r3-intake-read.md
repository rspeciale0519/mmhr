# R3 intake read boundary

Status: prepared. Migration 0104 is unapplied and has no PostgreSQL execution evidence.
This package adds backend reads, not a complete intake screen or editing workflow.

## Behavior and authority

`intakes.list` returns a bounded page of intake summaries for one authorized organization.
The default page contains 25 records. The maximum page contains 50 records.
The SQL function returns one additional row to determine the next cursor.
UUID order controls pagination. The adapter rejects duplicate, unordered and cross-organization results.

`intakes.get` loads one intake from the requested organization.
The response includes status, revision, timestamps and the seven existing intake data fields.
It excludes actor identifiers, internal metadata, history and unrelated records.
Missing records and denied organization access produce the same public denial.

Both queries check live `workspace.access` through the existing permission boundary.
The adapter checks permission again. The SQL functions also check permission.
Existing AAL1 and AAL2 read access remains unchanged.
These reads do not grant edit access, change membership or weaken RLS.
Only `authenticated` can execute the functions. Runtime roles retain no raw intake table access.

## Stored data compatibility

Reads preserve stored text, including whitespace.
The read schema validates PostgreSQL's trimmed key and label bounds without changing those values.
SQL removes absent top-level fields only. Nested nulls or unsupported legacy structures cause rejection.
No invalid field is silently removed.

New writes have a stricter 90,000-byte JSON transport bound.
Reads do not apply that bound to existing records allowed by the 100,000-byte JSONB storage check.
The read schema retains bounded collections and field lengths.
Existing records that cannot satisfy the data contract require a reviewed correction.
This package does not rewrite them.

## Forward and recovery

1. Run focused adapter, router and migration tests.
2. Rehearse migration 0104 and all intake read database cases in the disposable local stack.
3. Verify organization isolation, revoked access, legacy records and denied runtime roles.
4. Validate the migration and application together in staging.
5. Connect the customer screen after the required database evidence passes.

If a defect appears after deployment, revoke execution on both new public read functions.
Retain all intake, history and audit records.
Use a reviewed forward correction to restore service.
No data rollback or deletion is required because this migration changes no stored records.

## Evidence and remaining work

Adapter and router tests use mocked transport. Migration checks inspect SQL text.
These checks cannot prove live authorization or SQL behavior.
Eleven database cases collect, but Docker's recorded startup failure prevents execution.
The integration inventory covers 88 files and the migration ledger contains 105 entries.
Final focused tests passed 58 cases. Type checking and lint passed.
The production build passed with 67 routes before the final Unicode-only validation change.
That final change passed focused tests, type checking and lint.
Full unit run 16640 passed 296 files and 3,081 tests.
The last Unicode regression also passes in the separate 58-test focused run.

Customer forms, requirements, customizations, customer-write policy and end-to-end verification remain open.
No migration, commit, push, merge or production deployment occurred for this package.
