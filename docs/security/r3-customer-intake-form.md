# Customer intake form

Status: implementation and verification in progress. This does not approve a release.

## Scope and access

The customer page supports new intake drafts and changes to draft or in-progress answers.
It uses the selected workspace, not an organization supplied in the page link.
The page checks `intake.draft.save` with the current request client before showing either form.
The permission result must match the portal guard's identity and organization.
Edit mode also requires a successful scoped intake read and an editable status.
Ambiguous new, edit and pagination links fail before any record read.

The form calls the [customer draft save operation](r3-customer-draft-save.md).
The server and database repeat permission checks; hidden controls do not grant authority.
The form cannot submit an intake, change requirements, reveal providers or send an RFP.
Those connected workflow steps remain open.

## Save behavior and recovery

The seven answer sections use explicit save controls.
No background save starts while the customer edits a field.
New intakes use revision zero. Existing intakes use the last read revision.
The database rejects stale changes instead of replacing newer answers.

The form preserves omitted sections and existing scalar types before server validation.
Existing server write rules still normalize text and enforce size limits.
Blank numbers and duplicate labels fail before a request starts.
Text answers support multiple lines. Yes-or-no answers use explicit choices.

Pending saves disable editing and repeated clicks.
An unconfirmed request keeps its original answers and retry identifiers in memory.
Retry sends the same request, without changing its identifiers or expected revision.
The form does not suggest reloading an unconfirmed new draft.
Leaving the page loses the local unsaved form state; it does not cancel a committed database save.

A confirmed result replaces the editor with a safe saved-intake link.
Navigation failure cannot turn a confirmed save into an unconfirmed save.
The next page reads the current record, including later revisions returned by a replay.
No private failure details appear in the form.

For containment, remove the new/edit links and disable the draft command through a reviewed forward change.
Keep all saved records, revisions, audit events and retry receipts.

## Interface review

Mode: full. Scope: the customer intake form and its new/edit page controls.
The implementation uses React and the existing Tailwind and shared component styles.
The interface skills kept the existing neutral palette, worksheet layout and clear control labels.
They did not add fonts, icons, images, dependencies or a second styling system.

| Category | Evidence inspected | Result |
|---|---|---|
| Typography | Form headings, help text, labels and revision text; desktop and narrow preview screenshots | Existing type hierarchy retained; final production font check remains open |
| Surfaces | Input, select, textarea, button and link layout; 375px and 768px preview checks | Final multiline layout has no horizontal overflow; all inspected controls have at least 44px height |
| Animations | Shared button styles and form state changes | No custom motion; form buttons use specific color transitions |
| Icons | Form source and preview | No icons; text identifies every action |
| Performance | Source and synthetic pending/retry interactions | No polling, autosave loop or new dependency; live performance remains open |

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| HIGH | `src/app/(app)/customer/intake-form.tsx:187` | A successful save still displayed retry controls | Confirmed-save view with fixed links | Clear state prevents duplicate or misleading save actions |
| HIGH | `src/app/(app)/customer/intake-form.tsx:204` | Reload discarded unknown create request identifiers | Retain the unchanged retry and remove reload advice | An uncertain result must not imply the original save failed |
| MEDIUM | `src/app/(app)/customer/intake-form.tsx:108` and `:121` | Free-text boolean values and placeholder-only rows | Explicit Yes/No choices and visible field labels | Labels and explicit choices reduce input mistakes |
| MEDIUM | `src/app/(app)/customer/intake-form.tsx:126` | Four columns inside a narrow answer area | Two columns on wider screens and stacked fields on small screens | Readable controls fit the available width |
| MEDIUM | `src/app/(app)/customer/intake-form.tsx:128` | Single-line controls for long answers | Multiline text controls | Customers can review and edit long answers |
| LOW | `src/app/(app)/customer/intake-form.tsx:47` | Inherited transition-all | Color-only transition override | Limit unrelated animation during frequent actions |
| LOW | `src/app/(app)/customer/intake-form.tsx:126` map rows | Label aligned to the bottom of a multiline answer | Labels align at the top; Remove aligns with its row | Keep related field labels in a clear reading order |

| Location | Candidate | Rejected because |
|---|---|---|
| Form shell | New card layers and shadows | Existing section dividers already show the worksheet structure |
| Form headings | New display font | The current workspace type system provides a consistent hierarchy |
| Save state | Animated entrance or decorative status icons | Static text and disabled controls communicate the state directly |

## Verification boundary

The first page check passed 65 tests. The synchronized authorization inventory passed 4 tests.
An initial inventory test failed because its documentation row still described read-only access; that row was corrected.
The final focused form check passes 14 cases, including blank numbers, literal map keys and multiline values.
Type checking, full lint and the 67-route build pass. Full unit run 58223 passes 314 files and 3,423 tests.
Final style checks pass focused lint and all 14 form tests. Build 23727 passes all 67 routes after the alignment correction.
The integration inventory contains 91 files, and the diff whitespace check passes.

The built-in browser used an isolated local preview with the real form and shared styles.
Its request and navigation responses were synthetic. It used a fallback font, not the production font assets.
The preview showed empty and resumed forms, disabled pending controls, confirmed save links, an unconfirmed result and successful retry.
The inspected 375px and 768px layouts had no horizontal overflow. Control heights were at least 44px.
The inspected browser warning/error log was empty. This is not evidence of a real database request or application network behavior.
The final browser pass checks multiline editing, top-aligned labels, visible focus, pending controls and confirmed save links.
It repeats the 375px and 768px overflow checks after the multiline change. The 375px controls still have at least 44px height.
Temporary viewport overrides were reset. The browser test tab remains available for later checks.

Authenticated route transitions, real saves, revoked access and restored drafts remain unverified in a live browser.
The release gate remains closed. The preview does not bypass the application gate.
The separate backend migration is under database CI at commit cd1772e.

## Independent access review

One review proposed locking portal and workspace checks together for every customer read.
The second review confirmed that the approved contract requires portal denial on the next request, not cancellation of an in-progress request.
The page repeats its portal check for every request. Fixed database reads separately enforce workspace access and organization scope.
The existing entry-point inventory declares both boundaries.
A new wrapper alone would not change the independently authorized generic workspace RPCs.
The proposed wrapper package was incomplete and was not integrated.
Its agent-authored draft files remain recoverable in session scratch, outside application inputs.
The generated migration journal was restored. No new read migration or permission weakening is included.
This decision follows the current contract; it does not claim a single security snapshot across the whole page request.

Verdict: Approve for the reviewed isolated interface. No actionable interface-polish finding remains.
The earlier focused inventory run detected the temporary unregistered read-wrapper draft.
The final full suite passes after that draft was moved outside application inputs.
Live authentication, database, network and production-font checks remain open regardless of the isolated preview result.
