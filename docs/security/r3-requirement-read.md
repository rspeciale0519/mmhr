# R3 active requirement reads

Updated: 2026-09-08. Status: prepared, not database-verified or released.

## Scope

This package adds `mmhr_get_intake_requirements_page` in migration 0106.
The request-scoped adapter exposes the read through `intakes.requirements`.
It supports saved requirement review under FR-INT-02 and FR-EVL-04.
Customer screen wiring is now prepared; see [customer requirement view](r3-customer-requirement-view.md).
Live screen verification, archived review, ownership display, evidence access and vendor links remain unfinished.

The RPC returns active requirements for one authorized organization and intake.
It returns requirement identity, scope, stable key, label, importance, weight,
saved response, status, type, revision and timestamps.
It excludes ownership, actor and correlation identifiers, evidence references and vendor response links.
Those fields need separate authorized views; this read must not bypass provider masking or document access controls.

The stable key and weight describe the customer's shared requirement, not vendor
commercial data or internal scoring-rule approval records. FR-EVL-03 permits weighted
criteria and FR-EVL-04 permits requirement importance. The organization ID repeats
the authorized input scope for validation; it does not grant access or list other organizations.

No table, record, write permission, approval rule or audit event changes.
The migration uses an empty search path and live `workspace.access` authorization.
It grants execution only to `authenticated`, not anonymous callers, service roles or workers.
Raw table grants and RLS remain unchanged.

## Read contract

- Organization and intake IDs are required. The parent must exist within that organization.
- Page size defaults to 25 and accepts 1 through 50.
- UUID ordering and one look-ahead row support cursor pagination.
- The adapter rejects duplicate IDs, duplicate stable keys, reordered rows, wrong scope and extra response fields.
- Legacy SQL null and JSON null answers remain null. False, zero and saved whitespace remain unchanged.
- PostgreSQL character counts govern stored Unicode labels, keys and answer strings.
- The read validator does not reuse the 8,000-byte application new-write limit.
- SQL retains its 10,000-byte JSONB validation and adds a 100,000-byte text transport ceiling.
- The adapter allows a separate 100,000-byte JSON transport ceiling to accommodate encoding differences.
- Unsupported or oversized legacy data fails with a generic error. No fields are silently dropped or rewritten.
- Existing active requirements on later intake states remain readable. Reads cannot reopen or modify those intakes.

An empty page means the authorized intake has no matching active records after the cursor.
A missing or unauthorized intake is denied, not reported as empty.
The tRPC procedure repeats the live permission check through its adapter.

## Forward and recovery paths

The main risk is cross-organization disclosure, including premature provider-name disclosure through links.
Rehearse migration 0106 and its denied-role cases in disposable PostgreSQL before deployment.
Verify the exact customer projection, revoked access, legacy data and unchanged audit/history counts.
Then test the connected customer screen in the target non-production environment.

If containment is required, revoke execution on
`public.mmhr_get_intake_requirements_page(uuid,uuid,uuid,integer)`.
Remove affected screen wiring through a forward code change.
Keep all records and immutable history. Do not relax RLS or grant direct table access.

## Evidence

- Focused adapter, static migration, router and inventory run 10807 passed 77 tests.
- Type checking and full lint passed in run 10807.
- Final focused run 98053 passed 77 tests, type checking and focused lint after the error-message correction.
- Full unit run 33155 passed 302 files and 3,217 tests.
- Build 63432 passed with 67 routes before the final generic error-message correction.
- Final build 59165 passed 67 routes after the correction. Type checking and full lint 84986 also passed.
- Drizzle generated `0106_r3_requirement_read.sql` and metadata; the ledger check passed without a database connection.
- The application inventory now contains 107 migrations and 90 integration test files.
- Eight database cases initially collected without hooks. Collection does not prove SQL execution.
- Parent review corrected a 9,000-character fixture that exceeded the per-string bound.
- The valid size case now uses five 1,800-character answers in a separate intake from the intentionally invalid row.
- History assertions now count requirement history rather than intake history.
- The explicit SQL-null fixture is distinct from JSON null.

Docker remains unavailable locally. No migration was applied to staging or production.
CI run 34301817813 passed disposable Supabase startup and Drizzle migration application at commit 0011ad8.
Its complete integration suite remains running. Migration application alone does not prove read isolation or failure behavior.
The preserved checkpoint remains at `a1b2ee3112f1d766f0ce82d24607d6571c8c5ee6`.
The separate `codex/full-delivery-verification` branch retains its 103 commits beyond the freshly fetched `develop` reference.
Commit `a80b643` records the reviewed workflow package above the checkpoint.
This branch is for verification, not production release. All release gates remain in force.
