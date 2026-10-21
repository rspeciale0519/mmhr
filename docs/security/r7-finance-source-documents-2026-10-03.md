# Finance source document verification

Date: October 3, 2026. Verification remains active.

Finance originals have separate source bindings, staff metadata commands, review, and private byte access code.
This change does not complete agreement terms, confirmed contract facts, calculation approval, or financial closure.

## Required result

Internal finance staff can reserve an agreement original for an actual vendor.
They can reserve contract evidence only against an actual stored signed customer handoff.
Source joins bind the customer case, vendor, contract, handoff, and deal.
The server requires current AAL2 identity, workspace access, finance permission, and administration access.

A separate authorized reviewer must inspect the exact original before approval.
The approval binds its version, hash, review capability, receipt, and audit evidence.
Finance originals cannot enter ordinary portal document reads, search results, or new demo evidence associations.
Historical approved originals retain finance access after the vendor becomes unavailable.
An unavailable vendor cannot support a new reservation.

## Implementation

- [Reservation contract](../../src/lib/finance-document-upload.ts)
- [Source choice contract](../../src/lib/finance-document-sources.ts)
- [Source choices](../../src/server/commands/finance-document-sources.ts)
- [Review and access commands](../../src/server/commands/finance-document-review.ts)
- [Finance document router](../../src/server/trpc/routers/finance-documents.ts)
- [Private download route](../../src/app/api/finance/documents/access/route.ts)
- [Exact byte verification](../../src/server/integrations/documents/finance-document-download.ts)
- [Migration 0160](../../drizzle/0160_r7_finance_source_documents.sql)
- [Upload recovery migration 0161](../../drizzle/0161_r7_finance_upload_recovery.sql)
- [Finance document screen](../../src/app/(admin)/admin/finance/documents/page.tsx)
- [Independent review screen](../../src/app/(admin)/admin/finance/documents/review/page.tsx)
- [Genuine Auth and Storage tests](../../src/server/db/r7-finance-document-auth.integration.test.ts)
- [Source regressions](../../src/server/db/test/r7-finance-document-source-regressions.ts)
- [Demo evidence regressions](../../src/server/db/test/r7-finance-demo-evidence-regressions.ts)

Drizzle generated the tables and migration metadata with the installed CLI.
Reviewed SQL adds authority, immutable evidence guards, and private Storage checks.
The source selector shows stored vendor and contract labels instead of free-text source identifiers.
Each page rechecks authority and excludes unavailable new sources before its limit.
An exact retained document binding uses historical source integrity.

Private downloads use an exact-origin POST with a bounded JSON body.
Access tokens remain outside URLs and response headers.
The server verifies byte count, hash, and file type before returning the attachment.
It rechecks live access after retrieving the bytes.

The demo correction preserves function identity, ownership, grants, configuration, and existing rows.
It rejects a new finance association before changing the demo or its evidence history.
Ordinary approved workspace evidence remains supported.

## Executed checks

| Check | Result | Limit |
|---|---|---|
| Four repository finance unit files | 88 checks passed, 48.34 seconds | Command and transport doubles; no genuine SQL proof |
| Repository type checking before source-choice handoff | Passed, exit zero | Later handoff requires a new type check |
| Three inventory files | 17 checks passed, 23.40 seconds | Inventory only |
| Source choices and entry inventory | 33 checks passed, 8.83 seconds | Nineteen source checks and fourteen inventory checks |
| Eight handoff source files, focused lint | Passed, exit zero | Includes signed regression source; does not execute it |
| Finance download route | 14 checks passed, 3.19 seconds | Download and identity dependencies are explicit doubles |
| Finance download route lint | Passed, exit zero | One test file |
| Error contracts and entry inventory | 143 checks passed, 5.29 seconds | Fixed errors and explicit command doubles |
| Four finance screen files and entry inventory | 70 checks passed, 41.84 seconds | Includes 56 component checks; no rendered browser proof |
| Repository type check after finance screen integration | Passed, exit zero | Before recovery command integration |
| Finance screens, navigation, inventory, and upload schema lint | Passed, exit zero | Before recovery command integration |
| Recovery commands, screens, migration ordering, and entry inventory | 70 checks passed, 20.96 seconds | Includes nineteen command and thirty-five component checks |
| Repository type check after recovery integration | Passed, exit zero | No SQL or browser proof |
| Eleven recovery, router, inventory, and metadata files, focused lint | Passed, exit zero | No SQL execution |

