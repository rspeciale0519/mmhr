# Customer saved requirement view

Updated: 2026-09-08. Status: implemented locally; not verified for release.

## Scope and evidence map

The full active goal and its execution supplement need no changes.
This package connects the existing active requirement reader to the customer detail page.
It supports the read portions of FR-INT-02 and FR-EVL-04. Neither requirement is complete.

| Requirement portion | Connected behavior | Required evidence |
| --- | --- | --- |
| Resume saved requirements | Detail page reads active structured requirements and custom requests | Page, renderer, adapter and real database tests |
| Preserve saved answers | Semantic text output retains null, false, zero, whitespace and nested values | Renderer tests and authenticated browser checks |
| Browse bounded results | Requirement cursor stays within the selected intake; default page size remains 25 | Navigation, malformed query and database isolation tests |
| Deny unavailable access | Either read failure hides the entire detail view | Page error tests and live permission-revocation checks |

Customer writes, archived review, ownership, evidence and provider response links remain outside this read view.
Provider recommendations, full customization workflows and registration wiring remain unfinished.
No new dependency, migration, permission or write operation is added by this package.

## Authorization and recovery

The page requires customer portal access before parsing navigation or reading records.
Both adapters use the selected organization and its request-scoped Supabase client.
The intake read must succeed before the requirement read starts.
Each adapter repeats its live workspace permission check. SQL and RLS controls remain required.

`requirementsAfter` is valid only with `intake`. The list cursor `after` cannot accompany a detail request.
Invalid, empty, repeated and ambiguous query values fail before any read.
Unknown query fields cannot change scope, actor, page size or permissions.
Links contain only validated intake and requirement cursor IDs.

Known read and authorization failures show one generic notice without partial saved details.
Unexpected defects still propagate. Saved text cannot create HTML, scripts or external links.
Ownership, evidence, vendor references and private actor fields are not rendered.

The main risk is cross-organization disclosure or retained details after access denial.
Recover through a forward change that removes this read wiring.
Preserve saved records, audit history and database restrictions. Do not grant raw table access.

## Interface review

Mode: full. Scope: customer page composition, requirement view, pagination and saved-answer rendering.
The frontend skills preserve the existing neutral worksheet, Geist type and semantic Tailwind tokens.
The reference palette remains white #ffffff, ink #0a0a0a, muted #737373, surface #f5f5f5 and border #e5e5e5.
Geist headings and body text retain the existing hierarchy; number values use tabular figures.
The signature element is a labeled requirement paired with its saved answer, not a new dashboard.

| Category | Review scope | Verification boundary |
| --- | --- | --- |
| Typography | Heading order, response labels, long text and number styles | Source and component checks; browser wrapping pending |
| Surfaces | Dividers, nested values, focus and minimum control height | Source checks; keyboard and touch appearance pending |
| Animations | Loading and navigation | No new animation; motion inspection not applicable |
| Icons | New renderer and links | Text labels; no icons added |
| Performance | Server rendering, bounded page reads and type-only imports | No new client state or dependency; live timing pending |

| Finding | Before | After | Reason |
| --- | --- | --- | --- |
| HIGH: missing saved requirement review | Detail view omitted all requirements | Existing scoped reader feeds a read-only section | Customers need access to their saved answers |
| MEDIUM: stale partial details after denial | A second read had no page error contract | Either known failure hides both sections | Access denial must not present a successful partial view |
| MEDIUM: missing requirement navigation | No bounded detail cursor | Separate validated requirement cursor and first-page return | More records must not escape the selected intake |

Rejected candidates: a workflow completion meter cannot prove overall progress.
Provider and evidence links need separate disclosure and document authorization.
Animated cards and client state do not improve this saved-answer review.

## Checks and verdict

Focused run 11356 passes 149 tests across eight files. Type checking and full lint also pass.
The production build passes with 67 routes in run 11356.
Full unit run 62065 passes 305 files and 3,263 tests in 280.92 seconds.
Integration inventory passes for 90 files. The secret scan passes for 1,044 tracked files.
The staged secret scan passes for 1,047 tracked files, including the new renderer and evidence files.
Independent review found no security, scope, pagination or rendering defect.
Its initial missing-test finding was stale; the reviewer inspected the new direct tests and withdrew that finding.
Parent review replaced technical empty-value text with plain labels and removed broad test-fixture casts.
The renderer's four focused tests and type check pass after those changes.
The older CI head 0011ad8 passed standard checks and disposable migration application.
Its integration suite remains running. These results do not verify this newer UI package.

The local development wrapper lacks MIGRATION_DATABASE_URL. Port 3000 belongs to a system service and was not changed.
The existing production preview on port 3007 shows the expected release block after the new build.
The built-in browser reports no console warnings or errors for that page.
No control was disabled to expose the customer route.
Authenticated desktop/mobile, keyboard, loading, error and permission-revocation browser checks remain required.

Verdict: source and component review found no remaining defect. Rendered behavior and real database access remain unverified.
This is not release approval. Keep production controls closed.
