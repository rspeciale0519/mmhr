# Managed finance source and review work — October 3, 2026

The local candidate now contains managed finance contracts, commands, a typed router, and a reviewed SQL migration draft.
Database execution and rendered acceptance remain unverified.
This work does not establish finance completion or launch readiness.

## Scope

The [approved finance plan](../../.codex/plans/build-finance-eligibility-approval-and-closure.md) controls the sequence.
The [PRD](../PRD.md) remains product authority.
The [architecture document](../TECH_STACK.md) remains architecture authority.

Migration [0162](../../drizzle/0162_r7_managed_finance_sources.sql) adds seven tables.
They hold agreement versions, effective intervals, independently reviewed contract facts, signing-time eligibility, calculations, and immutable history.
The canonical event records its source mode and event revision.
Legacy rows retain their required money fields.
Managed pending rows can retain unknown amounts.
Known zero remains a distinct valid value.

The migration denies downstream managed invoices, payments, disputes, adjustments, handoffs, and reports until their later workflows exist.
Approved managed recalculation also remains denied.
Legacy financial writes without actual source evidence remain a separate open restriction.

## Application boundary

[Input and result contracts](../../src/lib/managed-finance-workflow.ts) define ten commands.
They do not accept caller approval identities, signing dates, resolved agreements, or commission results.
Currency values use the existing supported inventory.
Reasons use the existing safe 500-character contract.
Timestamp validation retains six fractional digits.
Decision chronology uses exact microsecond comparison.

[Read contracts](../../src/lib/managed-finance-reads.ts) bind organizations, targets, original metadata, versions, decisions, and cursors.
[Original choices](../../src/lib/managed-finance-originals.ts) require exact approved source associations.
Reads retain historical original organization identifiers.
Independent approval and rejection have separate availability flags.
Stale source rejection cannot imply approval or publish current facts.

[Server commands](../../src/server/commands/managed-finance.ts) require current workspace, finance, and platform staff authority with AAL2.
[The router](../../src/server/trpc/routers/managed-finance.ts) also checks the explicit selected workspace.
Mutations inherit the exact-origin POST control.
Unknown replies retain their command keys through callers.
Known database errors have fixed response classes.
Unexpected provider details do not reach the client.

The router exposes `managedFinance.list`, `detail`, `originals`, and `execute`.
The staff screen is connected at `/admin/finance/commercial` through the administration page.
Its server page checks the selected organization, current AAL2 staff authority, and actual organization membership.
Internal workspaces show agreements; customer workspaces show contract facts and calculations.
Generic loading and error screens expose no private record.
Forms use stored sources, counters, predecessors, and original versions.
They preserve unknown totals, exact money, currencies, and six fractional timestamp digits.
Unknown replies retain the exact request for explicit retry.
Cross-workspace originals must use the normal explicit workspace selection before download.
These reads issue no Storage grant.

## SQL review and assembly

The installed Drizzle tool generated the schema metadata and migration.
The generated SQL placed composite foreign keys before their supporting indexes.
Assembly moved all 25 generated indexes before those foreign keys.
The reviewed source, binding, calculation, history, input, mutation, and read chunks accompany the nullable expansion.
Seven tables have forced RLS, explicit restrictive deny policies, and revoked raw role access.
Only authenticated callers receive the four public RPC execution grants.
Private functions retain revoked execution grants.

Root review added exact action-specific audit summaries, canonical creation key and time bindings, and applicability approval time binding.
It also bound the managed structure actor, revision, and creation time.
All 45 functions use an empty search path and UTC timestamp serialization.

An initial JavaScript assembly inserted one dollar character instead of two into 31 function openings.
Independent review found this error before database execution.
The corrected assembly uses replacement callbacks.
The malformed assembly and its hashes remain in session scratch.
An initial check also used an incorrect function count; inspection confirmed 45 functions and 46 dollar-quoted bodies.
The corrected lexical check passed.
Lexical checks do not establish PostgreSQL syntax or transaction behavior.

Current reviewed lexical SHA256: `bea67194158a33ac3bf51814cfdb24f69810be978bc0a6fbd338878feac2af55`.
This hash records the current draft before remaining adversarial findings or database corrections.

## Validation

| Check | Result | Limit |
| --- | --- | --- |
| Six initial contract, command, router, and inventory files | 102 passed; one failed | The durable authorization matrix lacked five new rows |
| Matrix synchronization and eight focused files | 106 passed; 34.41 seconds | Before exact chronology regression |
| Exact chronology regression and eight focused files | 107 passed; 27.03 seconds | Explicit provider and authorization doubles |
| Full type check after schema and router integration | Passed, exit zero | Before the later chronology helper change |
| Full type check after exact chronology correction | Passed, exit zero | Current contracts and schemas |
| Seventeen changed source and test files, focused lint | Passed, exit zero | No SQL execution |
| Three chronology source and regression files, focused lint | Passed, exit zero | No SQL execution |
| Combined SQL text checks | Passed: 45 functions, 46 bodies | Quotes, parentheses, search paths, and timezone only |
| Frozen commercial screen handoff | 23 field and 74 component/page checks passed | Provider and page authorization doubles |
| Integrated commercial screen and authorization inventory | 111 passed across six files; 52.77 seconds | Browser rendering and genuine database access remain open |
| Full type check after screen integration | Passed, exit zero | No genuine SQL execution |
| Commercial screens, navigation, and inventory focused lint | Passed, exit zero | No browser execution |

