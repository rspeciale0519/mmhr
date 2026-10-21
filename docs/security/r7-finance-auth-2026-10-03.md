# Finance command verification with signed Auth sessions

Date: October 3, 2026. Result: 35 checks passed in one isolated local run.

The invoice and payment application commands now have evidence from genuine signed Auth sessions.
This result closes the modeled-claims evidence gap for migration 0157.
Complete finance acceptance remains open.

## Verified path

The [new integration suite](../../src/server/db/r7-finance-auth.integration.test.ts) calls
[recordInvoice](../../src/server/commands/invoice.ts) and
[recordCommissionPayment](../../src/server/commands/commission-payment.ts).
It supplies real Supabase clients through the existing server composition option.
It does not mock authorization, RPC responses, session claims, or finance storage.

The commands call [authorizePermission](../../src/server/auth/authorization.ts).
That function verifies claims with `auth.getClaims()` and calls `mmhr_authorize` through the signed client.
The same client calls the public finance RPC.
The database checks current authority and writes finance rows, receipts, and audit records in one transaction.

The [existing Auth fixture](../../src/server/auth/security-command-api-fixtures.ts) creates synthetic users in an owned disposable local stack.
It signs users in through Auth and completes actual TOTP enrollment and verification.
The suite checks real AAL2 claims, session rows, and verified MFA factors.
It uses distinct stable identity and Auth subject identifiers.
It never creates SQL-built request claims or substitutes unsigned token data.

The fixture actor has reviewed Super Admin authority and explicit workspace access in both synthetic organizations.
The synthetic staff actor has reviewed staff authority, scoped workspace access, and a scoped finance permission.
Both actors must pass the unchanged permission evaluator.
One external administrator has customer and vendor memberships; both scopes remain denied for finance.

## Checks and results

| Cases | Count | Verified result |
|---|---:|---|
| Invoice creation, issue, void, and original retries | 1 | Original action states survive later transitions; changed payloads fail |
| Approved and invoiced event payments | 2 | Partial and full payments succeed; retries preserve each original audited state |
| Denied payment states for received and reversed writes | 12 | Pending review, disputed, adjusted, voided, written-off, and paid events reject new writes |
| Denied invoice source states | 5 | Pending review, disputed, adjusted, voided, and written-off events reject creation |
| Anonymous, outsider, customer, vendor, and low-assurance staff | 5 | Application commands and signed RPC calls reject fresh and retried writes |
| Actor, creator, and organization binding | 1 | Forged actors and creators fail; fresh foreign associations return `42501` |
| Missing or altered correlation and idempotency fields | 4 | Both finance RPCs reject mismatched payload identifiers for fresh writes and retries |
| Required audit storage failures | 2 | Payment and invoice data, event changes, and receipts roll back |
| Raw financial REST reads | 1 | Anonymous, external, and finance staff clients cannot read the three financial tables |
| Current finance authority denied | 1 | Fresh commands and original retries fail without financial changes |
| Expired and deleted live sessions | 1 | Valid signed claims cannot bypass the current database session checks |
| Total | 35 | Passed |

The suite compares complete finance rows, receipts, and finance audit records before and after denied operations.
It retains these comparisons for altered retries, foreign scope, permission denial, session denial, and audit failures.
An altered organization on an existing key returns `22023` because the original payload hash differs.
A fresh command with an authorized organization and a foreign finance entity returns `42501`.
The suite checks both outcomes separately.

The low-assurance staff case proves that its real AAL1 session exists and its assigned finance authority is valid at AAL2.
Its AAL1 application calls and direct signed RPC calls still fail.
After session expiry or deletion, `getClaims()` still verifies the signed token.
The database rejects finance operations because the current session is no longer valid.

## Executed verification

Command: `npm run test:integration -- src/server/db/r7-finance-auth.integration.test.ts`.
Result: one file passed; 35 checks passed; exit code zero.
Duration: 178.16 seconds, including setup and teardown.
The guarded one-file runner excluded application secrets and used an owned disposable loopback target.

The final fixture applied all 159 registered migrations.
The suite recorded the last two hashes from `drizzle.__drizzle_migrations`.
These hashes matched current source when the runner finished.

| Migration | Stored SHA256 |
|---|---|
| [0157 finance correction](../../drizzle/0157_r7_payment_approval_and_retry_receipts.sql) | `61b2e1fd74ce626321c97223aaf5535cb2a5c4415f1551be8efc12888104aae0` |
| [0158 notification outbox](../../drizzle/0158_r4_rfp_notification_outbox.sql) | `342bc96ffb6549448d4eecde7f629126c2cfcea2963bbb3cd50e5c89278780f2` |

The suite does not exercise notification behavior.
Loading migration 0158 does not establish outbox acceptance.

Focused ESLint passed for the new test file.
The source check found no trailing whitespace.
Repository type, lint, unit, build, and complete integration results remain separate evidence.

The suite awaited `fixture.close()` in `afterAll` before the runner exited successfully.
The existing cleanup function checks the owned project, configuration digest, random ports, and scratch network before removal.
Cleanup errors fail the suite.
No independent post-run Docker inventory check was performed.

Final trace: [35 passing checks](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/r7-finance-auth-final-2026-10-03.log).

## Retained failed attempts

The [first run](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/r7-finance-auth-2026-10-03.log) failed during fixture permission verification.
All 35 checks were skipped.
The new fixture lacked the required organization membership and explicit workspace access for internal actors.
The correction added only synthetic memberships and grants required by the existing evaluator.
No application permission checks changed.

The [second run](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/r7-finance-auth-retry-2026-10-03.log) passed 34 checks and failed one SQLSTATE assertion.
The test expected `42501` for an altered original scope.
The receipt function correctly returned the existing `22023` payload-conflict result.
The corrected assertion separates original-key conflicts from fresh foreign associations and retains the no-write comparison.
The full corrected suite then passed all 35 checks.

Migration 0157 had the same stored hash in all three runs.
Migration 0158 changed independently during notification work.
Its first and second stored hashes were `a29fb045a9a8bb52773c165301747a5af1a303801c29bb8e0433245e4e9ac091`
and `b3223f54cbbc54b4fbd5872dd7f57589125f60693e21546aafb2e225786fc878`.
The retained logs record each loaded version.

## Limits and next acceptance work

All finance events, contract and agreement references, organization memberships, and permission grants were synthetic owner-seeded fixtures.
The events started with owner-seeded approved or specified denied states.
The suite does not prove signed-contract eligibility, independent finance approval, or source agreement validity.
It does not test commission creation, reversal accounting, reconciliation, financial closure, or a finance screen.
It does not establish customer approval of real data or authorization for a live launch.

Historical receipt compatibility and function permissions have separate SQL evidence in
[the finance recovery record](r7-payment-and-invoice-recovery-2026-10-03.md).
This signed Auth run supplements that record.
It does not replace the complete integration gate or change the earlier audit cutoff.

Keep unfinished finance surfaces unavailable for real cases.
Complete source eligibility and separate finance approval before testing one complete finance workflow.
Preserve finance rows, source versions, command receipts, and audit history if another defect appears.
Disable affected entry points and use a reviewed forward correction for recovery.
Do not restore the unsafe pending-review payment path.

No cloud, email, real-account, saved-database, Git, dependency installation, or production action occurred in this verification task.
