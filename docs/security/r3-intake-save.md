# R3 intake save correction

Status: prepared. Migration 0103 has not been applied or verified against PostgreSQL.
This package does not complete the customer intake workflow.

## Defects and correction

The old save command accepted unbounded nested application values.
Its database function allowed submitted, under-review and completed intakes to return to editable states.
It also allowed submission without an applicable requirement.

The adapter now accepts bounded flat maps and string lists.
It preserves omitted fields during patch updates and limits JSON data to 90,000 UTF8 bytes.
The database also checks field names, shapes, counts, lengths and its existing 100,000-byte storage bound.
Input revisions must permit one more PostgreSQL integer revision without overflow.

Migration 0103 keeps the existing history and audit writer in a private function.
Runtime roles cannot call that function directly.
The public wrapper obtains the existing security lock before checking identity, scope and lifecycle.

Draft and in-progress records can save in the same state.
Draft records can advance to in-progress or submitted.
In-progress records can advance to submitted but cannot return to draft.
Submitted, under-review, completed and archived records cannot change through ordinary saving.
First submission requires an active must-have or nice-to-have requirement in the same intake and organization.
New intakes cannot start as submitted records.

An exact successful retry can return the current record after a later transition.
It cannot add another history record or audit event.
The adapter accepts this later revision only for a replay.
New writes must confirm the requested record, revision and status.

## Authority and compatibility

This correction does not change RLS or the shared AAL2 security command helper.
The current database save still requires AAL2 even though workspace viewing permits AAL1.
Do not claim that basic customer sessions can save intake data.
Resolve the narrow customer-write policy before connecting that flow.

The public function name and arguments remain unchanged.
The wrapper retains the existing receipt digest and checks retries before lifecycle restrictions.
Existing data is not deleted, truncated or rewritten.
Omitted patch fields remain unchanged, including legacy values that need later review.
Incorrectly shaped new values are rejected rather than silently ignored.

## Forward and recovery

1. Run the focused unit and migration checks.
2. Execute the database lifecycle, retry, permission and history cases in the disposable local stack.
3. Review compatibility with existing stored intake data.
4. Validate the migration and adapter together in staging.
5. Connect the reviewed intake read and write API after required evidence passes.
6. Release only after the full production gates pass.

If the correction fails after deployment, revoke execution on the public save function.
Retain all customer data, intake history and audit evidence.
Restore service with a reviewed forward correction.
Do not restore unrestricted status changes as a recovery step.

## Remaining workflow requirements

- Live verification of the prepared scoped read operation in `r3-intake-read.md`.
- A reviewed customer write boundary and its required authentication level.
- Complete capture of requirements and customizations.
- Explicit reviewed correction of submitted data without rewriting approved history.
- Connected customer forms, API calls and browser verification.
- Real database, staging and production evidence.

The separate [customer draft save package](r3-customer-draft-save.md) now defines the action and assurance boundary.
Its implementation and verification remain separate from this historical correction record.

The existing one-organization relationship permits multiple intakes with distinct request keys.
This correction does not introduce an unapproved one-intake-per-organization restriction.

## Verification record

On September 8, seven adapter regressions failed before the final corrections.
The focused adapter, lifecycle contract and migration checks then passed 40 tests.
Type checking, full lint and the 67-route production build passed.
The generated migration ledger check passed without connecting to PostgreSQL.
The integration inventory covers 87 files.
Twelve intake database cases collect successfully but have not executed against PostgreSQL.

The first full unit run passed 3,023 tests and failed one source-boundary check.
That check found a direct database import in the registration integration test from the previous package.
The test now uses the existing two-connection rehearsal pool without a new database capability.
All 47 focused authorization-boundary checks pass after this correction.
The full unit rerun passed all 293 files and 3,024 tests.
