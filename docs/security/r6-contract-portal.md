# Customer selection and contract handoff

Date: October 1, 2026.
Status: Root migration registered. Local migration verification and browser checks remain incomplete.

This work addresses [PRD section 5.7](../PRD.md#57-demos-proposals-and-contract-handoff).
It does not establish full project completion or permission for real customer use.

## Behavior

The customer selects one current approved quote and records reasons and remaining risks.
A saved comparison is optional. The quote must belong to the selected customer intake.
Staff approves or rejects the decision through a separate signed-in account.
Approval creates one handoff and preserves the original customer decision.

Staff records the formal introduction with its business date, time zone, and reference.
The customer and vendor negotiate legal terms directly.
Staff records negotiating, stalled, signed, not-signed, or cancelled status.
Signed outcomes require a separate dated contract reference.
Final outcomes retain the original decision, introduction, source quote, and status history.

A signed outcome creates an internal contract identifier on the existing deal.
It does not create a commission, approve a payment, or close the financial record.
The reference records the parties' reported outcome. It does not verify a legal document or signature.

## Access controls

Customer writes require current contributor or organization-admin membership and customer portal permission.
Staff decisions require current `rfp.approve`, platform administration access, a live session, and verified MFA assurance.
The database derives actors, associations, and record times. The caller cannot provide approval identities.
Global recovery restrictions and current organization controls remain in force.

Vendor reads require their own delivered request and active portal access.
Vendors receive approved handoffs only. Customer reasons, risks, and staff decision text stay private.
Customer and vendor history uses a public status description instead of internal staff reasons.

The three new tables deny raw application access and use RLS.
Original selections, introduction records, signature records, and events have immutable guards.
The legacy command cannot create caller-approved handoffs or change managed portal records.
Existing historical handoffs remain intact.
Historical updates also require current staff approval permission and sufficient MFA assurance.

Retries bind the actor, action, body, and idempotency key.
Forms lock uncertain requests and retry unchanged input.
Stale approvals, invalid transitions, future record dates, and final-state changes fail.
Scoped reads use bounded pages and exclusive cursors.

## Current evidence

| Check | Result |
|---|---|
| Input, command, tRPC, and authorization boundaries | 127 passed |
| Workspace components | 11 passed |
| Selection and handoff forms | 11 passed after a worker startup failure |
| Disposable draft SQL database checks | 10 passed |
| Current type checking | Passed after an explicit test fixture currency type correction |
| Genuine signed Auth rehearsal | Four passed, including rollback and exact retry after the unchanged request timeout |
| Full lint | Passed |
| Production build | Passed after the test fixture type correction |
| Root migration and empty database inventory | Pending |
| Browser interactions and responsive states | Customer selection, staff approval/introduction/signing, vendor privacy/history, and narrow history passed; remaining cases pending |
| Date precision regression | Seventeen time checks and eleven form checks passed |

The database checks apply the existing 154 migrations first.
They then apply generated tables and reviewed draft controls in an owned disposable database.
This proves draft behavior. It does not establish root migration level 155.

The first database run used staff authority for a vendor-only withdrawal and correctly failed that action.
The corrected vendor test passed. The application controls remained unchanged.
The first form process failed before loading tests. A fresh process passed all eleven unchanged checks.
The first genuine Auth setup omitted its synthetic fixture administrator. The corrected setup reached staff approval.
The corrected Auth run reached staff approval and hit the real request statement limit.
The earlier timeout cause remains open. Do not increase that limit or call performance verified.
The repeated signed Auth run passed three checks without an application or database change.
Approval took approximately 2.3 seconds. The earlier timeout cause remains unproven.
A blocked-request check passed rollback and unchanged retry under the same real request limit.
The test holds one owned selection row. Approval times out without a partial handoff.
After release, the identical request records once. Its next identical retry returns the same receipt.

Manual browser checks used ordinary customer and vendor sessions and an existing verified staff MFA session.
The customer saved an approved quote, reasons, and risks. Blank reasons failed before a write.
Script-like reasons remained plain text. The vendor could not read the pending selection.
Staff approved the decision, recorded an introduction, advanced negotiation, and recorded a synthetic signed outcome.
Negotiation and signing remained unavailable before introduction. The signed screen had no further status action.
The vendor read the signed outcome without customer reasons, risks, or staff decision text.
Vendor history replaced internal reasons with `Contract status updated.`.
The 390-pixel history screen had no horizontal overflow. Staff and vendor console checks returned no warnings or errors.
Full network traces, customer terminal reads, foreign-scope browser checks, and remaining responsive/error states remain unverified.
Browser navigation repeatedly timed out. Fresh tabs in the same browser restored several checks.
The signing input normalized zero seconds to minute precision; its visible value and saved outcome confirmed the entered time.
Proof screenshots and the synthetic database record remain in the session scratch directory.
The signed record links one contract identifier to the open deal and retains three status events.
The deal stage still reads `evaluation`. CRM stage coordination remains unfinished.

The contract time field now accepts seconds. This preserves chronology without weakening the database date guards.
The shared converter preserves existing minute inputs and rejects invalid seconds and ambiguous daylight-saving times.
The first component rerun found normalized `.000` seconds. The converter now accepts zero fractional seconds only.
Two test processes failed before component loading. A fresh component run passed all eleven checks.
Type checking later found malformed generated development types. The owned server was stopped before removing that reproducible cache file.
The corrected date behavior passed type checking, full lint, and the production build.
The complete unit attempt passed 409 files and failed the authorization inventory after 410 files completed.
It passed 4,744 tests and failed one. One additional component worker failed before loading its file.
The inventory omitted 23 new contract entries. The source inventory and documented matrix now include those entries.
Bounded source reads and a complete snapshot cache preserve the existing AST checks and five-second test budget.
The fresh inventory run passed four checks. A later four-file run passed 56 checks, including the omitted component.
Current type checking, full lint, and the fresh production build passed. The stable complete unit rerun remains active.
Screenshot review found adjacent navigation links with no visible gap. A wrapping navigation group now separates them.
That final layout correction still needs browser verification and applicable gate confirmation.

The next browser attempt failed during navigation, screenshot capture, and tab recovery.
No Chrome DevTools MCP or Playwright MCP backup was available.
The local customer route returned HTTP 200, but the tool could not verify its rendered interactions.
The fixture removed its owned servers and database. This cleanup result does not count as a passed browser journey.
An earlier production-server attempt ended before browser use because its build retained different browser environment settings.
The corrected rehearsal used explicit isolated local development settings.

A draft now advances approved customer decisions through each required remaining deal stage to `contracting`.
Each transition retains the actual approving actor, current date, revision, and correlation.
It preserves the open financial status and denies the legacy deal command for managed handoffs.
Thirteen draft database checks passed, including rollback, retry, stage history, and denied legacy closure.
Five genuine signed Auth checks passed after this correction.
The signed deal remains `contracting` with open finance status. Verified staff and foreign requests could not use legacy financial closure.
The current public wrapper contains verified request authorization before its managed association lookup.
Self-review added verified legacy request authority before checking managed deal associations.
The earlier browser record still shows `evaluation`; it predates this draft correction.

## Migration and recovery

The draft adds tables and controls without deleting existing history.
The main risks are unauthorized approval, stale selection, private-note disclosure, and duplicate final outcomes.
The guards and rehearsals test these risks.
The full baseline run ended with 110 passing files and 1,056 passing checks. Two checks failed.
One replay journey exceeded its old 20-second test budget. Its corrected isolated suite passed 27 checks.
One identity authorization assertion failed before containment. A fresh isolated suite passed 96 checks.
The original identity failure remains under investigation. These isolated results do not make the full run successful.

Migration 0154 is now registered with generated metadata and the application schema inventory.
The generated schema matches the rehearsed draft. Referenced unique indexes precede composite foreign keys.
The legacy handoff wrapper now verifies authority before checking managed record associations.
Root database and genuine Auth suites replace their draft-only setup.
The old compatibility test creates historical records before the new controls, then tests the forward migration.
Registered migration verification remains active. The normal local database has not received this migration.
Thirteen registered database checks and five genuine signed Auth checks passed.
Self-review then restricted historical transitions to current staff authority.
Two historical migration checks passed after that correction, including denied customer administration and insufficient MFA.
The first historical attempt lost its database connection during startup. Its retry passed; the startup cause remains unknown.

Recovery uses a reviewed forward correction and preserves decision and event records.
Do not restore the old caller-controlled creation command as a fallback.
Only the harness removes its owned disposable databases.
Cloud migration and deployment require separate approval.

## Remaining work

Keep empty database, historical compatibility, and schema inventory checks current after later migration changes.
Complete the remaining alternate browser checks for all three roles.
Review the final diff and repeat applicable gates after those changes.
Approved attachments, automatic email, finance, and customer success remain separate unfinished workflows.

The corrected complete unit run passed 410 files and 4,745 checks, but one worker failed to start.
Browser-only verification passed 86 files and 879 checks, but two workers failed to start.
Neither run passed its gate. Focused missing component checks passed earlier.
The fork-mode comparison passed all 88 browser files and 911 checks.
Windows now uses fork workers with unchanged file isolation, sequential execution, and one worker.
The first default fork run passed 410 files and 4,770 checks. One boundary assertion failed.
The new historical fixture helper imported the database migrator outside the existing access boundary.
The implementation now uses the existing migration rehearsal module. The helper retains a re-export.
All 54 unchanged access boundary assertions passed after this correction.
Current type checking and full lint passed. The fresh complete unit run passed all 411 files and 4,771 checks.
The production build passed for the registered contract and finance candidate.
The installed Vitest code has fixed worker startup limits. Test timeout settings do not control those limits.
The [upstream report](https://github.com/vitest-dev/vitest/issues/11363) describes a similar Windows failure.
That report supports further investigation; it does not prove this machine's exact cause.

## Registered migration and browser evidence, October 1

All 155 root migrations applied to an empty isolated database. Eleven inventory and security checks passed.
The restricted database suite passed ten checks. Historical compatibility passed two checks after its startup retry.
The identity suite passed 97 checks, including host clock drift and explicit future token rejection.
Modeled fixture tokens now use the database clock. Actual Auth validation rules remain unchanged.
The original complete integration failure cause remains unproved. That complete run still failed.

Manual Chrome verification used genuine local Auth and a restricted worker in a disposable database.
The customer saved a selection. Empty reasons could not submit, and script text rendered as text.
The vendor could not read the pending selection. Staff approved it through the administration screen.
Staff recorded the introduction, negotiation, and a reported synthetic signed outcome.
An earlier signing date failed twice. Reload restored the saved negotiation record before the valid request succeeded.
Customer and vendor terminal screens showed the signed outcome without staff decision notes or status reasons.
Another vendor could not read the contract history. It saw the normal unavailable page.
Customer and vendor histories had no horizontal overflow at 390 by 844 pixels.
Final customer, vendor, and staff console checks showed no warnings or errors after page reload.
Local server logs showed successful contract requests and the two expected denied signing requests.
Complete browser network traces remain unavailable.

Database evidence confirmed handoff revision four, three immutable events, and an open deal at `contracting`.
The other vendor's deal remained open at `evaluation`. No finance closure occurred.
The synthetic outcome records the parties' reported status. It is not a legal signature or agreement approval.
Screenshots and bounded database proof remain in the session scratch directory.
The fixture cleanup completed. Its harness test result proves lifecycle cleanup, not the manual assertions above.
Browser withdrawal, rejection, and every alternate terminal route remain unverified in this current registered rehearsal.
Their database and component checks remain separate evidence.
