# AgentMail synthetic notification adapter

Date: October 3, 2026. Status: local adapter checks pass; application delivery remains unverified.

## Scope

The user authorized three existing AgentMail inboxes for synthetic customer, staff, and vendor tests.
[The new adapter](../../src/server/integrations/email/agentmail-test-notification-email.ts) supports only those exact inbox addresses as senders and recipients.
It implements the existing internal `EmailService` interface.
It remains disabled by default and has no environment lookup or application activation.
The production email choice in TECH_STACK remains unchanged.

The future worker supplies a private, validated notification manifest.
The adapter binds its recipient, customer organization, RFP, template, content, correlation, and idempotency identifiers.
It copies source values before dispatch and denies changed requests.
The lease must remain valid before dispatch.
The adapter sends generic plain text only, without attachments, audit tokens, organization identifiers, or tracking fields.

## Provider behavior

The adapter uses native fetch against a fixed HTTPS endpoint.
It omits browser credentials, denies redirects, disables caching, and bounds the request deadline and response bytes.
Successful provider acceptance requires valid message and thread identifiers.
The receipt reports `sent`; it does not claim mailbox delivery or participant use.
See [AgentMail send reference](https://docs.agentmail.to/api-reference/inboxes/messages/send).

The request uses the immutable notification ID in the `Idempotency-Key` HTTP header.
AgentMail retains send keys for 24 hours; durable database attempt controls must govern retries after that period.
See [AgentMail idempotency reference](https://docs.agentmail.to/idempotency).

Every post-dispatch transport failure, non-200 response, malformed result, or incomplete acceptance remains uncertain.
The adapter makes at most one fetch call for one instance, including concurrent calls.
It exposes no provider error text or key in its result.
Uncertain outcomes enter the worker's `needs_attention` result instead of automatic retry.

## Verification

Command: `npm test -- src/server/integrations/email/agentmail-test-notification-email.test.ts`.
Result: one passing file and fifty passing checks.
All provider calls use an injected mocked fetch; no API key or actual inbox is accessed.

Checks cover exact source bindings, disabled configuration, invalid keys, fixed addresses, expired leases, and source mutation.
They cover HTTP errors, malformed and oversized acceptance, private errors, duplicate calls, and concurrent calls.
Two checks compose the actual worker and adapter with mocked database and provider functions.
They establish provider-neutral result mapping only.
They do not establish real queue authority, signed-session behavior, provider acceptance, mailbox delivery, or hosted operation.

Focused ESLint passed. Independent source review found no blocking defect in this inactive adapter.
Mocked checks do not prove real timeout, streamed cancellation, redirect handling, or provider deduplication.
Broader candidate gates remain required after active source changes stop.
The outbox database and genuine Auth checks remain separate under [the outbox plan](../../.codex/plans/build-rfp-notification-outbox.md).
Earlier direct API email evidence remains in [the synthetic role record](agentmail-synthetic-role-test-2026-10-01.md).

## Risks and recovery

Incorrect source resolution can disclose a relationship, even when the email contains generic text.
The adapter cannot replace current database authority and recipient verification.
The reviewed worker must repeat source and access checks before dispatch.
Ambiguous provider writes can cause duplicates if an operator ignores durable attempt state.
Keep uncertain attempts blocked until reviewed evidence resolves them.

Recovery disables the worker and preserves notification, attempt, receipt, and audit records.
Apply a reviewed forward correction without resending uncertain attempts.
No package installation, provider activation, real email send, cloud action, Git write, or deployment occurred.
