# R3 customer comparison and initial choices

Status: implemented locally; database execution and release evidence remain open.
Date: 2026-09-09.

## Requirement and decisions

This package continues FR-INT-03, FR-INT-04, FR-MAT-01 through FR-MAT-04, and FR-MAT-06.
The approved journey and `.codex/plans/goal-full-project-completion.md` remain authoritative.
The full goal and supplement needed no changes after review.

| Requirement | Current evidence | Remaining evidence |
| --- | --- | --- |
| FR-INT-03 | Published comparison read, guarded page, adapter tests, and isolated browser checks. | Executed database and authenticated journey checks. |
| FR-INT-04 | Atomic one-to-five initial choices, lifetime count, confirmation, replay, and regression tests. | Executed concurrency and connected staff review. |
| FR-MAT-01 through FR-MAT-04 | Existing immutable approved calculations feed the complete masked list. Scores remain independent of selection and payments. | Executed publication and selection integration checks. |
| FR-MAT-06 | Each selection records the exact publication and input digest. | Executed stale-publication and recovery checks. |

Customers can view all published options through protected pagination.
The display has no five-option limit. Customers can save one to five new initial choices in each request.
The total initial allowance is five per intake, including archived choices and earlier legacy choices.
Multiple requests can use the remaining allowance while the intake remains submitted.
Later reviewed additions remain a separate existing workflow.

Customers can select options with eligible, ineligible, or unknown results for MMHR review.
The interface explains these results. It does not hide an option because its evidence is incomplete.
Option numbers identify immutable publication positions, not rank.
New candidates start in the proposed state. Saving choices does not contact providers or send an RFP.

## Data and authority

Additive migrations 0118 through 0121 provide the following boundaries:

| Migration | Purpose |
| --- | --- |
| 0118 | Add organization-scoped `evaluation.select` authority and versioned default role grants. |
| 0119 | Add private selection batches and scoped option-to-candidate links with immutable history. |
| 0120 | Add audited selection, exact replay, and masked historical reads. |
| 0121 | Discover the current published comparison without a client-supplied publication identifier. |

Selection requires exact organization permission and customer portal access at AAL1 or stronger.
The server derives identity from the verified request. The page derives organization scope from the portal guard.
The database serializes protected commands through the existing security authority guard row lock.
It also locks the intake before it checks the submitted stage and lifetime allowance.
Each new request must match the current publication, input digest, and exact opaque option identifiers.
Duplicate options, existing products, stale evidence, withdrawn publications, and cross-organization references fail before writes.
Candidate records, masks, batch links, audit events, and command receipts succeed or fail together.

The new tables deny direct runtime access through RLS and grants.
Append-only triggers prevent updates, deletes, and truncation.
Public responses omit provider names, product identifiers, and private evidence snapshots.
Historical reads retain masked labels and do not require a currently fresh publication.
Exact replay checks current authority but does not require the original publication to remain current.
Runtime Drizzle registration includes both publication and selection schemas.

## Connected interface

The saved intake links to `/customer/evaluation?intake=...`.
The guarded page loads the intake, selection history, and current publication with request-scoped Supabase access.
It retains saved-choice history when the current comparison is unavailable.
The client shows scores, evidence coverage, reasons, limitations, evidence dates, and selection controls.
Page responses must match the publication, digest, sequence, scope, correlation, and consecutive option positions.
A failed or inconsistent next page disables new choices until reload.

Saving requires an explicit review checkbox. Controls remain disabled during the request.
An uncertain result preserves the exact payload, correlation identifier, and idempotency key for a manual retry.
A confirmed result refreshes server data. A reload link remains available if refresh fails.
No provider name disclosure, representative contact, or RFP submission occurs in this package.

## Risks and recovery

Main risks are provider identity disclosure, stale comparisons, cross-organization access, duplicate choices, and incorrect lifetime counts.
Review and rehearse 0118 through 0121 in order before any cloud deployment.
Keep the older application interfaces available during rollout.
Contain a defect by disabling the new route or revoking selection authority or the affected publication.
Retain all candidate records, publication snapshots, role history, receipts, and audit records.
Use a reviewed forward correction. Do not delete immutable records to recover.
Database concurrency, populated compatibility, and recovery rehearsal remain unverified for this package.