The screen integration snapshot had 364 entries and 163 migrations.
Later task request evidence raises the current migration inventory to 164.
The managed signed Auth suite raises the integration inventory to 121 registered files.
The [signed task proof](r8-signed-auth-evidence-2026-10-03.md) applies to its frozen 162-migration snapshot.
It does not verify migration 0162.

The separate [finance document proof](r7-finance-source-documents-2026-10-03.md) remains failed.
Its frozen 162-migration runs do not include this managed finance draft.
The complete document run passed ten checks and failed 34.
A later focused diagnostic passed the corrected 500-character review boundary and failed the pagination reservation probe.
The genuine reservation exceeded its unchanged eight-second statement limit.
Inner phase diagnostics remain active.
No saved, hosted, or production database received migration 0162.

### Genuine Auth suite integration

Five reviewed signed Auth files are now registered with the guarded local worker.
The suite contains 29 cases with actual disposable Auth sessions, scoped permissions, private Storage, and independent review actors.
It uses an explicit scanner double; it cannot establish actual malware detection.
Each scanner session starts immediately before its job and closes after completion.
The actual eight-minute worker expiry remains unchanged.

The frozen handoff SHA256 is `4a67c31d8cd38bbdea7e7e502e463efd288e7308182a48c9b6e0a630f8f82c52`.
Full type checking and focused five-file plus worker lint passed after copying.
Three guarded inventory and rehearsal files passed 22 checks in 17.29 seconds.
These checks establish registration and static compatibility only.
The first genuine managed journey and function properties remain queued behind the capacity diagnostic.
Its controlled snapshot ends at migration 0162 and excludes later task-history work.
The database schema registry now includes all seven managed finance tables.

### First bounded database checks

The first controlled 163-migration run passed one case, failed one, and filtered 27 cases in 97.16 seconds.
RLS, raw table denial, and exact function grants passed.
The positive journey failed at its first Storage upload.
Its fixture passed reservation fields to the strict document upload request.
The correction selects only the six upload fields; it changes no application authority.
Focused fixture lint and full type checking passed after that correction.

The first frozen run retained 1,486 candidate source hashes and 39 dependency metadata hashes unchanged.
Its original journal and excluded task inputs also matched.
Owned cleanup left no owned containers, volumes, or networks.
The existing owned `supabase_admin` socket passed quoted transaction-local tracking and authenticated-role smoke checks.
Rollback restored its role and tracking settings without permission changes.

The corrected bounded run passed one case, failed one, and filtered 27 cases in 90.84 seconds.
Reserve, Storage upload, scan, document review, access, download, and agreement preparation reached their assertions.
The first agreement approval then failed with a generic application error.
Its exact database cause remains unknown until the signed diagnostic completes.
The scanner remains an explicit double; these checks do not prove malware detection.
No complete managed workflow or 29-case acceptance is established.

### Approval correction and bounded success

The signed diagnostic identified SQLSTATE `42702`: `column reference "correlation_id" is ambiguous`.
SDK, direct RPC, and authenticated SQL reproduced the same failure with unchanged limits.
The 93.26-second diagnostic retained exact rollback snapshots and source hashes.
Migration 0162 now uses a private correlation alias at the four affected history and decision references.
Its public signatures, grants, request fields, and audit keys remain unchanged.
The current migration SHA256 is `c22c03d86300521281ffd9dd2296ba8759f2f0fb2c7115b0330b82bba8f6e106`.

The corrected controlled run passed both selected cases, with 27 filtered, in 113.92 seconds.
It covered independently approved flat commission with unknown contract money and immutable original retries.
The separate RLS, raw denial, and function-property case also passed.
All 1,492 candidate source hashes and 39 dependency metadata hashes remained unchanged.
The original 165-entry journal and four excluded task/invoice inputs remained unchanged.
The candidate used a reviewed 163-migration prefix through 0162.
Owned cleanup left no owned containers, volumes, or networks.
The complete 29-case suite and actual invoice migration remain unverified.

### Measured permission cost

The separate historical 162-migration profile passed one diagnostic, with 45 filtered, in 127.05 seconds.
Its primary SDK reservation committed one disposable original under the unchanged eight-second SQL limit.
The separate profiled authenticated SQL reservation rolled back exactly.
Administration capacity used 5,726.932 milliseconds of the 5,902.503-millisecond profiled request.
The permission registry ran 11,311 times and used 3,301.255 milliseconds of self time.
Scope checks added 737.405 milliseconds of self time.
All 76 measured function properties, roles, grants, planner settings, and request limits remained unchanged.
All 1,446 source hashes and 39 dependency metadata hashes matched after owned cleanup.
Missing function statistics remain unknown because of inlining and flush limits.
Earlier timeout failures remain valid; this bounded success does not prove reliable full-suite performance.

## Risks and recovery

Main risks are false source eligibility, private original exposure, forged history, stale approval, and nullable money reaching financial operations.
Current guards must pass genuine signed Auth, Storage, concurrent-key, owner-write, rollback, historical compatibility, and property tests.
The full candidate gates remain failed or incomplete under [their record](current-candidate-gates-2026-10-03.md).

Keep the new workflow unavailable until its disposable verification passes.
If a defect appears, disable its entry points and use a reviewed forward correction.
Preserve original documents, source versions, receipts, decisions, and history.
Do not restore caller-defined finance approval as a recovery action.
