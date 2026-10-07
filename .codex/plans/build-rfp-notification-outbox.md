# Build the RFP notification outbox

Version 1.1. October 3, 2026. Local implementation is authorized.

The outcome is a durable notification queue for an exact approved RFP portal delivery.
Staff can select a verified vendor participant, queue one notification, inspect its state, and request a safe retry.
This slice does not send emails or activate a hosted worker.

## Authority and scope

Product authority is [PRD](../../docs/PRD.md), including FR-RFP-06, FR-CMN-01 through FR-CMN-04, and FR-WRK-02.
Architecture authority is [TECH_STACK](../../docs/TECH_STACK.md), sections 11 through 14.
Existing portal delivery remains the required source of recipient and RFP associations.
Existing provider-independent `EmailService` remains the dispatch boundary.
Provider acceptance must not be reported as delivery or acknowledgement.

This is a local software foundation for the later complete email workflow.
Inbound signature verification, delivery webhooks, reminders, attachment ingestion, provider activation, and runtime scheduling remain separate work.
The main agent owns staff queue, status, and retry controls in this implementation.

## Source and authority rules

- Queue, retry, recipient discovery, and status reads require current organization-scoped `rfp.distribute` and platform `admin.access`.
- Both permissions require internal staff with verified AAL2 sessions.
- Every RPC independently rechecks current stored authority and organization scope.
- Browser inputs contain identifiers, source digest, revision, and request metadata only.
- Browser inputs cannot supply email addresses, message bodies, provider identifiers, or delivery outcomes.
- The source is an approved questionnaire version with actual portal delivery to the exact active vendor profile.
- The source binds customer organization, RFP ID and version, portal recipient, vendor organization, delivery reference, and delivery dates.
- The recipient is an explicitly selected active membership in that vendor organization.
- Its active identity and linked Auth user must have matching verified email addresses.
- Its vendor portal access must remain active; an address alone never proves participation.
- Queueing freezes the exact source digest, verified recipient, generic notification content, and immutable identifiers.
- Notifications include no customer intake, questionnaire body, proposal, document attachment, or private approval reasons.
- Worker preflight rechecks the source, deadline, membership, identity, vendor profile, and portal access before dispatch.
- The customer organization must remain active and reviewed.
- Claim, preflight, and retry require the original queue author to retain verified MFA identity and both original permissions.
- Changed authority or source prevents dispatch and preserves the original notification for staff review.
- Raw outbox, attempts, and receipts stay private and deny normal user, anonymous, service-role, and general worker access.
- Row mutation and owner truncation guards preserve source snapshots, attempt history, and original command receipts.

## States and retry rules

| State | Meaning | Allowed next action |
| --- | --- | --- |
| `queued` | A notification exists; no provider operation is proved. | Fixed worker claim after current source checks. |
| `leased` | One worker owns a bounded attempt. | Exact lease result only. |
| `accepted` | The provider reports message acceptance. | Future verified delivery event; no manual resend. |
| `failed` | A definite failure occurred before provider dispatch. | Staff retry of the same immutable notification. |
| `needs_attention` | Outcome is uncertain, authority changed, a lease expired, or three attempts failed. | Staff review; no blind retry. |

Each claim has a random token, attempt number, expiry, and immutable attempt identity.
Concurrent claims must produce only one active lease.
Expired leases never imply permission to resend.
Uncertain network failures never trigger automatic retries.
Staff retries reuse the same domain record and provider idempotency identifier.
Retries create a new attempt history; they do not replace the frozen source or content.
The third definite failure keeps its original attempt result and requires operator review on the outbox record.
Configured operator alert delivery remains unfinished; staff status alone does not prove alert delivery.
Changed idempotent command input fails rather than changing an existing notification.
Queue and retry results retain their original action receipt even after later state changes.

## Data and implementation phases

1. Add private outbox, attempt, and command-receipt schemas in `src/server/db/schema/r4-rfp-notifications.ts`.
2. Generate migration 0158 only after the finance migration 0157 is registered.
3. Review generated SQL and add scoped RPCs, RLS, immutable-field guards, audit calls, and restricted worker grants.
4. Add provider-independent contracts, strict command result binding, and disabled worker composition.
5. Add recipient/status queries and queue/retry mutations to the existing `rfps` router.
6. Register the new entry points and integration fixture through coordinated inventory edits.
7. Verify behavior, source isolation, exact receipts, leases, denied calls, and audit rollback.
8. Record remaining gaps and owned test cleanup.

The migration expands the schema without changing existing RFP, portal, financial, or communication history.
The dedicated worker role has NOLOGIN and receives only fixed private functions.
No login credential, scheduled task, provider adapter, or deployment is activated.
No production dependency changes are required.

## Verification

- Strict contracts reject invalid identifiers, extra content, invalid states, altered source bindings, and provider result mismatches.
- Command tests reject actor, correlation, organization, RFP, membership, and revision substitutions.
- Disabled worker tests prove that no claim, send, or result operation occurs.
- Fake EmailService tests cover definite pre-dispatch failures, uncertain outcomes, exact acceptance receipts, and exhausted attempts.
- Disposable database tests cover raw table denial, private function denial, queue idempotency, original receipts, and changed-input conflicts.
- Database tests cover AAL1, customer, vendor, foreign organization, inactive identity, revoked membership, and stale source denial.
- Database tests cover concurrent leases, expiry, forged result tokens, wrong attempt identifiers, unsafe retry, and audit failure rollback.
- Direct worker tests reject null, number, object, array, and extra result fields without changing any record or audit event.
- Database tests filter ineligible memberships before the result limit and block revoked author or customer organization authority.
- Genuine Auth checks verify request-scoped API behavior with separate customer and vendor organizations.
- Empty and populated migration checks verify additive deployment and preserved history.
- Run current type checking, lint, focused tests, integration inventory, and relevant broader gates after the source settles.

The existing full integration run uses an earlier frozen source snapshot.
It does not cover migration 0158 or these new entry points.
Fake transport results do not establish actual email delivery.

## Risks and recovery

Incorrect recipient resolution can disclose a customer relationship.
Server resolution, minimal content, source binding, verified membership, and private records reduce that risk.
An uncertain provider response can cause duplicate email if retried without proof.
Uncertain attempts therefore stop in `needs_attention` and cannot be blindly retried.
Source or access changes can make a queued notification unsafe.
Preflight rechecks those conditions before any future provider dispatch.

Recovery disables the worker and revokes notification RPC execution if a defect appears.
Preserve immutable records and attempts for investigation.
Apply a forward correction rather than deleting historical records or reverting unrelated financial schema.
The existing portal delivery continues to operate independently.

## External boundaries

Local code, synthetic tests, and disposable migrations are authorized.
Saved local database migration application, cloud migrations, secrets, hosted provider configuration, and production actions remain outside this slice.
Sending emails, activating jobs, or provisioning worker credentials needs separate authorization where existing approval does not cover the action.
Git actions and new production packages remain separate approvals.
