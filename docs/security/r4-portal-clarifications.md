# Portal response clarifications

Staff can ask a question about the latest saved vendor response.
The question records a future deadline and its exact recipient and response revision.
The assigned vendor can answer through its portal.
The vendor states what changed and can link its latest newer response revision.
The server checks that revision against the same recipient.
Late answers remain visible with a late indicator.
Closed RFPs reject new questions and answers.

A different staff member must accept, reject, or defer the answer.
The decision requires a recorded reason.
An accepted answer reaches the customer only after the associated response has separate approval.
A pending response revision cannot become approved through a clarification decision.
The customer receives no pending response identifier through the clarification read.

## Boundaries

- Staff reads, questions, and decisions require `rfp.approve`, platform `admin.access`, and AAL2.
- Vendor reads and answers require `portal.vendor.access` in the assigned vendor organization.
- Customer reads require `portal.customer.access` in the customer organization.
- The server derives the actor from a verified live Auth session.
- Commands reject actor fields, unknown fields, blank text, and excess UTF-8 bytes.
- Questions and answers accept up to 5,000 UTF-8 bytes each.
- Change summaries and decision reasons accept up to 2,000 UTF-8 bytes each.
- Exact retries use the original actor, payload, and idempotency key.
- Raw clarification records remain inaccessible through application credentials.
- Stored questions and answers render as text.

Database triggers preserve the original question, deadline, associations, and answer history.
The older clarification RPCs cannot invent vendor answers or approve portal clarifications through their earlier paths.
Earlier clarification records retain their prior command behavior.

## Migration and recovery

Apply `drizzle/0143_narrow_toro.sql` after `drizzle/0142_abandoned_bloodstorm.sql`.
The migration adds nullable columns and a recipient key before it adds the associated foreign key.
It preserves older clarification records.
The new routes require the migration before deployment.
No hosted migration is authorized by this document.

The main risk is an incorrect association or an unintended customer disclosure.
Tests must check different customer and vendor organizations, old command paths, and separate response approval.
For recovery, remove the new clarification calls from the application and revoke execution on the two clarification RPCs.
Keep questions, answers, revisions, audit records, and security receipts.
Keep the database guards against older command paths.
Use a reviewed forward correction for a schema or access defect.

## Local evidence

The guarded disposable `r4-portal-response.integration.test.ts` passed 21 tests on September 30, 2026.
It used genuine local Auth and MFA sessions.
It tested customer isolation, wrong roles, replay, invalid fields, deadlines, revision links, and the older RPC paths.
The six clarification component tests also passed.
The local browser verified staff questions, linked vendor revisions, independent decisions, and separate customer response approval.
The question author could not record the decision.
The customer could not read the accepted answer while its linked response awaited approval.
Customer and vendor views fit a 390-pixel viewport without horizontal page overflow.
The tested browser reported no console errors or warnings.
The local server recorded successful page and tRPC requests.
Full browser network traces and an exported screenshot file were unavailable.

The separate security review found that the source response identifier could appear in a customer read.
The read now omits that identifier when an answer links a newer response.
The command also rejects a result that restores the omitted identifier.
The revised database check passed in the latest 27-test portal, clarification, and demo suite.
The full unit run passed 4,270 tests. Type checking, lint, and the production build also passed.
The five earlier isolated security suites passed 60 tests against 144 migrations.
The latest full integration command remains unverified.

Email replies and uploaded documents remain unfinished.
This evidence does not establish complete FR-RSP coverage or production readiness.
