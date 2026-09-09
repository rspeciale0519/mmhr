# Candidate customer and provider scope

Status: implemented and independently reviewed. Local standard checks pass. Database execution is pending.
This package does not deliver the masked option list or customer selection screen.

## Requirement and root cause

This change supports FR-INT-03, FR-INT-04 and FR-MAT-01 through FR-MAT-04 in [PRD](../PRD.md).
Customer intakes must refer to products owned by separate provider organizations.
Migration 0012 gives products their provider organization's scope.
Migration 0013 instead required a candidate's product to belong to the customer's intake organization.
Matching in migration 0040 also searched provider facts with the customer organization ID.
Those constraints cannot support the approved customer journey with separate customer and provider records.

## Migration and compatibility

Migration `0111_r3_candidate_vendor_scope.sql` adds private `evaluation_candidates.vendor_organization_id`.
The candidate's existing `organization_id` remains its customer authorization scope.
The new column identifies only the product owner's scope; it does not grant access to that organization.

The migration first adds a nullable column and fills it from each referenced product.
The existing product foreign key remains active during that step.
It then validates the new required field and provider/product foreign key before removing the old product key.
The intake/customer foreign key, unique candidate IDs and intake/product uniqueness remain unchanged.
All original candidate columns, revisions and timestamps stay unchanged.
Masks, scorecards, history, audit events and request receipts are retained.
No table, policy, evidence row or runtime permission is removed.

The legacy `mmhr_add_evaluation_candidate` RPC keeps its existing input, output, authority and receipt namespace.
It still accepts only a same-organization product and records that organization in the new column.
It does not accept caller-supplied provider scope.
The existing up-to-five initial candidate limit and later reviewed-addition behavior stay unchanged.
Its raw product ID contract remains unsuitable for the future customer selection path.

The matching function changes only five provider-fact scope expressions across four query groups.
Requirement reads, approved rule selection, locking, stored runs, audits and authorization stay customer-scoped.
Published fact lookup follows the stored provider scope.
The score formula, explanation format, commercial independence and masked output fields stay unchanged.
This fixes scope; it does not prove all matching or approved-publication requirements complete.

## Tests and evidence

- Migration, legacy candidate and ordering checks: 4 files and 17 tests pass.
- Matching, candidate actions, comparison and new migration checks: 6 files and 17 tests pass.
- Eleven existing direct-insert fixture files now provide their original same-org value in the new private column.
- New runtime regressions use separate customer and provider organizations.
- A separate populated rehearsal copies the migration prefix through 0110, creates real command evidence, then applies 0111.
- The rehearsal checks candidate values, masks, scorecards, entry history, audit events and receipts before and after migration.
- It also checks old request replay and new calls through the unchanged legacy RPC contract.
- Integration inventory passes with 95 files. Application tables remain unchanged; the migration count is 112.
- Type checking and full lint pass. Build 46959 passes with 67 routes after correcting a transaction type in the rehearsal helper.
- Final fixture and source-boundary lint and type check 91673 pass.
- Source-boundary tests pass all 51 cases. The migrator exception permits only the exact rehearsal file and module.
- Regression checks still deny database drivers, application pools, credentials, neighboring files and production imports.
- Independent review found no material defect in the migration or the restricted test helper.
- Both new integration files collect all four cases. Collection does not prove database execution.
- Full unit run 80138 passed 3,645 tests and failed the missing test-helper classification check.
- That exact classification is corrected and independently reviewed. Fresh full unit run 87722 passes 325 files and 3,650 tests in 413.24 seconds.
- No new database execution is claimed.

The previous pushed source at `4abfe42` has standard CI checks passed and integration CI34318285955 running.
That run includes migration 0110, not this package's migration 0111.
Local Docker version probes previously returned no usable engine result. No engine reset or data deletion occurred.
No browser check is required for this package because it changes no rendered surface.

## Risk, deployment and recovery

The main risks are damaged historical links, using provider scope as authority, and exposing provider identities through old commands.
The migration must run as one reviewed transaction, after backup and staging rehearsal.
Old application RPC calls retain their shape and same-org behavior with the new server functions.
Do not restore the old product foreign key after separate-provider candidates exist; that would reject valid retained records.
Recover through reviewed forward corrections. If needed, revoke the affected command and disable its screen wiring while preserving evidence.
Do not delete candidates, provider data, snapshots or history to make a rollback pass.

## Remaining connected work

Create an approved, immutable option publication with a masked, paginated customer read.
Display all approved options; the five limit applies only to initial selections.
Use a new customer selection command that resolves private product and provider IDs from an opaque publication option.
Do not expose the legacy add contract directly in the customer portal.
Review and tighten the old workspace-only unmask and RFP amendment authority before connecting disclosure.
Repair the separate RFP recipient scope constraint and the deal command's product lookup.
The deal product foreign key already uses provider scope and must remain unchanged.
These remaining requirements prevent any claim that the full R3 workflow or production release is complete.

## First 0111 database execution

CI run 34322766689 at `663b4e6` applied migrations through 0111.
Standard checks passed. Integration passed 94 files and 895 tests, but two cases failed in the vendor-scope fixture.
The failure came from `r1_assert_administration_capacity`, not a scope or matching permission bypass.
The fixture created an active vendor organization without the required verified organization administrator.

The fixture now creates that administrator membership. The approved-input fixture has the same correction and a capacity assertion.
The runtime security check remains unchanged. A new CI run must verify these corrections.
The publication workflow remains a separate package under local review.
