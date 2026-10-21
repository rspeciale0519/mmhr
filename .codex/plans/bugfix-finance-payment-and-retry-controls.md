# Finance payment and retry correction

Date: October 3, 2026. Status: local implementation authorized under the approved completion sequence.

## Expected behavior

Reject new payments while a commission event remains pending review, disputed, or adjusted.
Keep terminal events unavailable for new payment writes.
Return the original action result for an exact payment or invoice retry.
Never obtain the retry result from a later mutable financial state.
Bind direct RPC request identifiers to their payload identifiers.
Bind an invoice creator to the authorized actor.

This correction supports FR-FIN-03, FR-FIN-04, and FR-FIN-05.
It does not complete independent financial approval, signed-contract eligibility, source agreements, invoice readiness, or financial closure.

## Source and consumers

The current public RPC definitions are in drizzle/0093_r7-finance-authorization.sql.
Application consumers are src/server/commands/commission-payment.ts and src/server/commands/invoice.ts.
Their result contracts require fields absent from the existing SQL replay branches.
The existing payment integration fixture accepts payment against a pending-review event.
No finance domain is connected to the current application router.

## Implementation and validation

1. Generate a new custom migration with the installed Drizzle CLI and a secret-free configuration.
2. Review exact function replacements before applying them to disposable databases.
3. Preserve function identity, execution grants, ownership mode, and the empty search path.
4. Store new original payment outcomes as a bounded state enum in the existing immutable audit record.
5. Return deterministic original invoice states from their action receipts.
6. Reject historical payment retries when their original outcome has no qualifying evidence.
7. Test changed requests, later state changes, denied roles, revoked access, and audit failure.
8. Run focused tests, disposable integration checks, type checking, lint, unit tests, and the build.

Historical receipts lack the original payment state.
Do not invent that state or retry a second write.
Keep the old payment, amount, audit event, and receipt unchanged for reviewed reconciliation.

## Risks and recovery

The main risks are unsupported original outcomes and payment writes before approval.
The additive migration changes functions only. It does not rewrite financial rows or grant new permissions.
Recover through a reviewed forward correction or disable affected entry points while preserving history.
Do not restore the unsafe pending-review payment path for real use.
Normal local migration application, cloud migration, deployment, and external actions remain separately controlled.
