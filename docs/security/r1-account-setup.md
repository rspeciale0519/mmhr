# Verified account setup and CI repair

Updated: 2026-09-08. Status: implemented locally; database and browser release evidence remains open.

## Connected workflow

Sign-in and immediate-session registration now call `completeAccountSetup` before redirecting to `/home`.
The helper calls identity synchronization, then private customer workspace setup with one client and correlation ID.
Both adapters verify caller claims. Identity synchronization also checks the live provider user and confirmed email.
SQL independently checks the subject, live session, account state and verified email.
The returned identity IDs must match. Form fields cannot select an identity, organization, role, permission or redirect.

Registration without a session still asks the user to confirm email and sign in.
No callback route, automatic post-confirmation login, cloud Auth configuration or email template was added.
Existing customer workspaces remain retry-safe. Existing staff, vendor and administration authority does not become a new customer grant.
Page permissions, MFA requirements, RLS and Super Admin bootstrap remain separate controls.

On setup failure, the helper attempts `signOut({ scope: "local" })` and stops navigation.
It accepts cleanup success only when the provider returns `error: null`.
Missing, malformed, returned and thrown cleanup failures produce an explicit sign-out uncertainty message.
Provider errors never reach the displayed response. Redirect exceptions remain outside catches.

Local sign-out targets the current session rather than other devices.
It does not promise immediate invalidation of an issued access token; live authorization controls remain required.
See the [Supabase sign-out reference](https://supabase.com/docs/reference/javascript/auth-signout) and installed `@supabase/auth-js` source.

Auth actions now require cookie writes through an optional strict mode in the server client factory.
Write failures propagate instead of silently producing apparent authentication success.
Default read-only Server Component behavior remains unchanged. No cookie values were read or recorded during this review.
The pending-access message now explains retrying setup instead of requiring administrator approval for every customer.

## Database failure and additive correction

[CI run 34301817813](https://github.com/rspeciale0519/mmhr/actions/runs/34301817813) tested commit 0011ad8.
Standard checks passed. Database tests passed 84 files and 812 cases, but failed six files and 13 cases.
This is failed release evidence, not an environment-only failure.

The original identity synchronization writer placed API response keys in `audit_events.after_summary`.
The existing summary validator rejects those keys. The transaction rolled back before receipt insertion.
Migration `0107_r1_identity_sync_audit.sql` corrects the writer without changing that validator.

New summaries contain only the allowed status field.
The immutable action records `identity.synchronize.created`, `.unchanged` or `.synchronized`.
Existing audit columns retain the actor and correlation ID. The command name remains `identity.synchronize`.
Replay reconstructs the same public result from the matching receipt, audit status and action.
The original caller/session restrictions and strict request digest remain unchanged.
No table, RLS policy, existing record or prior migration file changes.

Other CI repairs preserve their original security requirements:

| Failure | Root cause | Correction |
| --- | --- | --- |
| Three exact table comparisons | Shared inventory listed customer registration out of alphabetical order | Correct order; add uniqueness and order regression |
| Two workspace retry checks | Fresh correlation input was compared with the previous correlation | Reuse and assert the request correlation |
| Two restricted identity fixtures | Pending identities cannot transition directly to suspended or recovery pending | Start with a valid active identity |
| Matching cleanup | Requirement history prevents direct parent deletion | Retain rows until the disposable rehearsal is removed |
| Unauthorized intake read | The selected fixture actually had workspace permission | Use an active principal without membership |
| Immutable history errors | Mutation trigger raises P0001, while raw read denial raises 42501 | Assert each actual denial contract and unchanged history |

## Forward and recovery paths

Apply reviewed migration 0107 to a disposable database, then repeat all integration tests.
Verify all synchronization outcomes, exact retry results, no duplicate audit and sequential customer setup.
Verify restricted identities, stale sessions, isolation and unchanged raw-access denial.
Validate staging before production. This package has not applied any staging or production migration.

For containment, revoke execution on `public.mmhr_sync_my_identity(uuid)` and remove the Auth setup composition through a forward patch.
Preserve identities, organizations, immutable audits and receipts. Do not weaken summary validation or reset database state.
Existing migration 0101 remains in history. Reverting its broken writer is not a functional recovery path.

The main risks are incomplete setup, mistaken identity binding, cookie-write failure and disclosure through errors.
Setup retries preserve existing authority. Cleanup uncertainty is explicit, not reported as a confirmed sign-out.

## Verification

- The thrown-provider regression failed before the fix and passed afterward.
- The strict cookie-write regression failed before the fix and passed afterward.
- Focused Auth, setup, adapter, cookie and inventory run 49878 passed 112 tests, type checking and full lint.
- Migration and inventory run 55534 passed eight tests, type checking, full lint and the 67-route build.
- Full unit run 27488 passes 310 files and 3,298 tests in 269.21 seconds.
- Final migration-order and audit checks pass six tests.
- Integration inventory passes for 90 files and 108 migrations pass the ledger check.
- Changed integration files collect successfully; the registration file now has 39 cases. Collection does not execute SQL.
- Independent Auth review found no remaining security defect and confirmed installed SDK error propagation.
- Independent SQL review found no remaining defect. A legacy-receipt concern was withdrawn because the original writer could not pass the audit constraint.
- Database fixes require a fresh complete CI run. Local Docker remains unavailable; no reset or repeated startup attempt was made.
- Browser verification of real sign-in, confirmation, setup, cleanup and workspace access remains required.
- After the build, the built-in browser showed release blocks at sign-in and pending-access with no console warnings or errors.

The preceding customer requirement view was committed as 09c6b35 after 3,263 passing unit tests.
Commit 9d1abba records the database repair. Commit 7ba545f records Auth composition and evidence.
The pushed head matches 7ba545f4d6ad87135a8f0199ef02b892678f8938.
[CI run 34305894008](https://github.com/rspeciale0519/mmhr/actions/runs/34305894008) now runs the complete checks for that head.
Draft PR #10 remains open into develop. The new database result remains pending.
No merge or production release is approved by these partial results.
