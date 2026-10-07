# Demo coordination implementation and verification

Updated September 30, 2026. Full feature implementation remains active.

Customers and vendors can supply available times. MMHR staff can plan, confirm, reopen, cancel, and record demo outcomes.
The application preserves each saved revision. This work does not complete all demo requirements or establish release readiness.

## Product behavior

The [PRD](../PRD.md#57-demos-proposals-and-contract-handoff) defines FR-DMO-01 through FR-DMO-03.

| Area | Implemented behavior | Remaining work |
|---|---|---|
| Plan | Round, audience, purpose, participants, format, and required topics | Verify later reporting and staff work queues |
| Source | Staff choose an exact disclosed product and issued RFP | Verify all later deal transitions |
| Availability | Each external role supplies only its organization's times | Participant acceptance remains separate |
| Confirmation | Only MMHR staff confirm a time accepted by both parties | Connect approved calendar and communication adapters |
| Time controls | Named zones, daylight saving checks, duration limits, overlap checks, and reminder times | Automatic reminder delivery and delivery history |
| Changes | Reopening removes the active confirmation and preserves earlier schedules | Add communication notices through the internal adapter |
| Outcomes | Planned attendance, feedback, score, commitments, changes, and next action | Document selection, safe uploads, and authorized evidence access |
| History | All three roles can page through their own saved revisions | Verify full reporting integration |

The forms display times in their recorded zones.
They reject missing or repeated daylight saving times instead of silently changing the entered time.
Availability does not confirm a meeting. The staff confirmation must fit one accepted window from each party.
The database prevents overlapping confirmed meetings for the same customer or vendor.

Staff record an outcome after the confirmed meeting ends.
The database checks the real current time and the planned attendee names.
No browser test establishes that an actual meeting occurred.

## Access and integrity

The application uses request-scoped Supabase clients.
Identity comes from verified claims and the database request context.
Client input cannot supply an actor identity.

Staff operations require `rfp.approve`, `admin.access`, and AAL2.
Customer operations require `portal.customer.access` in the customer organization.
Vendor operations require `portal.vendor.access` in the issued vendor organization.
The database rechecks membership, portal access, active organizations, and current source access.

Creation binds the candidate, disclosed product, vendor profile, intake, RFP version, and recipient.
The command creates or reuses the associated deal.
Users do not enter internal product or deal identifiers in the form.
Eligible choices and demo records have separate cursors. History uses a revision cursor.

Each write checks the expected revision and a stable idempotency key.
An uncertain browser result locks the submitted fields.
A retry sends the same request. A reload requires users to inspect the saved state before another action.

`demo_coordination_events` preserves each complete state snapshot.
Mutation and truncation guards protect that history.
Raw table access remains denied. The history API omits actor identity and audit identifiers.
The earlier `mmhr_record_demo_round` interface remains available for legacy records.
It cannot change a coordinated demo.

## Migration and recovery

[Migration 0144](../../drizzle/0144_happy_lethal_legion.sql) adds nullable coordination fields to the existing demo aggregate.
It adds scoped recipient references, immutable event records, validation, RLS, and fixed request-scoped functions.
It preserves existing demo records and the legacy command interface.
Drizzle generated the schema metadata. No cloud migration was applied.

Forward path: review the migration and apply it to a separately approved target.
Verify source binding, role access, legacy compatibility, and history before enabling the new routes there.

Recovery path: restrict the new functions and routes, then apply a corrective forward migration.
Retain all recorded events and existing columns.
Do not delete history or restore the legacy command's access to coordinated records.
Permission changes and cloud actions need separate approval.

## Verification results

| Check | Result |
|---|---|
| Full unit run | 385 files and 4,270 tests passed before the final display corrections |
| Focused demo checks | Eight files and 55 tests passed after those corrections |
| Genuine Auth database suite | 27 portal, clarification, and demo tests passed |
| Empty database | All 145 migrations applied; 11 integration checks passed |
| Legacy demo command | One integration test passed |
| Type check | Passed |
| Lint | Passed |
| Production build | Passed with all three demo routes |
| Browser scheduling | Staff plan, customer availability, vendor availability, confirmation, reopening, and cancellation passed |
| Browser access | Vendor access to the staff route was denied |
| Browser layout | Customer page and staff form passed at 390 pixels without horizontal overflow |
| Browser validation | Invalid zones and times outside both accepted windows were rejected |
| Browser history | Earlier confirmation remained visible after reopening |
| Browser outcome | Staff saved a completed outcome; customer and vendor read the outcome and all three revisions |
| Outcome layout and console | Form passed at 390 pixels; no overflowing fields or captured warning/error messages |
| Local Supabase security advisors | No warnings or errors found in the owned disposable database |
| Network capture | Full browser network traces remain unavailable; server request results were inspected |
| Screenshot export | Browser screenshots were inspected; no standalone screenshot file was exported |

The database suite checks stale revisions, mismatched associations, premature outcomes, forged attendance, unsafe evidence, and immutable history.
It checks history pagination across 27 revisions and access after membership revocation.
The earlier five isolated security suites passed 60 tests against 144 migrations.
That result does not establish a full 101-file integration pass against this latest tree.

The outcome rehearsal used an explicitly seeded earlier synthetic meeting in an owned disposable database.
The first fixture failed because its SQL parameter encoded JSON as a string.
The corrected fixture used the installed PostgreSQL driver's JSON parameter helper.
Public commands retained their real-clock checks and unchanged association guards.
The staff save returned HTTP 200 and persisted completed revision three.
Customer and vendor routes returned HTTP 200 and displayed the same outcome and history without mutation controls.
Both browser rehearsals stopped their owned services and removed their disposable databases.
Saved normal MMHR volumes remain intact.

## Open release controls

Reminder times are recorded. The application does not yet send demo reminders.
Outcome evidence references remain subject to clean, approved document checks.
The current form has no document picker.
Email ingestion, document processing, proposals, contracts, finance, onboarding, and other documented features remain unfinished.

The dependency audit remains unresolved.
The installed Next.js version has a critical advisory; its update requires dependency approval under repository instructions.
Hosted tests, live providers, approved real data, participant acceptance, and operational checks remain unverified.
No deployment, cloud migration, catalog approval, Git write, or new production dependency occurred during this work.

See [the complete pilot plan](../../.codex/plans/build-complete-pilot-workflow.md) for the continuing work and approval points.
