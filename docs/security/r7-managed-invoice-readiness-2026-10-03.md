# Managed invoice readiness evidence

Date: October 3, 2026. Status: complete34-case genuine database gate passed; rendered acceptance remains open.

## Latest verification

The corrected complete run passed all34 cases. No case failed, skipped, or remained pending.
The original owner forgery test passed with SQL42501 and unchanged retained snapshots. All four DATE tests passed.
Vitest completed in3661.85seconds. The complete guarded run took3680.809seconds.
The result records accepted:true and cleanupConfirmed:true.
All1531 source files,166 migrations,1074 installed metadata files, nine API inputs, and124 evidence files stayed unchanged.
The database, API, and Storage had verified loopback isolation. Owned containers, volumes, networks, and port listeners were absent after cleanup.
The [complete result](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/invoice-full34-json-repaired166-capture-2026-10-03/run-invoice-full34-json-repaired166-result.json) retains every case and source guard.
Result SHA256: `4d80d920fe2856d10c32023622d86a7d6d4c61ce03b059b72443cb59472da0a0`.
Log SHA256: `e5aacb49a57a60f15b08f6c87f33018d27509b7ad3669a3ee7777f980a1573b5`.
This result does not verify browser behavior, collection features, or release readiness.

The earlier complete run passed33 cases and failed one. It had no skipped cases.
The updated-package diagnostic reproduced the failure at `history_receipt` before SQL transport.
Direct issue and changed digest attacks returned the required `42501` denial.
Drizzle changes the shared JSON serializer. Three native `sql.json(payload)` parameters then supplied objects to string encoding.
The [test correction](../../src/server/db/r7-managed-invoice-auth.integration.test.ts) encodes the complete payload and applies explicit `jsonb` casts.
The correction preserves attack payloads, SQL functions, assertions, and deadlines. The corrected complete34-case run now passes.

The failed diagnostic result remains `accepted:false`. Its history insert and final history snapshot check did not run.
Source, dependency, and evidence guards passed. The running database, API, and Storage used verified loopback bindings.
Owned containers, volumes, and network were removed. The original listener probe lacked permission.
Separate scoped inspection confirmed all three owned ports absent. It did not change or replace the failed result.
Diagnostic log SHA256: `6dbb93cb8cc19a52c69e7c92a017e942d6ecdbb2037e2001ea7fc5c78b81e159`.
The result remains in `invoice-forgery-updated166-capture-2026-10-03` in session scratch.

## Scope

