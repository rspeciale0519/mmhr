# RFP notification outbox local implementation

The local notification foundation is implemented.
Its focused database and signed Auth gate passed all 24 checks.
The final candidate gate and rendered verification remain open.
This record does not prove actual email delivery or authorize provider activation.

## Behavior and source

The [implementation plan](../../.codex/plans/build-rfp-notification-outbox.md) defines the approved local scope.
Product authority is [PRD](../PRD.md), including FR-RFP-06, FR-CMN-01 through FR-CMN-04, and FR-WRK-02.
Architecture authority is [TECH_STACK](../TECH_STACK.md), sections 11 through 14.

Staff can discover verified vendor participants for an exact approved RFP portal delivery.
Queueing records one immutable recipient, source digest, and minimal message.
Inputs cannot supply an email address, message body, or provider outcome.
Notifications contain no questionnaire text, customer intake, document, or private approval reason.

Every user command requires current scoped `rfp.distribute`, platform `admin.access`, and verified internal AAL2 authority.
Claim, preflight, and retry also check the original queue author's current authority.
The customer organization, vendor organization, profile, membership, identity, approval, delivery source, and deadline must remain valid.
Changed authority stops dispatch and preserves the original record.

## Private history and worker boundary

Migration `0158_r4_rfp_notification_outbox.sql` adds three private RLS tables.
Normal users, anonymous clients, service-role clients, and the general worker cannot read or mutate them.
Immutable row and truncation guards protect sources, attempts, and original action receipts.
Queue and retry replay return their original receipt after later state changes.
Changed request content or correlation fails.

The dedicated worker role has NOLOGIN and three fixed private functions.
It cannot read raw history or choose a replacement recipient.
Concurrent claims produce one bounded lease.
Expired leases and uncertain provider results cannot trigger blind resend.
Only a definite failure before dispatch permits a staff retry.
The third definite failure requires review and preserves the original failed attempt.

The worker defaults to disabled and accepts an injected `EmailService` only.
Provider acceptance uses the state `accepted` and does not prove delivery or acknowledgement.
No worker credential, provider credential, job, deployment, or email send occurs in this slice.
The separate disabled AgentMail adapter has its own [verification record](./agentmail-notification-adapter-2026-10-03.md).

## Verification evidence

Focused command, worker, and authorization inventory tests passed 62 checks across three files.
The type check and focused ESLint passed before the final authority regressions were added.
The integration inventory passed with 118 registered files.
The main agent will run the final broad gates after the source cutoff.

The first disposable integration run applied all 159 migrations on its SQL and genuine Auth stacks.
It ended with 2 passed, 12 failed, and 3 skipped checks.
An ambiguous SQL variable caused the modeled failures.
Duplicate membership seed data blocked the genuine Auth setup.
Both causes were corrected without weakening assertions or isolation.
Later review added explicit JSON result types, eligibility filtering, authority rechecks, truncation guards, and exhausted-attempt review.
Later runs preserve these failures and verify their corrections.

The second run passed all three genuine Auth checks and the two private schema/access checks.
Seventeen modeled checks stopped at a shared fixture assertion before their main assertions ran.
The quote fixture assigns a verified organization administrator to each vendor alongside its separate vendor participant.
Discovery therefore correctly returned four eligible modeled participants.
The test now checks those exact identities and explicitly selects the intended vendor.
The committed concurrency fixture uses the second vendor and preserves immutable history.
The remaining rollback cases use the first vendor.
The next 22-check run passed 9 checks and failed 13.
Twelve failures occurred before worker assertions because the disposable owner lacked SET permission for the new NOLOGIN role.
The fixture now grants SET only to its owned disposable `postgres` login.
No application, migration, saved-stack, or production grant changed.
The remaining failure expected the wrong error code for the existing immutable truncation guard.
The test now requires that guard's exact `P0001` error.

The latest 24-check run adds signed retry and original-receipt replay.
It tests signed command and direct RPC denial across all four entry points.
It also compares every existing public row before and after migration0158 on populated synthetic RFP history.
Its genuine Auth fixture applies all 159 migrations from an empty stack.
The latest type check and focused fixture ESLint passed.
That 24-check run passed 15 checks and failed 9.
Every failure had the same result-function SQL error: `missing FROM-clause entry for table "r4_record_rfp_notification_result"`.
Local variables used a qualification that applies to function parameters.
Distinct `v_outcome` and `v_failure_code` names now remove that error without changing assertions, grants, or result rules.
Independent review confirmed the correction.
The corrected 24-check disposable run passed and exited 0.
It completed both owned SQL and genuine Auth fixture teardowns.
No outbox test stack remains active.

The passing checks cover exact sources, private RLS, ordinary-role denial, original receipts, and signed safe retry.
They also cover malformed results, unchanged audit history, concurrent claims, expiry, exhaustion, revoked authority, and audit rollback.
Populated migration comparison preserved every existing public row.
The genuine Auth fixture also verified migration application from an empty stack.
Provider outcomes in these fixtures are synthetic and do not prove actual email delivery.

A later complete unit gate rejected the fixture's direct migrator import.
The existing authorization scanner permits that capability only in reviewed fixture helpers.
The fixture now calls a fixed prefix function in `r1-migration-rehearsal.ts`.
That function checks registered ownership, original database drivers, loopback ports, scratch location, and configuration hash before migration writes.
The populated comparison remains unchanged and also rejects an unregistered copied context.
All 62 focused authorization and rehearsal boundary checks passed.
The post-correction type check and focused ESLint passed.
The further 24-check disposable run passed and exited 0 after both fixture teardowns.
It took 329.56 seconds and retained the populated and empty migration checks.
No outbox fixture remains active.

The earlier migration0158 SHA256 was `342bc96ffb6549448d4eecde7f629126c2cfcea2963bbb3cd50e5c89278780f2`.
The corrected migration0158 SHA256 is `5a7251db7b4ee2eee1248839bd405e3f9bc9476d42d9c60a31039f67d33a4eb7`.
These logs preserve failed and corrected attempts:

- `rfp-notification-integration-initial.log`
- `rfp-notification-integration-corrected.log`
- `rfp-notification-integration-participant-corrected.log`
- `rfp-notification-integration-final.log`
- `rfp-notification-integration-result-locals-corrected.log`
- `rfp-notification-integration-boundary-corrected.log`

Full logs remain in the authorized session scratch directory.
The older full integration run uses an unchanged source snapshot through migration0156.
Its known contract aggregate timeout remains failed evidence.
That snapshot cannot verify this new feature.

## Remaining work and recovery

Staff controls are owned by the main agent and require separate rendered verification.
Actual provider acceptance, verified delivery events, inbound authentication, reminders, runtime scheduling, and operator alert delivery remain unfinished.
Synthetic transports and SQL fixtures do not prove vendor inbox receipt.
The final complete candidate gate and rendered staff controls remain required.

Recovery keeps the worker disabled and revokes notification RPC execution if a defect appears.
Preserve immutable history for investigation.
Use a forward correction and keep existing portal and financial history.
Saved local, cloud, and production migrations require separate authorization.