## Checks

- Full unit run 6311 passes 344 files and 3,911 tests in 364.81 seconds.
- Type check, full lint, and build run 89522 pass. The build contains 68 routes.
- The integration inventory includes 99 test files.
- Final focused run 93156 passes 148 tests. Its type check and fixture lint also pass.
- The secret scan passes all 1,156 tracked and staged files.
- The R9 manifest validates its structure but still reports open release evidence. This is not release approval.
- Local selection integration failed during setup because Docker configuration and pipe access were denied.
- That attempt skipped all seven then-current tests. The expanded selection fixture now contains eight tests.
- Selection and publication fixtures collect 13 tests together. Current-publication discovery adds six tests.
- Final fixture type checking, lint, and migration static checks pass after review corrections.
- GitHub CI34330596999 at `5d428ea` passed standard checks and applied migrations through 0117.
- That run passed 903 of 906 integration tests across 97 files. All five publication cases passed, including concurrency and calculation parity.
- Three failures came from outdated empty-migration expectations and the missing fixture administrator. Both causes are corrected locally.
- Empty-migration expectations now match the cumulative role versions and audit counts through 0121. Its 11 tests collect; type check and lint pass.
- No execution of migrations 0118 through 0121, staging migration, production migration, merge, or release is claimed.

Review corrected nonconsecutive selection ordinals, legacy allowance counts, scoped foreign-key order, and runtime schema registration.
Review also corrected malformed JSON inspection order, fixture RPC signatures, audit text comparisons, and overwritten correlation assertions.
The audit rollback fixture now injects an audit insertion failure after candidate writes.
Viewer denial uses a fresh valid publication. A separate test checks an intake outside the submitted stage.
The concurrency fixture uses two transactions and waits on the actual global guard lock.
These fixtures provide planned coverage, not executed database evidence.

## Interface review and browser limits

The frontend and interface review skills kept the existing neutral portal design and semantic color tokens.
They produced a comparison list with aligned numeric measures, explicit limitations, and inline confirmation.
The browser skill used the in-app browser against an isolated preview of the actual component and shared customer frame.
The preview used test responses, no database, and Arial fallback instead of the production Geist font.
The application server on port 3000 did not respond. Its process was not identified, stopped, or replaced.

| Review area | Result and scope |
| --- | --- |
| Layout and hierarchy | Desktop, 375-pixel mobile, and 768-pixel tablet views inspected. No horizontal overflow in DOM measurements. |
| Typography | Existing scale retained. Balanced headings, readable line spacing, and tabular counts inspected. Production font remains unverified in browser. |
| Surfaces and color | Existing neutral tokens, separators, selected borders, and alert treatment retained. No decorative panel redesign. |
| Interaction and motion | Keyboard confirmation, visible focus, 44-pixel controls, disabled pending states, unchanged retry, and success inspected. No custom motion. |
| Content and states | All six test options, supporting details, pagination failure, uncertain save, confirmed save, read-only, and empty states inspected. |

The browser reported no warning or error logs in the tested preview.
Unit tests cover rejection, uncertain-then-rejected retry, exact retry data, malformed pages, full allowance, and unavailable secure request identifiers.
Authenticated route behavior, real network failures, production fonts, and full accessibility conformance still need integrated browser evidence.

Rejected changes: a modal confirmation would add focus management without benefit here.
A sticky action bar would cover comparison content on small screens.
Animated score counters would distract from evidence and imply more precision than the records support.
Verdict: the isolated interface checks pass within the stated scope. They do not prove a live end-to-end customer journey.

## Remaining work

Run the new database and concurrency tests successfully in GitHub before merge.
Connect staff review, duplicate-product handling, commercial conflict disclosure, approved name disclosure, and the RFP workflow.
Complete remaining R0 through R9 evidence and verify staging before production.
The full goal remains active.
