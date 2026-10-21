# RFP approval setting

The product owner approved optional separate staff approval on September 13, 2026.
Migration 0131 turns the requirement off.
An authorized MMHR staff member can then approve their own draft.
Customers still need MMHR approval.
Approval still requires MFA, organization access, an approval reference, and an audit record.
This setting does not change amendment or clarification approval rules.

The setting is database configuration. There is no administration switch in the UI yet.
Only a database operator can change it.
The application reads the same setting that the approval command enforces.
Refresh an open review page after a change.
The server rejects self-approval if the setting changed after the page loaded.

Run this transaction as the database owner to require a different staff approver:

```sql
BEGIN;
SELECT mmhr_private.r1_lock_security();
UPDATE mmhr_private.rfp_approval_policy
SET require_separate_approval = true
WHERE singleton = true;
COMMIT;
```

Use `false` to permit staff self-approval again.
Obtain separate approval before changing production configuration.
The security lock orders the change against approval commands.
Existing approvals and exact retries remain valid after either change.
A missing configuration row requires separate approval.

The main risk is that one staff member can approve an incorrect draft.
To restore separate review, set the value to `true`.
Preserve existing audit, approval, and delivery records during recovery.

## Local verification, September 13, 2026

- Eight approval database tests pass with both settings, missing configuration, customer denial, MFA denial, audit history, and exact retries.
- Three disclosure and delivery database tests pass, including delivery after staff self-approval.
- Five focused component and command tests pass.
- Type checking, full lint, and the production build pass.
- The native browser verifies both display states and form success using the real component with synthetic data and test responses.
- This browser preview does not prove the full authenticated customer journey.
- Local migrations through 0131 applied. No production configuration changed.

The separate security review checked direct configuration access, stale pages, existing approvals, and missing configuration.
Application roles cannot change the private setting.
The database enforces the current policy independently of the page.
