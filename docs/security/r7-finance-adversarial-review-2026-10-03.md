# Finance security review and SQL evidence — October 3, 2026

The final local correction passed the expanded payment and invoice SQL suites.
Payment passed 43 checks. Invoice passed 21 checks.
These results support a limited security correction. They do not establish complete finance workflows or production approval.

## Scope and result

The review compared [migration 0157](../../drizzle/0157_r7_payment_approval_and_retry_receipts.sql) with preceding SQL function definitions and canonical finance requirements.
The review used the final source with the paid-state guard.
It found no new defect within the bounded correction.

Payment RPCs bind the payload correlation and idempotency identifiers to the RPC arguments before receipt lookup.
Receipts retain the original actor, command, organization, entity, and exact payload digest checks.
Replay reads the original financial outcome from immutable audit evidence associated with the original receipt.
It does not infer that outcome from a later event state.

New payment writes permit only `approved`, `invoiced`, and `partially_paid` event states.
They reject `pending_review`, `disputed`, `adjusted`, `paid`, `voided`, and `written_off` states.
Historical payment receipts without original outcome evidence fail with `42501: Original payment receipt unavailable`.
Tests confirm that this denial changes no financial row, receipt, or audit record.

Invoice creation binds the creator to the authorized actor.
Invoice replay retains receipt and payload checks and returns the original action outcome: `draft`, `issued`, or `voided`.
It does not return a later invoice state.
Strict identifier checks intentionally reject missing or inconsistent request identifiers.
Current application commands supply these identifiers.

Audit summaries permit only four `finance_state` strings: `approved`, `invoiced`, `partially_paid`, and `paid`.
Tests reject unrelated states, amounts, money fields, numbers, JSON null, arrays, and objects.
The correction adds no permission grants or private financial content to audit summaries.

## Additional regression coverage

The [payment suite](../../src/server/db/r7-payment.integration.test.ts) now rejects null, array, and object audit state values.
Both suites compare function properties before and after migration.
These checks include OID, owner, ACL, security mode, search path, volatility, parallel mode, return type, set-return behavior, and argument types.

The [invoice suite](../../src/server/db/r7-invoice.integration.test.ts) creates historical draft, issue, and void receipts through the actual pre-correction RPC.
It applies the remaining migrations and then replays all three original requests.
Each replay returns its original outcome and leaves the full invoice, receipt, and audit snapshot unchanged.
The existing request binding, authorization, rollback, state, and isolation assertions remain in place.

## Verification

Each guarded command created its own disposable Supabase project.
The runs were sequential. No saved or cloud database changed.
Both wrappers exited with code 0 after fixture cleanup.
Read-only Docker checks found no remaining owned payment or invoice containers or volumes.

| Check | Result |
| --- | --- |
| `npx eslint src/server/db/r7-payment.integration.test.ts src/server/db/r7-invoice.integration.test.ts` | Passed |
| `npm run test:integration -- src/server/db/r7-payment.integration.test.ts` | 43 passed; 134.22 seconds total |
| `npm run test:integration -- src/server/db/r7-invoice.integration.test.ts` | 21 passed; 132.72 seconds total |

The payment run started at 00:51:46 EDT on October 3.
The invoice run started at 00:56:02 EDT on October 3.
Earlier payment 40-check and invoice 20-check passes remain separate evidence.
The expanded runs do not replace those records.

Retained logs are in the authorized session scratch directory:

- `C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/finance-payment-adversarial-2026-10-03.log`
- `C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/finance-invoice-adversarial-2026-10-03.log`

| Source | SHA-256 |
| --- | --- |
| `drizzle/0157_r7_payment_approval_and_retry_receipts.sql` | `61b2e1fd74ce626321c97223aaf5535cb2a5c4415f1551be8efc12888104aae0` |
| `src/server/db/r7-payment.integration.test.ts` | `3fc7f64ecea229b6ee0a4f1f4eb1159c459a6aced6cf0a7b2f746127b94c0255` |
| `src/server/db/r7-invoice.integration.test.ts` | `34e344df56f0fe2d74ec68040247f64f25d78102da2a1980a404b3dc21cc66db` |

The runs used 159 repository migrations, including the later notification migration.
The additional test changes did not change implementation, schema, permissions, dependencies, or provider activation.

## Limits, risks, and recovery

These suites model Auth claims through SQL fixtures.
They do not establish genuine Auth or application command integration results.
Separate evidence must cover those paths.

[Canonical finance requirements](../PRD.md) still require independent financial approval and signed contract eligibility.
Effective approved vendor agreements, confirmed contract values, and currency remain incomplete.
Invoice readiness, ownership, amounts, reconciliation, approved exceptions, and financial closure also remain incomplete.
The existing reversed-payment path does not implement linked reversal accounting.
An `approved` database state alone does not prove an independent approval occurred.

Incorrect financial associations and ambiguous historical outcomes remain material risks.
Keep unfinished finance workflows unavailable for real cases.
Historical payment replay denial requires review of the original records; it must not trigger a new automatic payment write.
Recover through a reviewed forward correction while preserving financial rows, receipts, and audit history.
Do not restore the earlier permissive state checks to bypass a failure.
No production migration or finance activation is authorized by this record.
