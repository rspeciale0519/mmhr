# Finance payment and invoice correction

Date: October 3, 2026. Status: verified local database correction; complete finance acceptance remains open.

## Result

New payment writes now require an approved, invoiced, or partially paid event.
Pending review, disputed, adjusted, paid, voided, and written-off events reject new payment writes.
An exact original payment retry remains valid after the event reaches paid.
Payment retries return the original audited outcome instead of the later mutable event state.
Invoice retries return the original action state: draft, issued, or voided.
Direct RPC calls bind correlation and idempotency arguments to their payload identifiers.
Invoice creation also binds its creator to the authorized actor.

These changes support FR-FIN-03, FR-FIN-04, and FR-FIN-05.
They do not complete signed-contract eligibility, independent financial approval, reversal accounting, reconciliation, financial closure, or finance screens.

## Migration and compatibility

The installed Drizzle CLI generated [migration 0157](../../drizzle/0157_r7_payment_approval_and_retry_receipts.sql) and its registered metadata.
The migration changes existing function definitions through checked replacements.
It preserves function identity, ownership, execution grants, security mode, and the empty search path.
It adds no permissions and rewrites no financial records.

New payment audit records retain a bounded `finance_state` enum.
Historical receipts without an immutable original outcome fail safely with `Original payment receipt unavailable`.
This failure does not create another payment or change the old payment, receipt, or audit record.
Historical reconciliation requires separate review; the application must not guess the missing state.

## Current verification

Candidate: `codex/full-delivery-verification`, with existing uncommitted work preserved.
The focused database runners applied all 158 registered migrations to owned disposable databases.
They exited with code zero after teardown.
They did not apply migrations to a saved local stack or a cloud database.

| Command | Result | Evidence scope |
|---|---|---|
| `npm run test:integration -- src/server/db/r7-payment.integration.test.ts` | 40 passed | Direct SQL with modeled Auth claims |
| `npm run test:integration -- src/server/db/r7-invoice.integration.test.ts` | 20 passed | Direct SQL with modeled Auth claims |
| `npm test -- src/server/commands/invoice.test.ts src/server/commands/commission-payment.test.ts` | 50 passed | Mocked authorization and RPC results |
| Focused ESLint and whitespace checks | Passed | Changed finance integration tests |

Database checks cover role denial, AAL1 denial, revoked sessions, payload conflicts, changed identifiers, immutable retries, and audit rollback.
They cover partial and full payments, denied terminal writes, missing historical outcomes, and unchanged function properties.
These claims are modeled SQL claims, not genuinely signed Auth sessions.
The later [signed Auth suite](r7-finance-auth-2026-10-03.md) passed 35 checks through actual invoice and payment commands.
It verifies synthetic AAL2 sessions, revoked permissions, expired or deleted sessions, immutable retries, and audit rollback.
Its finance sources and approved states remain owner-seeded; this does not prove independent approval or contract eligibility.

The later independent review added three payment audit-shape cases and one historical invoice compatibility case.
The expanded suites passed 43 payment and 21 invoice checks across 159 registered migrations.
Historical invoice receipts originate through pre-correction functions, then replay after migration 0157 without changing their records.
Function property checks include volatility, parallel mode, and return type.
See [the independent review](r7-finance-adversarial-review-2026-10-03.md) for exact scope, hashes, and limitations.

Saved traces:

- [Payment pass](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/r7-payment-forward-owned-retry-2026-10-03.log).
- [Invoice pass](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/r7-invoice-forward-owned-2026-10-03.log).

## Retained failed attempts

The initial sandbox runner could not access Docker and skipped its checks.
The first owned payment run passed 39 checks and failed one incorrect expected conflict SQLSTATE.
The existing receipt function reports `22023`; the test now checks that result and retains the no-write assertions.
The complete corrected payment suite then passed all 40 checks.

The first current type check failed on a test helper's inferred UUID subtype.
The helper now explicitly accepts a string identifier.
A new full type check and broader candidate gates remain required after active source changes stop.
The earlier full integration baseline retains its failures and cannot become a passing result through these focused checks.

## Risks and recovery

Missing historical outcomes and incorrect source associations remain the main finance risks.
Keep unfinished finance surfaces unavailable for real cases.
Disable affected entry points or apply a reviewed forward correction if a defect appears.
Preserve payments, receipts, source versions, and audit history.
Do not restore the unsafe pending-review payment path.

No package installation, Git write, normal migration application, cloud action, provider activation, or production deployment occurred.
See [the implementation plan](../../.codex/plans/bugfix-finance-payment-and-retry-controls.md),
[the preceding command evidence](r7-finance-command-bindings-2026-10-02.md), and
[the complete integration record](r1-integration-gate-2026-10-03.md).
