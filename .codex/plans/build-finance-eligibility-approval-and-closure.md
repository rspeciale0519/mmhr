# Finance eligibility approval and closure plan

Date: October 3, 2026. Status: proposed local implementation plan; application source remains frozen during current gates.

## Outcome and boundary

Build one complete internal finance workflow from a reported signed portal contract to an approved financial closure.
Bind every calculation to approved source versions, confirmed values, and the effective vendor agreement.
Use separate people for preparation and approval.
Preserve the original contract, calculation, payment, decision, and closure history.
Verify the workflow with synthetic customer, vendor, and two distinct staff accounts before any real financial data is used.

The [PRD](../../docs/PRD.md#58-commissions-and-financial-closure) controls FR-FIN-01 through FR-FIN-08.
FR-CTR-03, FR-CTR-04, FR-DOC-01 through FR-DOC-04, FR-CRM-04, FR-CRM-05, and FR-AI-03 also apply.
FR-RPT-01 requires signed-deal reporting and contract value when known.
The [architecture document](../../docs/TECH_STACK.md) requires request-scoped authorization, immutable commercial history, private source files, and deterministic finance decisions.

This plan does not approve real source data, financial terms, payments, provider activation, hosted migrations, or live launch.
It does not classify unfinished finance requirements as complete.
No application, schema, test, inventory, package, provider, or Git change belongs to this planning task.

## Current code and source gaps

| Requirement | Actual implementation | Remaining gap |
|---|---|---|
| FR-FIN-01 | `commission_structures` stores vendor, dates, rule, currency, revision, and `source_agreement_id` | No agreement registry, approved terms version, document foreign key, or independent approval |
| FR-FIN-02 | Events have unique organization/contract and organization/idempotency keys | The contract is a caller-supplied UUID; creation does not verify the signed portal record |
| FR-FIN-03 | SQL and TypeScript use exact supported arithmetic and half-up rounding | Value, currency, date, and claimed result come from the caller; no stored reviewer or calculation approval operation |
| FR-FIN-04 | Invoice commands create, issue, and void rows; retries preserve original actions | No independent readiness workflow; owner and supporting evidence are incomplete; issue accepts draft rows without rechecking approved source calculation |
| FR-FIN-05 | Payment commands record partial/full amounts; current approval-state guards and original retries have signed Auth evidence | No confirmed expected-payment schedule, approved invoice basis, linked reversal ledger, or complete reconciliation workflow |
| FR-FIN-06 | Dispute and adjustment commands write records and change event state | The same actor supplies approval; adjustments do not change the effective calculation; terminal approval and complete history are missing |
| FR-FIN-07 | Pure code recognizes paid, voided, and written-off states; finance handoff checks selected terminal events | No stored approved deal financial closure; no check of every related eligible contract/event; handoff creation does not close a deal |
| FR-FIN-08 | Portal signing rejects a second contract on an existing deal | No connected follow-on deal journey proves later signing and a separate commission without changing old history |

Sources: [finance schema](../../src/server/db/schema/r7-finance.ts),
[commission command](../../src/server/commands/commission.ts),
[current finance RPC baseline](../../drizzle/0093_r7-finance-authorization.sql),
[contract uniqueness](../../drizzle/0091_r7_commission_contract_uniqueness.sql),
[calculation correction](../../drizzle/0155_r7_commission_calculation_receipts.sql), and
[payment/invoice correction](../../drizzle/0157_r7_payment_approval_and_retry_receipts.sql).

The [signed Auth record](../../docs/security/r7-finance-auth-2026-10-03.md) proves 35 narrow command checks.
Those checks used owner-seeded events and agreement references.
They do not prove contract eligibility or independent finance approval.

### The actual signed contract binding

Use `portal_contract_handoff_details`, not a fabricated contract UUID or a legacy won deal.
The [portal schema](../../src/server/db/schema/r6-contract-portal.ts) stores `contract_id`, `signed_at`, `contract_reference`, and `signature_recorded_by_identity_id`.
The [signing RPC](../../drizzle/0154_r6_portal_contract_handoff.sql) generates the contract ID and writes the same ID to the linked deal.
It requires an approved selection and an open deal with no prior contract.
It preserves the introduction and signed outcome history.

Eligibility must join the details, handoff, approved selection, deal, customer organization, and vendor organization.
The handoff must be signed, and the deal contract ID must match the details contract ID.
The signed date must come from that stored record.
The command must derive the parties and deal from those associations.
Legacy records without this source chain require a separate reviewed compatibility process.

The current outcome is a reported signature reference.
It has no confirmed contract value, contract currency, or approved exact-version legal source document.
Source review must establish those application facts without presenting MMHR as a legal negotiator or signature provider.

### Contract value cannot come from quote arithmetic

The [quote schema](../../src/lib/proposal-quote.ts) separates implementation, recurring, optional, and discount amounts.
It permits monthly, quarterly, annual, and contract-term periods, nullable terms, and assumptions.
These fields are proposal evidence, not a confirmed signed contract total.
Do not multiply annual quotes by a guessed term or add optional costs to invent a commission basis.

Store signed contract value and its currency when known, with the exact source document version.
Keep the total contract value distinct from any agreement-specific commissionable basis.
Store the confirmed inputs required by the actual approved agreement rule.
Unknown required commission inputs, unsupported rules, and missing commission currency must remain visible calculation blockers.
Never substitute zero for an unknown amount.

A confirmed unconditional flat fee does not require a known total contract value.
Its approved fee, commission currency, signing evidence, effective agreement, and applicable conditions must be known.
Keep the unknown contract total visible without blocking that valid flat calculation.
A flat fee with unmet value-based conditions remains blocked until those conditions are verified.
A percentage rule requires its exact approved monetary basis and currency.
The current `contract_value_rate` rule requires confirmed contract value; do not reinterpret it as an unrelated basis.
Additional basis rules require explicit support and approval rather than guessed arithmetic.

### Private source documents need a finance boundary

Current [workspace review](../../src/server/commands/workspace-document-review.ts) uses workspace access, `rfp.approve`, and platform administration permission.
The [document access implementation](../../drizzle/0156_r4_document_review_and_access.sql) permits approved originals to ordinary members of that workspace.
Its supported source is `workspace`, and its supported purposes are `review` and `approved`.
The [evidence record](../../docs/security/r4-document-review-access.md) confirms customer and vendor access to their own approved workspace files.

Do not place private commission terms in an ordinary customer or vendor attachment flow.
Add an explicit finance source class and finance-only metadata, review, and content access.
Reuse validation, quarantine, scanning, object integrity, and short session-bound access controls.
Do not reuse broad workspace download authority for financial evidence.

## Recommended material choices

These choices need implementation review before affected interfaces change.
They are recommendations for the approved completion work, not instructions to change production permissions.

| Choice | Recommended rule | Reason |
|---|---|---|
| Agreement ownership | Store vendor agreements in an MMHR internal finance workspace; reference approved versions from customer-case events | One vendor agreement can support several customer cases without exposing terms through their workspaces |
| Cross-scope authority | Derive the stored agreement workspace and check finance authority there and in the customer case | A caller-selected organization must not grant access to another organization's terms |
| Initial rules | Support the existing flat amount and percentage of a confirmed contract basis; block unsupported terms | Preserve current deterministic arithmetic without guessing agreement meaning |
| Agreement dates | Use one approved amendment chain with half-open applicability intervals for new managed versions | Resolve exactly one version at signing time; preserve prior terms and historical inclusive structures without automatic conversion |
| Unknown eligible calculation | Create one pending event when eligibility is established; block approval only for missing rule-required inputs, commission amount, or commission currency | Preserve FR-FIN-02 without fabricating amounts; a valid flat fee can retain an unknown contract total |
| Commercial versus financial status | Record commercial success from signing; store separate financial status and an immutable approved closure receipt | A signed purchase and collected MMHR commission occur at different times |
| First collection path | Require an approved issued invoice before pilot collection | Give each expected payment a verified amount, currency, terms, and due date |
| Zero commission | Require explicit confirmation and an approved zero-balance terminal decision | Do not wait for an impossible positive payment or mark an unknown amount paid |

A nonstandard agreement can remain blocked for manual review.
Manual handling does not complete its software requirement.
Real accounting destinations, scanner activation, currencies requiring conversion, and unsupported agreement rules require their own reviewed decisions.

## Proposed records and invariants

The names below describe proposed responsibilities, not existing tables or callable APIs.
Generate actual schema names and migrations only after source freeze ends and this design is reviewed.

| Proposed responsibility | Stored evidence and controls |
|---|---|
| Vendor agreement and immutable versions | Owning internal workspace, vendor, approved source document/version/hash, effective dates, supported rule, terms, currency, revision, preparer, independent decision |
| Confirmed contract commercial versions | Exact portal contract/handoff/deal binding, known or explicitly unknown contract total, its currency when known, rule-required basis, exact document/version/hash, preparer, separate approval, correction lineage |
| Commission source and calculation snapshots | One canonical event per scoped contract, agreement version, commercial version, structure version, exact inputs/result, rounding rule version, source digest, preparer, calculation revision |
| Finance decisions | Target, expected revision/digest, decision kind, actual reviewer, actual record time, reason code, reason, approved/rejected outcome, immutable receipt |
| Expected collection and payment allocation | Approved invoice, vendor, currency, due dates, expected amounts, actual received reference/date, exact payment allocation, linked reversal references |
| Terminal decisions and deal closure | Approved terminal event outcomes, reconciliation digest, full related-event set, current deal revision, preparer, different approver, immutable closed/reopened history |

Use composite scope foreign keys and current identities for all business associations.
Keep approved amounts, terms, sources, and decisions immutable.
A correction creates a new version and new review decision.
Keep actual signed dates separate from database record times.
Use explicit currency and bounded integer minor units with checked exact aggregation.
Use database-derived actors and record times; never accept caller-supplied approval identities as authority.

Keep the existing unique event-per-contract index and command receipt constraints.
Source binding must also be unique for its scoped contract and event.
Concurrent requests from different staff accounts must converge on one canonical event or reject a conflicting source version.
An exact retry returns its immutable original result after current authorization checks.
A changed body, correlation ID, idempotency ID, target, or expected source revision must fail without another write.

Legacy events with missing source evidence must remain unchanged and clearly marked for review.
Do not create approved source bindings from their state labels or bare UUIDs.
New invoices, payments, and closure must require valid source and approval records, not only `state='approved'`.
Historical exact retries can retain their proven original receipt behavior without authorizing new financial writes.

## Compatibility decisions after consumer review

Keep `commission_events` as the one canonical event record per scoped eligible contract.
Permit an unknown commission amount only while the event remains `pending_review`.
Permit an unknown contract total after flat approval when the approved rule does not require that total.
Require a known commission amount and commission currency before any calculation approval.
Add an explicit pending-case read contract instead of making every existing finance amount nullable.
Keep legacy contracts strict in [commission-contract.ts](../../src/server/finance/commission-contract.ts); they currently require a contract total for both rules.
Add managed approved calculation contracts that distinguish flat and percentage bases.
The flat contract requires the approved fee and currency; total contract value can remain unknown.
The percentage contract requires its approved monetary basis and currency.
Do not pass a managed flat event with an unknown total through the legacy event parser.
Do not invent a zero total to satisfy `calculateCommission` or `commissionEventSchema`.
Invoice and reconciliation projections require known commission money, not an irrelevant total contract value.
Preserve exact numeric validation, safe aggregation, scope checks, and approved-source checks in those projections.
Pending counts and missing-input reasons must stay separate from monetary totals.

Add database constraints and explicit amount-presence checks before arithmetic or consequential transitions.
PostgreSQL comparisons with `NULL` must not accept an invalid financial operation.
Preserve [revenue-contract.ts](../../src/server/reporting/revenue-contract.ts)'s strict numeric totals when connecting the finance reporting adapter.
Its current `signed_deal` event requires money and currency even to count the deal.
Add a separate signed-deal fact contract.
Count every stored signed deal independently of known value or commission eligibility.
Aggregate contract value only from confirmed value-and-currency records; show unknown-value counts separately.
Keep commission totals available for approved flat fees even when contract totals remain unknown.
Keep historical numeric report inputs valid; never omit an unknown-value signed deal or add a guessed zero-valued money event.

Keep the existing scoped event-to-structure foreign key.
Create an immutable customer-case structure snapshot linked to the exact approved internal agreement version.
Keep agreement identity, agreement version, structure revision, and calculation revision separate.
This avoids replacing the current association with a broad cross-organization structure reference.

### One compatible amendment rule

Use one authoritative agreement series for each vendor and supported business scope.
An independently approved amendment appends a successor version and a future cutover record to that series.
Store its predecessor version, source document version/hash, effective start, actual approval time, approver, reason, and immutable receipt.
Require explicit source evidence that the amendment replaces the predecessor from that cutover.
Do not infer replacement from a newer upload or a higher version number.

New managed applicability intervals are half-open: `effectiveFrom <= signedAt < effectiveEnd`.
The first version starts at its approved effective start.
Each approved successor starts at its cutover and ends the predecessor's applicability at that same instant.
Compute that boundary from immutable amendment history; never update the predecessor's approved terms or original stated end.
An earlier explicit expiry still ends applicability; preserve any gap until the successor starts.
The latest version ends at its explicit expiry, or remains open when none exists.
Reject zero-length intervals and cutovers outside the supported source agreement terms.

Approve amendments under a lock on the authoritative series.
Require the expected predecessor and series revision to match the latest approved successor chain.
Reject duplicate start times, branches, overlapping authoritative series, and conflicting concurrent amendments.
Each version can have only one approved successor in this initial workflow.
The cutover must follow the preceding effective start and the actual amendment approval time.
This initial workflow permits future amendments only.
Retroactive amendments require a separate reviewed correction workflow; they cannot silently recalculate existing events.

For a new eligible event, resolve the approved interval using the stored portal signing timestamp.
Require exactly one matching version; zero matches means ineligible or missing agreement evidence, and multiple matches mean blocked ambiguity.
Store the exact version, approved rule, original source hash, resolved interval, and resolution-history reference in the event snapshot.
Later approvals and financial writes validate that stored source and its original approval.
They must not require the agreement to remain the current version today.
An older signing recorded after a future amendment still resolves to the older applicable version.

Reject future reported signing timestamps in the new managed eligibility path.
Existing unusual dates remain unchanged and require source review before new financial writes.
A future amendment must not supersede an already bound event at or after its proposed cutover.
If such a historical event exists, block the amendment and require reviewed correction handling.
Keep existing event calculations, source bindings, decision records, payments, and original retry receipts unchanged.

Historical finance access must permit the exact approved original even after an amendment creates a newer document version.
Validate the original clean scan and approval history; do not require it to remain the generic current workspace document.
Preserve the current generic historical-download denial.
Historical inclusive `commission_structures.effectiveTo` semantics remain unchanged for legacy callers.
Managed source resolution uses its explicit interval contract; do not reinterpret old stored timestamps automatically.

Keep ordinary document purposes, permissions, and screens unchanged.
Add a distinct finance source class, commands, schemas, access grants, and download endpoint.
Reuse file validation, scanner leases, integrity checks, private response controls, and final authorization checks.
The scanner claim does not carry source kind; it does not need general finance authority.
Add a narrow finance capability branch to both applicable Storage policy paths.
Never permit finance capabilities to resolve through the ordinary workspace access interface.

### Critical legacy paths

The [legacy document search](../../drizzle/0083_r4_document_search.sql) searches approved clean shared versions without excluding finance source kinds.
The [managed metadata filter](../../drizzle/0152_managed_document_metadata_search.sql) replaces only `mmhr_get_workspace_documents`.
It does not replace `mmhr_search_workflow_documents`.
Explicitly exclude finance evidence from the legacy search before storing searchable finance metadata or extracted content.
Test denial even when the actor has ordinary workspace access to the internal organization.

Preserve the managed-document write denial in [migration 0145](../../drizzle/0145_managed_document_uploads.sql).
Preserve managed search-content and worker-job denial in [migration 0146](../../drizzle/0146_managed_document_boundaries.sql).
Ordinary metadata, versions, history, review, download, and Storage reads must continue to exclude finance originals.

The [current finance functions](../../drizzle/0093_r7-finance-authorization.sql) contain more approval paths than invoice and payment commands.
Dispute resolution can set an event to `approved`; adjustments and handoffs also accept the acting person as approver.
Contain all consequential legacy operations for new managed or unsupported events.
Do not let an existing state-changing function bypass separate calculation approval.
Preserve current authority checks and exact historical receipts before checking new-write eligibility.

### Targeted consumer groups

| Group | Exact paths and required review |
|---|---|
| Pending and approved rule-specific calculations | `src/server/db/schema/r7-finance.ts`, `src/server/commands/commission.ts`, `src/server/finance/commission-contract.ts`, `src/server/reporting/revenue-contract.ts`; keep unknown required commission inputs out of numeric totals |
| Consequential finance operations | `src/server/commands/invoice.ts`, `commission-payment.ts`, `dispute.ts`, `finance-adjustment.ts`, `finance-reconciliation.ts`, `finance-handoff.ts`; review all seven public finance RPCs in migration 0093 and corrections 0155/0157 |
| Exact contract source | `src/server/db/schema/r6-contract-portal.ts`, `r6-workflow.ts`, `crm-workflow.ts`, `src/server/commands/contract-handoff-portal.ts`, `deal.ts`, `src/lib/contract-handoff-portal.ts`, migration 0154 |
| Private document contracts | `src/server/db/schema/workflow-foundation.ts`, `r4-document-uploads.ts`, `r4-document-access.ts`, `src/lib/workspace-document-review.ts`, `workspace-document-upload.ts`, `workspace-documents.ts` |
| Document operations and search | `src/server/commands/document-reservations.ts`, `document-upload-preparation.ts`, `workspace-document-review.ts`, `workspace-documents.ts`, `workflow-document.ts`, `workflow-document-search.ts`, `src/server/trpc/routers/documents.ts` |
| Document byte and worker access | `src/server/integrations/documents/workspace-document-download.ts`, `supabase-document-store.ts`, `src/app/api/documents/access/route.ts`, `src/server/db/document-scan-repository.ts`, `src/server/workflows/document-scan-worker.ts`, `document-scan-sweep.ts`, migrations 0147/0149/0150/0156 |
| Authority and registration | `src/server/auth/permission-registry.ts`, `authorization.ts`, `entry-point-inventory.ts`, `src/server/db/index.ts`, `src/server/db/test/application-schema-inventory.ts`, `scripts/r1-with-local-worker.mjs`, `scripts/check-r1-integration-matrix.mjs`, `vitest.integration.config.ts` |
| Compatibility evidence | Existing R7 command, contract, migration, SQL and Auth tests; existing R4 document, scanner, Storage, search, router, route and component tests; R6 contract portal tests; empty/populated migration rehearsals |

The [portal Auth test](../../src/server/db/r6-contract-portal-auth.integration.test.ts) expects no commission event after signing without an approved agreement.
Preserve that case and add a separate signing case with an effective approved agreement.
Current commission tests use bare contract and agreement UUIDs; preserve genuine historical receipts before the new migration.
New successful writes must use the managed source workflow and separate approval.
The signed finance Auth fixture must gain actual source preparation before its new-write success cases can prove eligibility.

## Delivery phases

### Smallest complete first delivery slice

Deliver phases 1 through 3 together as one usable source and approval workflow.
An agreement table alone cannot establish eligibility or close the current approval gap.
The slice includes private evidence access, an approved agreement version, the actual signed contract binding, confirmed commercial facts, and independent calculation approval.
It includes staff screens, request-scoped commands, protected RPCs, immutable receipts, and registered integration evidence.
Unknown rule-required commission inputs remain visible pending cases rather than zero-valued approved calculations.
Approved flat fees can retain an unknown contract total.

Before exposing this slice, guard existing invoice and payment operations against missing source bindings or calculation approvals.
Preserve historical exact retries, but deny new financial writes from old unsupported state labels.
The first slice ends at an approved source-bound event.
Invoice readiness, collection, exceptions, closure, and later signing remain phases 4 through 6.
They remain required for finance completion.

### Phase 1 Private financial evidence and approved agreements

Add finance source reservation, metadata, review, and exact-version content access through existing document infrastructure.
Keep generic workspace lists, searches, history, review, download routes, and Storage capabilities unable to expose these sources.
Review every source-kind consumer, worker lease, integrity check, and restrictive Storage policy before extension.
Allow historical approved finance originals only through an explicit audited finance evidence capability.
Do not enable historical access through the generic workspace path.

Build an internal agreement register and version review screen.
Require the reviewer to inspect the exact clean original and approve the supported typed terms.
Reject self-approval, wrong vendors, missing source versions, unclean objects, stale revisions, and ambiguous effective versions.
Use the immutable successor-chain rule above for amendments and preserve old signing-time applicability.

Exit: two signed staff accounts can prepare and independently approve a synthetic effective agreement.
Customer, vendor, unauthorized staff, and stale-session requests cannot read its metadata or bytes.
Hosted scanner operation remains a real-data prerequisite, even if the synthetic scanner rehearsal passes.

### Phase 2 Confirm contract facts and create the eligible event

Add an internal source review on the existing signed portal handoff.
Capture and independently approve rule-required commercial facts and private exact-version contract evidence.
Record total contract value and its currency when known; preserve an explicit unknown total otherwise.
Display quote information only as separate comparison evidence.
Resolve the vendor agreement for the stored signing date through its approved version history.
Bind the original version permanently; future terms must not invalidate earlier signed contracts.

Create the canonical pending event when the signed contract has an effective approved agreement.
If a rule-required basis or supported calculation evidence is missing, retain a visible pending-calculation reason.
Expand current non-null amount contracts safely to represent that pending condition; do not fill missing amounts with zero.
Complete an immutable calculation snapshot when all approved inputs exist.
Derive the result on the server instead of trusting a caller's `commissionAmountMinorUnits`.

Replace or contain the old caller-defined commission creation path for new managed events.
Retain verified historical records and creation receipts without treating them as newly eligible sources.

Exit: a real synthetic portal signing creates one correctly bound event through application entry points.
Duplicate commands, concurrent different keys, forged contract IDs, foreign deals, and wrong signing dates cannot create another event.
Unknown commission amount, commission currency, or rule-required basis remains blocked for approval and financial use.
Unknown total contract value alone does not block an approved unconditional flat fee.

### Phase 3 Independent calculation approval

Add a scoped finance review queue and detail screen.
Show the approved contract facts, effective agreement version, calculation inputs, result, and current source digest.
Require a reviewer different from the calculation preparer.
Bind the decision to the exact calculation revision and source digest.
Recheck current finance authority, live AAL2 session, active organizations, and source approvals in the transaction.

Approval records the actual reviewer and moves the event from pending review to approved.
Rejection preserves the calculation and reason; correction creates a new reviewed calculation version.
Append commission history and the command receipt in the same transaction as the decision.
Protect all consequential transitions with the same audit rollback requirement.

Exit: the preparer cannot approve their own event or submit an invoice/payment before separate approval.
A different authorized person can approve unchanged sources exactly once.
Source replacement, changed facts, role revocation, expired sessions, and stale forms reject the decision without partial writes.

### Phase 4 Approved invoicing and collection

Connect the existing invoice and payment commands to an internal finance router and usable screens.
Add invoice owner, readiness review, resolved supporting document versions, and expected collection terms.
Derive amount and currency from the current approved calculation.
Require readiness approval before issue and recheck eligibility and calculation approval when issuing.
Prevent duplicate active invoicing and unsupported invoice splits instead of accepting arbitrary totals.

Record actual received amounts, dates, references, and approved allocations through the reviewed collection path.
Reject future receipts, currency conflicts, overpayment, unapproved events, and inconsistent invoice balances.
Retain migration 0157's immutable original payment and invoice retry results.
Keep payments, allocations, invoice events, and commission history traceable to their source versions.

Exit: the approved event produces one approved issued invoice, partial collection, full collection, and reconciled balances.
The event can reach paid, but the deal remains financially open until terminal approval and closure pass.
The UI handles empty, pending, stale, rejected, error, and uncertain-retry states.

### Phase 5 Approved exceptions and actual financial closure

Replace caller-approved adjustments and dispute resolution with separate proposal and approval decisions.
Do not expose the current self-approval operations as the completed workflow.
Apply approved adjustments to versioned effective totals and preserve the original calculation.
Add linked reversal allocation and approval; do not treat an unrelated `reversed` row as reversal accounting.
Preserve paid receipts and require approved reopening before a later correction affects a closed deal.

Add explicit paid, voided, and written-off terminal decisions with reasons and source reconciliation.
Paid requires confirmed settlement against the current approved receivable.
Voided requires resolved invoice and collection effects, or it must remain blocked.
Written off requires an approved residual amount and reason; a state label alone cannot clear a balance.
Keep unresolved disputes and unsupported correction cases visible and unavailable for closure.

The closure command must derive every related event and eligible contract from the stored deal.
It must reject an empty or incomplete event set, pending calculations, unapproved terminal outcomes, and open disputes.
It must verify current reconciliation, source revisions, complete payment/invoice allocations, and the expected deal revision.
Record closure preparation and approval through different people.
Write financial status, immutable closure history, audit, and receipt atomically.
Keep external finance handoff separate; the existing handoff descriptor is not the closure record.

Exit: approved paid, voided, and written-off test cases close correctly.
Any unresolved related event prevents closure, even when another event is paid.
The legacy deal command cannot bypass the new closure or reopen controls.

### Phase 6 Later signing and complete rehearsal

Add an explicit predecessor link when creating a follow-on deal.
Use the existing renewal follow-on link where its meaning applies.
Create a new selection, handoff, generated contract ID, and canonical commission event for the later purchase.
Do not overwrite the old deal's contract, RFP recipient, proposal association, commission, or closure receipt.
Use a fresh intake/proposal path until a separately verified follow-on workflow safely preserves those associations.

Run a full customer selection, staff handoff, reported signing, source review, agreement approval, calculation approval, invoice, collection, and closure journey.
Then run a later signing on a different deal and confirm that all first-deal history remains unchanged.
Customer and vendor screens must retain their appropriate contract status while financial values and terms remain internal.

Exit: ordinary role entry points and stored evidence prove the complete synthetic workflow.
Any unsupported exception or missing real-data prerequisite remains explicitly incomplete.

## Affected consumers and migration scope

| Area | Existing consumers to review before edits |
|---|---|
| Portal contract/deal identity | `schema/r6-contract-portal.ts`, `schema/r6-workflow.ts`, `schema/crm-workflow.ts`, migration 0154, `commands/contract-handoff-portal.ts`, `commands/deal.ts`, contract router, workflow components, three contract pages |
| Finance schema and rules | `schema/r7-finance.ts`, migrations 0021/0066–0071/0091/0093/0155/0157, `finance/commission-contract.ts`, commission/invoice/payment/dispute/adjustment/reconciliation/handoff commands and their tests |
| Document purpose and safety | `schema/workflow-foundation.ts`, `schema/r4-document-uploads.ts`, `schema/r4-document-access.ts`, migrations 0145–0152/0156, document reservations/preparation/review/read/search commands, document router, download route, scan repository/readers and Storage policies |
| Reporting and queue semantics | Revenue/pipeline/workflow contracts, approved operations queue contracts, deal stage history, renewal source/follow-on links, root tRPC router and internal navigation |
| Authority inventory | Permission registry, entry-point inventory, boundary tests, integration runner inventory and documented authorization matrix |

The [root router](../../src/server/trpc/root.ts) currently has no finance domain.
The pure `transitionCommissionEvent` and `canFinanciallyCloseCommission` functions have no application finance workflow consumer.
The current finance schema has no confirmed source agreement table or deal financial status.
Nullable source totals and pending commission amounts will affect schemas, validators, reporting, reconciliation, tests, and result contracts.
Search all readers before changing those interfaces; keep unknown values distinct from zero in every view.

| Interface change | Required compatibility treatment |
|---|---|
| Commission creation input | Derive contract, deal, parties, signing date, agreement version, and amounts from approved stored sources; contain the old caller-defined creation path |
| Event calculation shape | Add managed rule-specific contracts; keep known commission money strict; allow unknown contract totals for valid flat fees; preserve legacy helper inputs |
| Agreement ownership and event association | Current events require a structure in their own organization; use a managed customer-case structure snapshot that references the immutable internal agreement version |
| Document reservation and access purpose | Extend approved source-kind and access-purpose contracts narrowly; preserve existing ordinary workspace permissions and bytes denial |
| Finance approval command and result | Bind actor, target, expected revision, source digest, correlation, and idempotency; return the immutable original decision result on an authorized exact retry |
| Invoice and payment authorization | Require the managed source binding and independent approval for new writes; preserve migration 0157's historical receipt rules |
| Deal status and transitions | Add separate financial status and closure receipts; keep commercial contract status and legacy guarded transitions compatible |

Generate additive migrations after the current source freeze ends.
Add private finance source/approval records and rule-specific nullable fields before tightening new-write guards.
Contract total can remain nullable after flat approval; commission amount cannot remain nullable after any approval.
Add composite foreign keys, immutable-history guards, uniqueness rules, RLS, and explicit least-privilege execution grants.
Use checked function replacements or reviewed wrappers without restoring unsafe legacy writes.
Keep private functions non-callable by application, service, and worker roles unless their specific operation requires access.

Do not add strict historical foreign keys until existing rows have reviewed source mappings.
Use unvalidated historical constraints or new managed binding tables where required, then validate only reviewed data.
Preserve legacy amounts, receipts, audits, and contract references unchanged.
Verify empty-database migration and pre-change historical compatibility before normal local application.
Cloud migration and deployment require separate approval.

Main risks are incorrect source associations, private-term disclosure, guessed amounts, duplicate eligibility, self-approval, and premature closure.
Recovery must disable the affected entry points and apply a reviewed forward correction.
Preserve source versions and ledger history; use approved correction/reopening records for financial changes.
Do not recover by deleting history, recalculating old events silently, or restoring pending-review payment access.

## Meaningful validation

Use the existing guarded disposable harness and genuine local Auth sessions.
Do not use normal saved databases, real accounts, real financial data, or external messages during these checks.
Two distinct signed staff accounts are required in addition to customer and vendor accounts.

| Evidence | Required cases |
|---|---|
| Source and migration SQL | Actual signed portal joins; absent/foreign legacy IDs; clean approved exact document versions; supported and unsupported rules; effective-date bounds; overlapping agreements; unknown/zero values; currency mismatch; preserved historical rows and function grants |
| Eligibility and review | One event per contract under concurrent different actors/keys; exact replay; changed payload conflict; separate calculation review; self-approval denial; stale digest/revision; source amendment; rejected agreement; audit failure rollback |
| Finance ledger and closure | Invoice readiness and amount binding; duplicate active invoice; partial/full collection; overpayment; linked reversal; approved adjustment; zero commission; every-event closure; empty/incomplete closure; dispute blocking; approved residual write-off; closed-deal correction/reopening |
| Genuine signed Auth | Actual commands and public RPCs; customer/vendor/unassigned staff/anonymous denial; live AAL1 staff denial despite valid assigned authority; permission, membership, session and organization revocation; cross-workspace source access; unchanged retry after authorization loss |
| Private Storage | Quarantined/unclean/foreign bytes; hash/type/size mismatch; exact-version lease; expired capabilities; revoked session; historical finance-only access; metadata/search/history/download denial to ordinary roles |
| Browser | Customer/vendor contract visibility and finance privacy; staff source inspection; separate review accounts; readiness/invoice/payment/closure forms; uncertainty retry; stale updates; empty/loading/error/success states; narrow layout; console and available network evidence |
| Full delivery gates | Relevant unit/component tests, `npm run type-check`, `npm run lint`, `npm test`, `npm run build`, and registered complete `npm run test:integration` |

Test an approved flat fee with unknown total through invoice, payment, reconciliation, and report projections.
Test percentage approval denial for an unknown required basis.
Test flat approval denial for unknown fee, currency, or unresolved agreement conditions.
Distinguish an unknown contract total from a confirmed zero total in stored facts and reports.
Verify that signed-deal counts include unknown-value contracts without fabricating money events.

Test agreement A before cutover and agreement B exactly at cutover; never select both.
Test an older signing first recorded after B approval; it must still bind A.
Test an A event approved, invoiced, collected, and retried after B becomes effective.
Its original calculation, source version, decisions, and receipts must remain unchanged.
Test explicit expiry, an uncovered gap, and the latest open-ended interval.
Reject equal cutovers, zero-length intervals, sibling amendments, overlapping series, and stale predecessor revisions without partial writes.
Test concurrent successor approvals; exactly one can commit for the same predecessor.
Reject retroactive amendments and cutovers that would supersede an already bound event.
Reject future signing dates in managed eligibility without altering historical unusual dates.
Test exact historical finance original access after document replacement, including denied ordinary workspace access.
Verify that legacy inclusive-date helpers retain their original boundary behavior.

Replace approved-state-only fixture shortcuts with the actual approved source workflow where the new guards apply.
Keep dedicated historical fixtures before the new migration to prove safe compatibility and denial of unsupported new writes.
Do not weaken source, authority, money, audit, or time checks to make old fixtures pass.
Record actual results, loaded migration hashes, failed attempts, and cleanup evidence in dated records.
Keep modeled SQL, genuine Auth, browser, and real participant acceptance separate.

## Completion and approval points

This slice is complete only when all six phases have usable entry points and required stored evidence.
Approve each local implementation checkpoint through source review and its applicable passing checks.
Do not declare FR-FIN complete from schemas, pure functions, isolated commands, or seed-only tests.

Before real use, obtain approved vendor agreements, contract evidence, participants, source-processing operation, finance roles, and business policies.
Real approval must come from an authorized person; synthetic test accounts cannot provide it.
Provider activation, external invoices/messages, financial exports, permission changes, hosted migrations, and production release remain separately controlled actions.
No Git action follows automatically from this plan.