The first 161-migration task fixture failed while compiling the finance commit guard.
PostgreSQL returned `42601`, position 2061; all thirty-four task checks were skipped.
An extra closing parenthesis caused that failure.
The corrected SQL remains under disposable verification.
This fixture failure establishes no positive task or finance result.
The next task fixture loaded the corrected 161-migration set and reached its signed task operations.
That setup result does not establish finance document Auth or Storage behavior.

Finance fixture review found missing administration capacity for its new internal and pagination organizations.
The correction adds actual existing AAL2 administrators before public commands.
It preserves scoped staff denials and the application capacity rule.

The scanner in the finance Auth suite is an explicit double.
That suite can verify leases, hashes, byte access, and recorded scanner evidence.
It cannot establish actual ClamAV operation or human understanding of legal terms.
Actual signed finance Auth, Storage, and rendered finance acceptance remain required.

### Retained signed runs on 162 migrations

The first finance run skipped all 44 cases after a duplicate active workspace permission grant failed setup.
It exited one after 97.45 seconds; owned cleanup passed.
The correction removed only the redundant customer grant and verified the existing quote helper's authorization.

The next run passed two cases and failed 42 in 140.24 seconds.
Its intended internal staff lacked active organization memberships.
The correction added explicit synthetic memberships and pagination administrator workspace grants.
It kept the application permission rules and negative assertions.

The next run passed ten cases and failed 34 in 404.71 seconds.
Both positive source classes could reserve documents.
Denied roles and pagination capacity checks passed.
The main positive failure occurred during `begin_review`.
Later reservations also failed after approximately eight seconds.
The actual ten-minute expiry case failed before its wait started.
It provides no expiry evidence.
Owned cleanup passed after all three runs.
Separate signed SQL diagnostics followed this complete failed run.

The isolated first-review diagnostic returned `2201B`: `invalid regular expression: invalid repetition count(s)`.
Reservation passed in 1,210 milliseconds; the actual Storage and worker journey passed in 2,005 milliseconds.
Independent `begin_review` failed in 172 milliseconds.
The database snapshot remained unchanged after that failure.
The focused run retained one failure, filtered the existing 44 cases, and finished in 161.07 seconds.
All 1,446 source and 39 dependency metadata hashes matched; owned cleanup passed.

