# Vendor catalog profile approval

Status: Local implementation, tests, and browser checks passed. Five profile approvals remain pending.

## Change and scope

The eight reviewed products were absent from the actual comparison preview.
Migration 0116 requires vendor-profile approval dates and identities before collecting product inputs.
The repository had no staff command to record that review.

Migration 0141 adds a scoped profile read and an audited profile approval command.
The staff evidence page shows the current profile revision, review reference, reason, and confirmation control.
The server records the verified actor and server time. The client cannot supply either value.
The command activates a prospect profile or approves an unapproved active profile.
It rejects paused, archived, previously approved, unrelated, or stale profiles.
An identical retry uses its existing receipt. A changed payload cannot reuse that receipt.

Approval does not change commercial metadata, organization membership, permissions, evidence, or comparison rules.
It does not approve numerical estimates, individual facts, or a customer publication.
The existing comparison gate remains intact.

## Risk and recovery

Approved profiles can enter future comparisons when their products and evidence qualify.
Existing publications keep their captured records and remain unchanged.
The SQL command requires staff access, workspace access, and organization audit authority.
Raw tables remain closed. Anonymous and service-role callers receive no new function execution rights.

Apply the additive migration locally after disposable integration checks pass.
Deploy the migration before application code in a later authorized environment.
On application rollback, retain the migration and review history.
Correct SQL forward if required. Do not delete approval or audit history.
An erroneous approval requires a separately reviewed correction; this change does not add a revocation interface.
No cloud or production application is authorized by this work.

## Verification

- Focused command, route, component, and inventory tests: four files, 30 tests passed.
- Type check passed.
- Disposable CRM command integration: three tests passed in 66.69 seconds.
- Integration covers authorization denial, unrelated profiles, stale revisions, supplied reviewer fields, changed retries, duplicate approval, and one audit/receipt.
- Stored commercial metadata remains null. The actor, approval state, reason, and reference are verified.
- The initial integration failed because the audit vocabulary excludes CRM status `prospect`.
- The command now records the approval transition `pending` to `approved`. The audit validator is unchanged.
- Initial migration generation lacked the required URL. Generation succeeded with the configured loopback host and port; no database connection was used.

## Local application and browser evidence

Migration 0141 applied successfully to local port 57022 after the disposable tests passed.
The migration inventory is 142. No cloud database changed.
Lint and the production build passed; the build generated 71 routes.
Integration inventory passed for 100 files. Tracked secret scan passed for 1,156 files.
Supplemental scan found no matches in 118 untracked source and document files.
The dependency audit reported zero vulnerabilities.

An additional adversarial review added paused, archived, and foreign-organization denial cases.
The full CRM integration file passed again: three tests in 64.52 seconds (session 24234).
The audit test also checks the stored reason, reference, and before/after approval states.
The review found no change to commercial metadata, permissions, RLS, or existing publications.

Native staff controls saved BambooHR, ADP Workforce Now, and UKG Ready profile approvals.
Read-only database verification confirms those three approvals and five unapproved profiles.
The five are Paylocity, Paycom, isolved, Rippling, and Gusto.
An early UKG workspace navigation occurred before selection completed; the page still showed ADP.
No approval was sent then. Waiting for the workspace home page resolved the navigation issue.

The Paycom submission was rejected by automatic approval review for missing specific user authorization.
No Paycom approval was recorded. A single approval request for all five remaining local profiles is pending.
Do not bypass this rejection with SQL or an indirect write.

At 320 pixels, the approval page measured 305 pixels for both document and content width.
The screenshot shows readable fields and no horizontal overflow.
Tab moves focus from the reference field to the reason field with a visible focus indicator.
Browser warning and error logs were empty. The viewport was reset and both working tabs retained.

Full unit session 4459 completed: 364 files and 4,100 tests passed in 737.35 seconds.
No validation process remains running. Final diff whitespace check passed.
Phase 1 remains incomplete. Remaining profile approvals, package scope, real publication, and customer choices remain open.
