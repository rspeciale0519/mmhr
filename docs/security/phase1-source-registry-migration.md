# Phase 1 evidence source metadata

Date: September 15, 2026.
Requirement: Source owner, capture method, and review cadence for MVP-01 evidence maintenance.
Migration: `drizzle/0138_r2b_evidence_source_registry.sql`.

The evidence command previously created sources without an owner and used only the database's default cadence.
The separate source registry command already supported these fields, but the evidence form did not use them.

New evidence sources use the verified saving identity as owner.
The form records manual capture and a configurable review interval.
New capture defaults to90 days. Renewal uses the saved interval, or30 days for older records without returned metadata.
The form identifies30 days as the cost and setup policy.
Evidence expiry remains separate and still controls whether a fact can support a comparison.

Existing records, facts, evidence, approvals, and publications remain unchanged.
New sources always require review. No authorization or RLS policy changes.
Older callers can omit the new fields; new sources then use manual capture and30 days.
Staff reads include registry fields only when `registryVersion: 1` is requested.
Older reads keep their original response shape.

## Forward and recovery path

1. Validate the new migration against the disposable local database.
2. Apply migration0138 to the local database before using the updated evidence page.
3. Verify source metadata through the authenticated staff interface.

If application recovery is needed, restore the earlier application version with the migration retained.
Older read and write callers remain compatible.
Use a forward SQL correction for a database defect. Do not delete sources or change earlier evidence to conceal an error.
Cloud application requires separate approval.

## Evidence before local application

Focused contract, command, and form tests:25 passed.
Type checking passed.
Disposable integration33801 passed its combined scenario, including owner assignment, default cadence, explicit renewal cadence, invalid metadata, retry, and unchanged history.
Integration inventory:100 files, passed.
Full lint15540 passed. Production build86847 passed with71 routes.
Migration39108 applied locally. No cloud migration ran.
The native browser saved a new synthetic draft with source owner recorded, manual capture, and a90-day review interval.
The test fact uses `phase1_source_registry_check`; it is not approved or used for comparison scoring.
Earlier records still report missing owners. No historical owner was invented or backfilled.
At320px, the page measures305px client width and305px scroll width with the renewal form expanded.
Browser warning/error logs are empty. The viewport was reset; staff tab6 remains open.
Tracked secret scan45064 passed1156 files. Supplemental scan passed90 untracked files with zero findings.
Dependency audit40893 reports zero vulnerabilities.
Full unit suite38069 passed360 files and4068 tests in766.52 seconds. Source remained unchanged during the run.