The event guard used `{0,499}`, which exceeds PostgreSQL's supported repetition bound.
The [PostgreSQL pattern documentation](https://www.postgresql.org/docs/current/functions-matching.html) defines the maximum bound as 255.
The local correction uses explicit byte length from one through 500 and the same allowed-character pattern without a bounded repetition.
It retains the existing reference contract.
The added genuine boundary regression rejects 501 characters and invalid characters without data changes.
It accepts 500 characters through the actual review event guard and records the exact reference.
This case passed in 4,156 milliseconds.
The corrected migration 0160 SHA256 is `725559ecdbf0f5535ecfed52a4ae716f55799caf352987fdd840c5e4f1210e41`.

The separate unchanged pagination fixture creates 27 active and 30 suspended vendors.
Its following reservation returned `57014`: `canceling statement due to statement timeout`, after 8,027 milliseconds.
Current workspace, finance, and staff authorization checks passed in 25, 40, and 29 milliseconds.
The failed reservation left its evidence snapshot unchanged.
The focused run passed one case and failed one, with 44 filtered cases, in 147.13 seconds.
All 1,446 source and 39 dependency metadata hashes matched; owned cleanup passed.
Inner function and trigger phase diagnostics remain active.

### Capacity measurements and rejected compiler hypothesis

The next diagnostic failed one probe, with 45 cases filtered, in 149.24 seconds.
The signed SDK reservation timed out after 8,025 milliseconds.
Verified claims under the actual authenticated SQL role timed out after 8,070 milliseconds.
Both transactions left their evidence snapshots unchanged.

The reservation reached command completion after 444.081 milliseconds.
Its source event guard took 124.705 milliseconds.
Global administration capacity then consumed the remaining request time.
The paired administrator check took 1,223.835 milliseconds.
Seventeen organization iterations reached 7,304.033 milliseconds before cancellation.
Those iterations took 91.724 through 618.518 milliseconds each.
The request never reached receipt insertion or its deferred commit guard.
This narrows the failure to repeated global capacity evaluation.
Inner permission function measurements remain required before a runtime correction.

The preceding timer harness failed its unique source anchor and produced no inner measurements.
Its failed 165.87-second result remains retained.
The corrected phase snapshot matched all 1,446 source and 39 dependency metadata hashes.
Owned cleanup found no containers, volumes, networks, or active runner.

A separate compiler hypothesis did not improve the result.
The unchanged first request succeeded in 7,579 milliseconds.
The capacity-only JIT-disabled request then timed out after 8,055 milliseconds.
Its query plan had total cost 8.99 and no JIT section.
The probe retained the first successful request's original records.
Its harness incorrectly compared the second rollback against the earlier empty baseline.
That assertion stopped the final unchanged comparison.
The probe failed in 144.94 seconds; 45 existing cases were filtered.
An earlier serializer failure also remains retained.
These failures justify no repository compiler change.
The final snapshot matched all source and dependency hashes; owned cleanup passed.
The next diagnostic uses bounded built-in function statistics without changed function bodies, authority, compiler settings, or request limits.

These runs preserve all original 44 cases.
The repository now registers 45 cases with the added reference boundary regression.
No runtime permission rule, production deadline, or assertion was weakened.
They use frozen 162-migration inputs and exclude the later [managed finance draft](r7-managed-finance-2026-10-03.md).

## Risks and recovery

Main risks include crossed source bindings, private original exposure, false approval, and incomplete upload evidence.
Known stale database results must require reload; unknown replies must retain their original command identifiers.
The finance screens now use fixed error classes and retain identifiers for unknown replies.
They show actual stored source labels and separate uploader and reviewer actions.
The current version screen includes exact-file resume and a separate reason-confirmed stop action.
These controls still need genuine Auth, Storage, and rendered browser acceptance.

Migration 0161 adds recovery reads and audited abandonment for an unfinished finance reservation.
Resume requires the original uploader, exact bytes, live source eligibility, and the original ten-minute reservation.
Abandonment requires current scoped AAL2 finance authority and no job, lease, scan, approval, or access grant.
It records a distinct `abandon` history event and leaves the original and private object unchanged.
An exact receipt, audit record, reason, timestamp, and digest must prove its rejected state.
The ordinary document history schema and ordinary transitions retain their existing rules.
This migration has not received disposable database proof.
Never classify abandonment as independent content review or safe-file approval.

Separate adversarial review found no blocking defect in the migration source.
That review checked null inputs, source joins, current authorization before replay, and the complete receipt and audit proof.
It also checked the received-only exception and retained original manifest, private objects, prior receipts, and history.
PostgreSQL execution and actual function-property preservation remain unverified.
The original version remains `ready` with a pending scan; the upload record becomes terminal `rejected`.
Existing finance containment must prevent any ordinary portal or scanner use of that abandoned version.

Disable the new routes or revoke their public RPC execution grants if verification finds a defect.
Retain originals, source bindings, decisions, history, receipts, and audit records.
Use a reviewed forward correction.
Do not rewrite or delete financial evidence.

No saved or hosted database received this migration.
Hosted activation, provider configuration, actual finance permissions, real data, and production require separate authorization.
