# Customer requirement form

Status: local implementation and component verification complete. Remote and live workflow verification remain open.

## Scope and product trace

This package connects the customer requirement writer to the saved intake page.
It advances FR-INT-01, FR-INT-02 and FR-EVL-04 in the [product requirements](../PRD.md).
Customers can create or revise one requirement in a draft or in-progress intake.
They can set its label, importance, review weight, kind and answer.
The server still controls identity, membership, ownership, evidence links and vendor response links.
Those collaboration fields do not appear as customer-editable inputs.

The screen keeps the existing portal type, color and spacing system.
It uses a single worksheet with explicit labels, visible focus and touch-sized controls.
New answers can be text, numbers, yes/no values or no answer.
Existing nested answers remain unchanged by default and display as escaped fields and lists.
Replacing a nested answer is an explicit action. The customer can undo that choice before saving.
This screen does not provide a general nested-data builder or collaborative ownership editor.
Those remaining workflow requirements stay open; they are not replaced by this package.

## Navigation and authority

`/customer?intake=<id>&newRequirement=1` opens a new requirement form.
`/customer?intake=<id>&editRequirement=<id>` opens an existing requirement on the current saved-requirements page.
The edit link retains `requirementsAfter` when the requirement is on a later page.
The new form excludes cursors. Conflicting create, edit, intake and cursor parameters are rejected.
An edit target must be present in the bounded, authorized page result. The page never scans other pages to find it.

The page always starts with the current customer portal guard.
The selected organization and request client come from that authorization, not query parameters.
`intake.requirement.save` controls requirement forms separately from `intake.draft.save`.
Each action result must match the portal identity and organization.
The parent intake must still be editable before form rendering.
The mutation repeats its own current action, portal, session, lifecycle and revision checks.
Read or authorization errors do not reveal an earlier partially loaded record.

## Save behavior and risks

New requirements use secure browser UUIDs and an automatically generated stable key.
Edits preserve the stored requirement identifier, stable key and expected revision.
The browser sends no actor, owner, evidence or vendor-link fields.
The full request and retry identifiers stay unchanged after an uncertain save result.
Pending and uncertain states freeze editing to prevent duplicate or conflicting saves.
An initial server validation rejection preserves inputs and permits correction with new request identifiers.
An initial access, lifecycle or revision rejection offers a return to the current requirements list.
Only actual tRPC client errors receive this treatment. Arbitrary error objects cannot unlock the form.
A rejection after an earlier uncertain result cannot prove that earlier save failed.
That sequence keeps the unchanged request locked and warns that the save may have succeeded.
Confirmation replaces the form before navigation. Navigation failure does not make a confirmed write uncertain.
Successful navigation refreshes the list; a fixed local return link remains available if navigation fails.

The main risks are stale writes, duplicate creates, lost saved answers and wrong-workspace edits.
The [reviewed backend](r3-customer-requirement-save.md) retains database enforcement and immutable history.
The browser validates supported input bounds before sending a request. It does not replace server validation.
Recovery removes the form wiring without deleting records, history, audit or retry receipts.
No new migration, dependency, RLS change or permission default is required by this screen package.

## Verification

The page, view, form and navigation checks passed 138 tests before the final rejection tests were added.
The final form suite passes 26 tests, including deterministic rejection and uncertainty across retries.
Independent page, navigation and final form review found no remaining security or scope defect.
Type checking, full lint and final production build8792 pass. The build generates 67 routes.
Full unit62343 passes 319 files and 3,542 tests in 372.32 seconds.
The final wording correction also passes all 26 focused form tests and focused lint.
CI34312014214 tests the previously pushed backend at `04cf396`; it does not include this screen package.
Actual authenticated browser save/reload, staging and production evidence remain open.

## Interface review

Full review covers the customer requirement form, its page wiring and saved-requirement action links.
The implementation uses Next.js, React and the existing Tailwind portal tokens.
The isolated browser uses the actual form and shared styles with synthetic mutation and navigation responses.
It uses an Arial fallback, so it does not verify production font loading or authenticated server behavior.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Form labels, validation, saved fields and revision text at desktop, 375px and 768px | Clear; production font loading remains unverified |
| Surfaces | Focus rings, form boundaries, saved-answer panel and measured controls | Controls are at least 44px high; no horizontal overflow at tested widths |
| Animations | Form state changes and transition declarations | No entrance or custom motion; state feedback uses text and disabled controls |
| Icons | Form and action-link source | No new icons; no icon-state changes |
| Performance | Client imports, transition classes and build | No new dependency, broad transition or will-change hint; production performance remains unverified |

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | `src/app/(app)/customer/requirement-form.tsx` | Every server error froze the form indefinitely | Correctable first rejections permit edits; other states offer safe recovery | Failure states must explain the next action without risking duplicate writes |
| MEDIUM | `src/app/(app)/customer/requirement-form.tsx` | Nested answers appeared as raw data notation | Existing escaped fields and lists render the saved answer | Customers need readable content before choosing replacement |
| MEDIUM | `src/app/(app)/customer/requirement-form.tsx` | Successful saves did not refresh the saved list | Confirmed state precedes navigation and refresh | Save confirmation must agree with the next visible state |

| Location | Candidate | Rejected because |
| --- | --- | --- |
| Requirement form | New colors, fonts or a second styling system | The existing portal worksheet already sets the visual direction |
| Save and answer controls | Custom entrance or press animation | Frequent form actions need stable focus and direct state feedback |

The isolated browser checks pass for empty labels, missing numbers, typed answers, pending controls,
unknown failure and unchanged retry, first validation rejection and correction, first definitive rejection,
and rejection after an earlier uncertain result. Saved nested answers display correctly; replacement and restoration work.
Confirmed saves remain confirmed when the synthetic navigation operation throws.
Desktop, 375px and 768px screenshots show readable layouts without horizontal overflow.
Keyboard navigation shows a visible focus ring on the recovery link. The preview reports no warning or error logs.
The temporary viewport override is reset. The preview remains open for inspection.
These checks cannot prove live authentication, database writes, actual list refresh or production network behavior.
All local standard gates pass. No live workflow or production completion is claimed.
Verdict: interface source approved; live authenticated behavior, production fonts and production performance are not verified.
