# Invoice and payment command bindings — October 2, 2026

This local change supports FR-FIN-04 and FR-FIN-05.
It does not complete invoices, collections, contract eligibility, or financial approval.

## Change

Both commands pass the request correlation ID into permission authorization.
They verify the returned actor, organization scope, and correlation before calling their scoped RPC.
Payment results must identify the exact payment and commission event.
A received payment result must report `partially_paid` or `paid`.
A reversed record retains the existing database behavior; this change does not implement reversal accounting.
Invoice creation rejects a creator other than the authorized actor.
Invoice results must identify the requested invoice and the original action result: draft, issued, or voided.
Unknown result fields, states, and outcomes fail validation.
Provider errors remain private. Authorization errors retain their existing type.

The commands use request-scoped Supabase clients and existing `finance.manage` authorization.
No schema, permission grant, provider, dependency, or migration changed in this slice.
Existing command signatures and RPC names remain unchanged.

## Evidence

Candidate: `codex/full-delivery-verification`, uncommitted changes on a large existing dirty worktree.
Environment: local Windows, installed npm dependencies, migration baseline 157.
The changed command tests passed all 50 checks.
They cover recorded and replayed response validation, altered entities, authorization mismatches, invalid inputs, action mismatches, and private errors.
These tests mock authorization and RPC responses. They do not establish real provider retry behavior.
Type checking and full lint passed.
The integration inventory check passed for 116 files.
Secret scans passed for 1,156 tracked and 374 untracked files.
The existing guarded payment and invoice SQL suites each passed one check across migration level 157.
These legacy fixtures do not invoke the changed application commands or establish real contract eligibility.
The first combined integration command was refused by the existing one-target wrapper.
Separate guarded commands passed without changing that guard.
The complete unit retry passed all 418 files and 4,940 tests outside the sandbox.
The earlier failed complete gate remains recorded. Test isolation and rules were unchanged.
The production build passed after the complete unit gate.
Final whitespace review and changed document link checks passed.
The final untracked secret scan passed for 375 files.

## Required follow-up

Current SQL can accept a payment for a `pending_review` event.
The current payment integration fixture explicitly exercises that behavior.
This contradicts independent financial approval and must change before complete collection workflows are usable.
Payment and invoice SQL retry branches also omit fields required by their application result contracts.
Exact retries therefore remain incomplete; mock replay tests only verify the required response shape.
Record immutable original outcomes without reading a later financial state or weakening receipt checks.

Bind eligibility to an actual signed portal contract and an effective, approved vendor agreement.
Require confirmed contract value and currency; do not infer these from a quoted annual price.
Retain independent approval, private source versions, invoice readiness, payment reconciliation, approved exceptions, and closure evidence.
Do not expose commission details to customer or vendor screens without a reviewed explicit permission.

The main risks are incorrect financial associations and ambiguous writes after incomplete responses.
Keep the unfinished finance surface unavailable for real cases.
Recover command changes by restoring the preceding command implementation through a reviewed local change.
Preserve all database rows, receipts, and audit history.
No production or cloud action is authorized by this record.