[PRD FR-FIN-04](../PRD.md#58-commissions-and-financial-closure) requires invoice owner, readiness, dates, number, amount, and supporting documents.
[The finance plan](../../.codex/plans/build-finance-eligibility-approval-and-closure.md) defines the complete financial workflow and approval boundaries.
This slice prepares one full-amount invoice from an approved managed commission calculation.
It requires a different authorized person to approve readiness before issue.
Zero remains a recorded invoice amount; it does not imply payment or financial closure.
Collection, approved exceptions, recalculation, financial closure, and external sending remain unfinished.

## Current implementation

The [strict contract](../../src/lib/managed-invoice.ts) binds invoice, preparation, event, revisions, digest, and immutable original retry results.
The [command layer](../../src/server/commands/managed-invoice.ts) uses request-scoped Supabase clients and trusted current actor output.
The [typed router](../../src/server/trpc/routers/managed-invoices.ts) checks the server-selected customer finance workspace.
Preparation derives amount and currency from approved stored sources; callers cannot submit either value.
Stored owner and reviewer eligibility must remain current for approval and issue.
Replacing an unissued proposal preserves its earlier preparation and decision history.
Exact authorized retries return the original receipt without rewriting current ledger state.

The [original-download command](../../src/server/commands/managed-invoice-original.ts) checks customer invoice authority and the original's separate finance workspace.
It binds the current preparation, exact original version, hash, revision, size, type, and file name.
Private Storage access uses the existing request-scoped grant and final live authorization.
The command checks the stored invoice and preparation again after reading bytes.
The [POST route](../../src/app/api/finance/invoices/originals/route.ts) checks origin, selected scope, bounded input, and selection after download.
It returns private bytes and a non-secret review access identifier; it does not expose the access token.
Expired original access returns 410 after current authority checks.
Unknown outcomes must retry the complete unchanged request.

## Migration and compatibility

The installed Drizzle CLI generated migration [0164](../../drizzle/0164_r7_managed_invoice_readiness.sql).
It adds two private supporting tables, managed invoice fields, and supporting indexes.
Reviewed assembly places composite unique indexes before their foreign keys.
Deferred cyclic references allow the exact preparation and invoice to commit together.
Six frozen SQL chunks add source checks, private guards, history, public commands, and bounded reads.
An internal correlation alias avoids the ambiguous decision-column pattern found in managed finance.
The first assembled migration SHA256 was `6256b99890eef57ae99e104275b0b32af1509f30b748eb989b669beeca5f7ac1`.
Actual PostgreSQL execution found SQLSTATE `42601` at line 481 before invoice assertions ran.
Two unparenthesized `CASE` expressions caused the history-guard parse failure.
The correction preserves both comparisons and adds their required expression parentheses.
The corrected migration SHA256 is `62b228670b538f4753f672bcea5c154db3a6101c7386df7e07b16b39739cf937`.
No saved, hosted, or production database received this migration.
The next diagnostic proved SQLSTATE `42703` in `r7_invoice_originals_ok` through genuine RPC and authenticated SQL.
The function read `vendor_organization_id` from an agreement version, but that field belongs to `finance_agreement_series`.
The correction reads the vendor from the version's exact organization and agreement series.
It rejects a missing series vendor and retains all source, hash, approval, and live authority comparisons.
The resulting migration SHA256 is `6b1b0f271918ed76f42a6e583d48cc9717db1ecc428d79f0d20ba4edc5ca3463`.
Actual execution confirmed that the corrected source read succeeds.
Initial preparation then failed with `42501` and `Managed invoice canonical source denied`.
Both genuine RPC and authenticated SQL identified the same canonical guard.
The existing invoice columns store PostgreSQL `date`; the new preparation stores `timestamptz`.
Comparing those values directly rejects valid preparation times that do not fall at midnight.
The correction stores and compares UTC calendar dates in the existing invoice columns.
Managed detail returns the exact preparation times and verifies their binding to those calendar dates.
Full precision still controls history, review, retries, and the future issue-time check.
The calendar correction's migration SHA256 was `23c5b51cdd0b558a4d10560ac7007edc13a99788d62941a05b6c50bd5d24c013`.
Its first genuine regression uses microsecond times near UTC day boundaries and rejects changes to either stored calendar date.
Full type checking and full lint passed after this correction.
The genuine first workflow then passed preparation, independent approval, issue, exact detail, and original retries.
The Drizzle model now uses nullable `date(..., { mode: "string" })` for both existing invoice date columns.
The installed generator created snapshot 0165; review found only those two type changes and normal snapshot ancestry.
The reviewed [migration 0165](../../drizzle/0165_r7_invoice_date_alignment.sql) asserts existing nullable DATE columns instead of applying generated type conversions.
It fails with `42804` on unexpected types or nullability and changes no data, functions, grants, RLS, receipts, or history.
The generated metadata was copied without manual edits; all earlier metadata remains unchanged.
A fresh generation roundtrip found no schema changes in 8.76 seconds; all 296 source/history and 39 metadata inputs matched.
Full type checking, full lint, and the 123-file integration matrix passed after model alignment.
The complete run passed actual model, populated preservation, and unexpected-schema rollback cases.
Historical receipt compatibility and complete invoice acceptance remain open.
Legacy migration 0157 remains unchanged; full historical compatibility remains unverified.

## Checks and limits

| Check | Result | Limit |
|---|---|---|
| Frozen v3 contract and transport | 46 passed | Mocked database transport |
| Integrated invoice, router, original command, route, and related checks | 158 passed across nine files | No genuine invoice RPC or Storage proof |
| Integrated focused lint and full type check | Passed | Before final mandatory-source output check |
| Final invoice calculation and source output correction | 46 passed; focused lint passed | Full type check must follow stable UI integration |
| Frozen UI v2 | 29 component checks, strict types, lint passed | Integrated after all eight file and 21 input hashes matched |
| Integrated focused screen/router/route checks | 179 passed; five new page checks failed | Incorrect new mock membership and pagination data; no runtime access relaxation |
| Corrected page checks | 21 passed | Unit mocks; no browser proof |
| Post-UI full types and focused lint | Passed | Current rendered and genuine database acceptance remain open |
| Expiry transport classification | 81 checks passed across two files; full types and focused lint passed | Exact authorized access RPC expiry only; genuine expiry case remains pending |
| First actual invoice launch | Failed before startup; all fifteen assertions skipped | Sandbox Docker access required approved tool escalation |
| Authorized first actual launch | Failed migration with `42601`; all fifteen assertions skipped | All 1,508 source and 39 dependency metadata hashes matched; owned cleanup passed |
| Corrected first genuine invoice test | One failed; seventeen skipped; 233.83 seconds | Migration loaded; source and calculation approval completed; invoice source read failed with a generic adapter error |
| Frozen corrected first test inputs | All 1,516 source and 39 dependency metadata hashes matched; owned cleanup passed | Metadata hashes do not cover every installed dependency byte |
| Current genuine invoice suite | Six passed; 28 failed; no skips | First full workflow, raw properties, and four DATE cases passed; complete acceptance failed |
| Source-read diagnostic v2 | Genuine RPC and authenticated SQL proved `42703`; three unchanged snapshots; 103.56 seconds | Retained original SDK failure; 1,516 source and 39 metadata hashes unchanged; owned cleanup passed |
| Metadata and fixture import corrections | 67 checks passed across three files in 11.03 seconds | Complete fresh unit gate remains pending |
| Additional boundary source checks | Full strict check: 3,599 files, zero diagnostics; focused lint: seven files, zero errors or warnings | Two exact checked files integrated after all 21 current input hashes matched; actual boundary execution remains unrun |
| Corrected genuine UTC first workflow | One passed; 29 skipped; 104.83 seconds | All 1,517 source, 39 dependency metadata, and 62 brain inputs matched; owned cleanup passed; full suite remains open |

Output checks reject an invoice without its calculation and mandatory originals missing from its preparation.
Independent UI review found that uncontrolled fields could retain values from a prior proposal after background refresh.
The v2 correction resets revision-specific forms while preserving the complete uncertain command above those forms.
Its regression checks clear old owner, terms, dates, review confirmation, and access identifiers after a stored proposal changes.
The [guarded page](../../src/app/(admin)/admin/finance/invoices/page.tsx) derives customer scope and actor from current server authority.
Approved calculation navigation links to its exact stored commission event, including issued invoices.
The new original cases check genuine cross-workspace bytes, immutable grant replay, source denial, replaced preparations, and actual grant expiry.
Twelve additional cases require valid staff SDK and direct RPC results before testing role and current-session denials.
They preserve a revoked membership and restore access through a new membership, without changing the historical revocation record.
Same-scope attacks use stored identifiers in wrong entity positions; a distinct valid cross-event target uses another customer scope.
The corrected two-case run passed raw-role/function checks but failed initial invoice preparation with `42501`.
The invoice source read now succeeds; the later UTC correction passed the first preparation, approval, and issue workflow.
It retained 28 skipped cases and took 96.52 seconds.
All 1,517 source and 39 dependency metadata hashes matched; owned cleanup passed.
The first-only diagnostic retained one failed case and 29 skipped cases in 97.46 seconds.
Its SDK and authenticated SQL returned the same exact canonical guard message.
Both complete state snapshots matched; all 1,517 source and 39 dependency metadata hashes matched; owned cleanup passed.
The corrected first case passed in 104.83 seconds, including exact microsecond detail and both wrong-calendar denials.
It proved one invoice and three history entries; self-review remained denied and exact retries caused no retained changes.
The four added cases check actual date decoding, exact private timestamp decoding, populated preservation, and wrong-schema rollback.
Their strict check passed across 1,047 files; focused two-file lint passed without errors or warnings.
All thirteen input hashes matched before integration; all thirty earlier cases and deadlines remain unchanged.
Full type checking and full lint passed after integration.
The complete thirty-four-case capture contains 1,520 files, 166 migrations, and 39 dependency metadata records.
It had no observer, test-filter, assertion, or deadline override.
The complete run passed six cases and failed 28 in 245.51 seconds.
Its first workflow passed preparation, separate approval, issue, exact timestamps, calendar denial, and original retries.
All four actual DATE model, preservation, and malformed-schema rollback cases passed.
One changed retry returned `FinanceDocumentInputError` instead of the expected `FinanceDocumentConflictError`.
Sixteen source setups returned `Invalid initial selection input`; eleven dependent boundary setups could not finish.
Those failures do not prove the intended download, expiry, role, session, or revocation controls.
All 1,520 source files, 39 dependency metadata records, and 62 memory inputs stayed unchanged.
Owned containers, volumes, network, and all three fixture listeners were absent after cleanup.
The [complete result](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/managed-invoice-166-date-aligned-full34-result-2026-10-03.md) retains every case and failure.
Its SHA256 is `3d98558a7301ca99f08960c71dedcfe6fe5a9a9cfa72b9c51fc60c72c37f3630`.
The run log SHA256 is `d27d62a9352d4b639caa198f34e59b7f6a2bc52f086dc9549ef52bed8903ab38`.
Source review identified two causes; the corrections below require a fresh complete run.
Private grant snapshots keep only token digests; they cannot expose raw access tokens on assertion failure.
Review found that actual expired retries fail before returning a grant, so the original 410 branch could not handle them.
The narrow adapter now classifies the exact issue RPC's `42501` expiry only after live authority checks.
Other RPCs, error codes, messages, and denied accounts retain their original denial behavior.
Actual Auth, private Storage, revocation, expiry, concurrent commands, audit rollback, and historical acceptance remain open.
The corrected first test reached `getManagedInvoiceSource` before invoice preparation.
The adapter returned `Managed invoice request failed`; the later diagnostic established its specific database cause.
The diagnostic preserved that error and recorded safe RPC error categories without changing SQL or request limits.
The complete unit gate passed 5,790 checks and failed two across 458 files in 1,072.94 seconds.
Its 1,515 source and 39 dependency metadata hashes stayed unchanged.
Metadata fallback and three direct test type imports were corrected; 67 focused checks passed.
A fresh complete unit gate remains required.
Browser loading, empty, denied, stale, uncertain retry, download, narrow layout, console, and network checks remain open.
Full candidate checks remain failed or incomplete under [their record](current-candidate-gates-2026-10-03.md).

## Reviewed correction at 17:51 EDT

Repeated quote fixtures selected every published product, including products from earlier committed cases.
The third setup therefore exceeded the unchanged five-option customer limit.
The fixture now selects and checks its exact two seeded product identifiers within its organization and publication.
It does not truncate options or change production selection rules.

The invoice command now rejects a changed recorded request with `40001` before returning its receipt.
Changed historical correlation also returns `40001`; malformed input remains `22023`, and unauthorized input remains `42501`.
The shared replay helper, adapters, immutable history, current authority checks, and request deadlines remain unchanged.
The original retry case now also checks unchanged snapshots after each changed body, correlation, and unauthorized request.
Current migration 0164 SHA256 is `30f0234479436347556ceb36b4bd37592900bcff06442d7b13f6d2f9f5147a79`.
Current full Auth test SHA256 is `663ba69e8e8b23cf1c2c0f0492e91d285854704e8af189b544ed587e6c234a19`.

Review also found that SQL-only rehearsals published their disposable database on all interfaces.
The earlier historical run passed 20 cases and failed one in 93.48 seconds; that result is not accepted.
Its owned database, volumes, network, and listener were removed.
All rehearsals now require the existing Docker creation guard, paired CLI check, owned network, and verified `127.0.0.1` database binding.
SQL-only rehearsals do not start or claim an Auth or Storage API.
The historical comparison now checks the exact original fields and all three additive defaults.
It also checks complete post-migration rows, audits, and receipts after original command retries.
The original 21 case names and deadlines remain unchanged.

Ten reviewed files were copied after all 29 input guards matched.
Full `npm run type-check`, full `npm run lint`, and the 123-file integration matrix passed after integration.
The isolation draft passed 148 focused checks; the invoice draft passed strict types and focused lint.
The browser draft passed 14 unit checks, strict types, and focused lint.
The fresh historical suite passed all 21 cases in 111.01 seconds; its runner passed in 121.079 seconds.
Actual inspection proved one owned database on `127.0.0.1:39216`, its exact loopback network, and no API service.
All 1,520 source files, 39 dependency metadata records, and ten reviewed file hashes stayed unchanged.
Owned containers, volumes, network, and the checked listener were absent after cleanup.
The observer retained one exact missing-container error and a successful scoped absence confirmation during removal.
An earlier repeat passed 21 tests but failed its observer; that unaccepted result remains preserved.
The [accepted result](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/legacy-invoice-loopback-166-verified-capture-2026-10-03/run-observer-retry-result.json) records these limits.
Its log SHA256 is `934cd05c6fd48f7fee8ec62302be15abdf2a042e9b895147781452d496eee01d`.
This proves the historical SQL file; signed Auth, HTTP, browser, and full integration acceptance remain separate.
Fresh corrected signed database, HTTP, rendered browser, saved-file, and cleanup acceptance remain required.
The [integration receipt](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/reviewed-invoice-repairs-root-integration.json) records exact source hashes.
The current source scan checked 1,711 tracked and untracked text files without finding high-confidence credential matches.
Private environment files were excluded; the scan does not prove that all secrets are absent.

## Risks and recovery

Main risks are crossed sources, stale review, duplicate invoices, private original exposure, and forged immutable receipts.
Keep new entry points unavailable for real use until required disposable acceptance passes.
Recovery disables the affected entry points and applies a reviewed forward correction.
Preserve invoices, originals, approvals, receipts, and history.
Do not restore caller-defined finance approval or delete ledger history.
Cloud migration, real access grants, external invoices, provider activation, and production release require separate approval.
