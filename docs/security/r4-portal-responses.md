# Portal response submission and approval

The portal records vendor replies against the exact delivered RFP recipient.
Customer and vendor organizations remain separate.
The server derives the customer, vendor profile, and RFP version from that recipient.
The browser cannot provide an actor or change those associations.

Vendors enter statements in eight response fields.
Each statement can use up to 2,000 UTF-8 bytes.
All statements together can use up to 32,000 UTF-8 bytes.
Each submission creates an immutable revision linked to the existing response normalization records.
The latest revision starts in `pending`.
Late responses remain visible with a late indicator.
Closed RFPs reject new responses.

Only authorized MMHR staff with AAL2 can review or approve responses.
A different staff member must approve or reject a reviewed response.
Customers see the most recent approved response for each recipient.
A later pending revision does not remove the previous approved response.
Older revisions remain in staff and vendor history.
Older revisions cannot receive new approval decisions.

## Access controls

- Vendor submission and history require `portal.vendor.access` in the vendor organization.
- Staff reads and decisions require `rfp.approve` and platform `admin.access`.
- Customer reads require `portal.customer.access` in the customer organization.
- Raw tables remain inaccessible through user, anonymous, service-role, and worker sessions.
- The RPC validates the payload again before it writes records.
- Security receipts bind retries to the same actor, payload, and idempotency key.
- Concurrent submissions lock the recipient and check its current response revision.
- Stored responses render as text.

## Migration and recovery

`drizzle/0142_abandoned_bloodstorm.sql` expands response associations with a vendor organization.
Existing response rows retain their historical organization association.
Compatibility triggers fill that association for older command callers.
The migration adds portal source records, private access controls, and guarded RPCs.
It also restricts the existing review RPC to staff with AAL2.

Apply the migration before serving the new response routes.
Do not apply it to a hosted project without separate approval.
For recovery, disable the new response routes and revoke execution on the two portal RPCs.
Keep source records, normalization rows, security receipts, and audit history.
Use a forward correction for a schema or permission defect.
Do not restore the older review permission rule.

## Verification

`src/server/db/r4-portal-response.integration.test.ts` uses a guarded disposable Supabase project.
It uses genuine Auth sessions and different customer and vendor organizations.
It follows publication, customer selection, disclosure, RFP approval, and portal delivery before response tests.
The original portal response suite passed all 19 tests on September 30, 2026.
Six related migration and compatibility suites passed another 19 tests.
The expanded response and clarification suite then passed 21 tests.
The browser verified vendor submission, independent staff approval, customer isolation, and revision replacement.
The build, type check, lint, and focused component checks passed for the reply change.
The later full unit run passed 385 files and 4,270 tests.
The latest genuine Auth suite passed 27 portal, clarification, and demo tests against all 145 migrations.
These results do not establish a full integration command pass against the latest tree.

The [clarification interface](./r4-portal-clarifications.md) now has database, component, and local browser evidence.
The final clarification privacy correction passed its genuine Auth database rerun.
Email replies and uploaded response documents remain unfinished.
This change does not establish complete FR-RSP coverage or production readiness.
