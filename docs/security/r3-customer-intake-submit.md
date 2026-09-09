# Customer intake submission

Status: backend implemented and local checks passed; database execution remains pending.
This package is not an initial evaluation, a completed customer workflow, or release approval.

## Product trace and scope

This command advances FR-INT-02 and the saved-input boundary for FR-INT-03 in [PRD](../PRD.md).
An authorized customer submits the current saved intake answers and active requirements.
The command does not accept replacement answers, an actor, a target lifecycle state or vendor data.
At least one active must-have or nice-to-have requirement must exist.
The intake must be a draft or in progress at the exact expected revision.
Submission increases its revision, records its submission time, and locks customer draft and requirement editing.

Submission is distinct from creating a masked assessment, choosing initial contenders and sending an RFP.
Those connected steps remain open. Displayed approved options must not receive the five-selection cap.
No candidate lifecycle, matching rule, commercial input or vendor identity disclosure changes here.

## Authority and transport

`intake.submit` is an organization-scoped, customer-portal action at AAL1 or AAL2.
Migration `0110_r3_customer_intake_submit.sql` adds immutable role versions for Super Admin, Organization Admin and Contributor.
It preserves their previous defaults, prior role authority records and explicit overrides.
Viewer and internal staff defaults do not gain submission authority.
New active versions are Super Admin 7, Organization Admin 5 and Contributor 5.
The registry contains 36 permissions and 72 active default grants.

The `intakes.submit` mutation accepts only organization, intake, expected revision, correlation and retry identifiers.
It uses the existing exact-origin POST and verified-identity checks.
The adapter checks both submission authority and customer portal authority for the same identity and organization.
It uses the request-scoped Supabase client, not the direct server pool.

The fixed RPC takes the security lock before current session, verified provider, identity, recovery and permission checks.
Receipt replay occurs only after those checks. A revoked caller cannot use a receipt as continuing authority.
Runtime table access remains denied. Only authenticated callers receive execute permission on the new public function.
The shared AAL2 security helper and legacy internal writer remain unchanged.

## Saved evidence and repeated requests

The command locks the parent intake before the write. Existing customer requirement writers use the same security and parent lock order.
The submission stores the saved intake answers and sorted requirement ID/revision references in immutable intake history.
Referenced requirement revisions use the existing immutable requirement history.
Missing legacy history is captured with the existing snapshot helper and the `legacy_backfill` marker.
The capture records its current time without inventing a historical actor or change time.
Legacy internal submission records can lack these new references; future readers must handle that distinction explicitly.

The full intake history snapshot must fit its existing 100,000-byte storage bound.
An oversized snapshot is rejected before writing; it is never truncated.
Submission, legacy capture, intake history, audit and retry receipt share one transaction.
Audit summaries contain only `version: 1`; saved answers stay in scoped history, not audit summaries.
An identical authorized retry returns the current intake without another write.
A new request cannot resubmit a locked intake. A reused key with different input is rejected.

## Risks, forward path and recovery

The main risks are submitting a stale intake, losing submitted requirement evidence, duplicate writes and wrong-organization access.
Exact revision checks, current authorization, immutable snapshots and same-transaction receipts address those risks.
The API submits the saved state at its lock boundary; it does not claim that a stale browser has reviewed every latest child revision.
The future confirmation screen must make that saved-state behavior clear.

Generate migration metadata with the installed Drizzle generator, then review the custom SQL.
Rehearse all migrations and run the new integration tests before staging or production application.
Deploy the database function before code that exposes submission controls.
Recovery can revoke execution on the new RPC and remove its route or UI wiring through a reviewed forward change.
Keep submitted records, role versions, history, audit and receipts. Do not roll customer state backward by deleting evidence.

## Verification

- Command tests pass 32 cases; router tests pass 23 cases.
- Registry, command, router, migration and inventory focused checks pass 131 cases.
- Type checking, full lint and build74595 pass; the build generates 67 routes.
- The integration inventory contains 93 files.
- The new database suite collects 22 cases. Collection is not database execution.
- Independent SQL review found no high-risk omission. Final fixture review confirmed the corrected archive, legacy and overflow preconditions.
- Review also replaced a valid unknown UUID with malformed input in the syntax-rejection case and added revision boundary inputs.
- Full unit5732 passes 322 files and 3,603 tests in 400.41 seconds.
- Final fixture type checking and focused lint pass. Legacy, archive and overflow fixtures now establish their intended preconditions.
- No rendered screen changes in this backend package; authenticated submission UI remains open.

Earlier backend CI34312014214 at `04cf396` passed 92 files and 871 integration tests.
CI34315077521 now tests the pushed requirement form at `ab1ec96`.
Neither run includes this submission package. Local Docker access and new-head database evidence remain open.
The sandbox denied Docker access. Outside-sandbox version probes at both existing endpoints returned no result.
Only the diagnostic clients were stopped. No Docker service or data was changed.
