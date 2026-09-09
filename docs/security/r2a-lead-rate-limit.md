# R2A lead-write limit

Status: prepared, not applied or verified against PostgreSQL.

## Behavior

Migration `drizzle/0102_r2a_lead_rate_limit.sql` limits total accepted lead writes to 100 per UTC 15-minute window.
The limit applies across application instances and direct calls to `mmhr_create_lead`.
This initial ceiling is an implementation choice. Validate it against expected traffic before release.

Only a new accepted lead consumes capacity. Invalid input, conflicting retries and successful replays do not consume capacity.
The existing lead function validates input and records the lead with its audit event.
If capacity is exhausted, a database subtransaction removes both provisional writes before returning `rate_limited`.
The counter stops at 100. The database row lock serializes concurrent updates.

The table stores a fixed key, a window timestamp, a count and an update timestamp.
It contains no IP address, cookie, email address or client digest.
RLS and revoked table privileges deny raw runtime access. Only the private helper can update counters through the fixed public command.

The API returns HTTP 429 with `Retry-After: 900` and a redacted response.
Registration stops before the Auth provider call unless lead capture returns `created` or `replayed`.
The lead adapter explicitly maps SQL column names into the application result.

## Limits and risks

This aggregate ceiling does not establish per-client network protection.
An attacker could consume the shared allowance and temporarily block legitimate new leads.
Requests rejected before the database call do not consume this allowance.
Adjacent fixed windows can each accept 100 writes near their shared boundary.

Before public release, configure and verify per-client controls at the trusted hosting edge.
Cover both `/api/leads` and registration Server Actions.
Verify direct public Supabase RPC traffic separately; website controls alone do not protect that entry point.
Do not trust caller-supplied forwarded headers or resettable cookies as an abuse boundary.
Do not enable public release while these checks remain open.

Window records remain stored. The fixed key permits at most 96 small rows per day.
There is no public cleanup function or per-request deletion.

## Forward and recovery paths

1. Execute the isolated migration tests against local PostgreSQL.
2. Verify limits, retries, concurrency, RLS denial and atomic audit behavior.
3. Deploy the response adapter and registration rejection handling to staging.
4. Apply the reviewed migration to staging.
5. Verify the full customer journey and edge controls.
6. Apply production changes only after release gates pass.

If an operational defect appears, contain capture with the existing public-release gate.
Retain all lead records, audit events and counters.
Use a reviewed forward correction after diagnosis.
Do not restore unrestricted lead capture or delete customer records as a recovery step.

## Evidence boundary

The focused command, route, registration and static migration tests passed 51 cases on September 8.
These tests reproduce and cover SQL-result mapping and registration rejection defects.
Type checking, lint and the 67-route production build passed after the repair.
The full unit suite passed 292 files and 2,997 tests.
The migration ledger check passed. It does not execute the SQL.
The integration inventory includes 87 files. The seven new lead tests failed
during Docker startup; no database assertion executed.
Live PostgreSQL, direct API, browser and edge evidence remain required.
