# R6 proposal and pricing verification

Date: October 1, 2026. Status: local structured quote workflow; broader proposal requirements remain incomplete.

## Scope and controls

Vendors submit original structured quotes at `/vendor/proposals` against their own delivered RFP recipient.
Staff review quotes at `/admin/proposals`. A different staff member must approve each quote.
Customers read approved quote history and approved comparisons at `/customer/proposals`.
The workflow groups vendor-specific deals under one customer intake.

Each source retains its original text, typed prices, received date, version, hash, and submitter.
Decisions create immutable events. Audit failure rolls back the source, proposal version, event, and command receipt.
The server derives actor identity and approval dates. Caller-supplied actors, hashes, and approval dates are rejected.
Commands require current membership, current permissions, live Auth sessions, and exact revisions.
Staff decisions require verified MFA. Vendor writes require an organization administrator or contributor.
Idempotent retries use the same request. Revoked access also blocks replay.

Prices use exact nonnegative integer minor units. Unknown prices remain distinct from zero.
Recurring prices retain their billing period and price basis.
Optional charges and positive discounts require descriptions.
The application preserves terms, assumptions, and customer-requested changes.
It does not calculate currency conversions, aggregate incomparable prices, or alter product ranking.

Comparisons contain two to five approved quotes from different vendors within one intake.
Known currencies must match. Each saved comparison freezes its original source quotes and dates.
A different staff member approves the comparison against its exact source digest.
Changed, withdrawn, or superseded sources prevent approval of a draft comparison.
A separate staff member can reject a stale draft.
Customers retain approved history after recipient withdrawal. Historical records explicitly show that their sources are no longer current.
Pending revisions remain private. A new pending quote does not replace an older approved quote.
Only independent approval of a new quote supersedes earlier approved quotes from that vendor and intake.

Direct reads and writes to the new tables are denied, including service and worker roles.
Request-scoped Supabase clients use four bounded public RPCs.
The legacy proposal command cannot modify the managed quotes or create comparisons using them.
Customer DTOs omit private actors, hashes, deal identifiers, approval references, and decision reasons.

## Local evidence

| Check | Result |
|---|---|
| Empty database migration rehearsal | 154 migrations; 11 checks passed; 150 public and two private tables |
| Proposal database controls | Nine checks passed, including historical reads and stale approval rejection |
| Genuine signed Auth RPC checks | Five checks passed, including a current low-assurance staff session with valid assigned permissions |
| Contracts, commands, transport, screens, forms, and authorization inventory | Six files; 93 checks passed |
| Schema inventory | One additional check passed |
| Final screen and form regression checks | 19 passed after browser corrections |
| Authorization architecture boundaries | 54 checks passed after moving the helper into the existing test-only folder |
| Complete unit suite | Corrected stable run passed all 406 files and 4,667 tests |
| Full integration suite | All 112 files are running in isolated rehearsals; two checks failed; final result pending |
| Type checking | Passed after the browser and test-boundary corrections |
| Full lint | Passed after browser and final fixture corrections |
| Production build | Passed after the narrow-label and foreign-scope corrections |
| Rendered browser workflow | 17 manual checks passed with customer, two vendors, and two staff accounts |

Scratch logs record each check. These results establish local synthetic behavior only.
They do not establish participant acceptance, hosted operation, full FR-PRP completion, or permission for customer use.

The first signed-token run rejected obsolete vendor sessions.
Those test accounts enrolled MFA after their first sign-in. Their earlier sessions no longer existed.
The fixture now uses current ordinary customer/vendor sessions and current MFA staff sessions.
The application retains its live-session checks.
The current low-assurance staff denial test also verifies a live session, valid assigned permissions, and verified enrollment.
Its fresh AAL1 sign-in proves the denial concerns missing session MFA assurance rather than an obsolete session.

Browser checks covered role entry, invalid price precision, both vendor submissions, escaped quote text, and pending customer privacy.
They also covered staff reviews, separate approvals, draft comparison privacy, separate comparison approval, and original source links.
Pending revision privacy, retained approved prices, narrow layout, cross-vendor rejection, and withdrawal history passed.
The narrow table keeps labels readable and confines horizontal scrolling to its comparison region.
Foreign quote scope now returns the private not-found page. Two regression checks verify this mapping and preserve unexpected failures.

Console warnings and errors were empty before the deliberately invalid foreign-scope request.
The first rejection produced an expected development AuthorizationError in the error boundary.
The corrected page returned a private not-found response during the second check.
Full browser network traces remain unavailable. Local server logs show successful role reads and proposal mutations.
The owned browser servers, containers, generated volumes, and network are removed.
Ports 3006, 3076, and 3077 have no listeners. Normal MMHR saved database, storage, and edge volumes remain present.

## Migration and recovery

Migration `0153_r6_portal_proposal_quotes.sql` adds three tables and scoped RPCs.
It preserves legacy unmanaged proposals while blocking legacy commands against managed sources.
Apply it only to an approved target after migration review.
No cloud or production migration was applied during this work.

The local verification stack uses disposable databases and synthetic accounts.
Its cleanup removes its own generated containers, volumes, and network.
Normal MMHR saved volumes remain intact.
For hosted recovery, restore the approved pre-change database backup or disable the new application entry points.
Preserve quote and decision history. Do not delete managed records or weaken audit constraints to recover an action.

## Open requirements

Approved source-document attachments require the unfinished document extraction, review, approval, and signed-access controls.
Fresh portal reply and identity-intent suites passed 27 and 96 checks after the full run reported failures.
Replay now uses the existing longer journey budget. The original identity failure still needs investigation.
Email ingestion and automated proposal extraction remain unfinished.
Contract selection, introduction, and handoff are under construction. See [the contract record](r6-contract-portal.md).
Do not treat this structured portal implementation as complete coverage of those requirements.
The dependency security gate and all R9 release evidence gates remain blocked.

See the [complete pilot plan](../../.codex/plans/build-complete-pilot-workflow.md) and [private document record](r4-private-document-work.md).
