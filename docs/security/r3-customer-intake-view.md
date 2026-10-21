# Customer intake read view

Updated: 2026-09-08. Status: implemented locally; live workflow verification remains open.

Follow-up: [customer requirement view](r3-customer-requirement-view.md) adds active requirement reads to the detail page.
The package evidence below records the earlier intake-only implementation.

## Scope and requirement evidence

The complete active goal and its 3,967-character execution supplement were reviewed.
No change was needed. This package supports FR-INT-01 and the read portion of FR-INT-02.
It does not complete either requirement or R3.

| Requirement portion | Connected code | Evidence | Remaining work |
| --- | --- | --- | --- |
| Find saved intakes | Customer page calls `getIntakesPage` with the authorized organization and request client | Page, adapter and inventory tests | Live authorized database and browser checks |
| Open saved intake details | `?intake=UUID` calls `getIntake`; view renders seven allowlisted sections | Page tests cover all sections, empty fields, false, zero, repeated values and escaped markup | Requirement and customization reads; customer editing |
| Browse more saved records | `?after=UUID` uses the adapter's bounded cursor | Page tests cover cursor links, empty pages and first-page return | Browser navigation and permission-revocation checks |
| Handle failures safely | Separate invalid-link, unavailable-read and loading states | Component tests; unexpected errors still propagate | Signed-in loading and error-state browser checks |

No new database migration, mutation, permission grant or dependency was added.
The prepared migration 0104 remains unapplied. No live persistence claim follows from mocked component tests.

## Authorization and recovery

The page calls `requirePortalPageAccess("customer")` before parsing query values or reading records.
The parent layout also retains its guard. Neither guard replaces the adapter's `workspace.access` check.
The page uses only `authorization.scope.organizationId` and `authorization.supabase`.
Query parameters cannot supply actor or organization authority.

Duplicate query values, invalid UUIDs and combined detail/cursor requests are rejected before reads.
Links carry only the validated intake ID or cursor. Private links disable prefetching.
Read failures show no raw database errors. Unexpected application defects are not silently caught.
The loading boundary contains only static text and navigation, with no private record reads.

The main risk is disclosure of another organization's intake information.
Scoped adapter checks, database authorization and response validation remain required controls.
For recovery, remove the page's read wiring through a forward code change.
Keep all saved intake records and existing database restrictions. Do not grant raw table access.

An independent read-only review found no clear authorization bypass.
Its suggested list-denial, identifier-redaction and empty-error assertions were added.
Live database checks remain required before release.

## Interface review

Mode: full. Scope: `src/app/(app)/customer/page.tsx`, `intake-views.tsx`, `loading.tsx` and their tests.
Framework: Next.js Server Components and React. Styling: existing Tailwind semantic tokens.
Boundary: source and component review; authenticated rendered states remain unverified.

Design intent: help customer team members review an existing software-needs brief.
The layout pairs saved status and time with seven clearly labeled information sections.
It does not add a progress meter, sales claims or inactive edit buttons.

The reference palette follows existing portal tokens: white `#ffffff`, ink `#0a0a0a`, primary `#171717`, muted `#737373`, surface `#f5f5f5`, border `#e5e5e5`.
Geist supplies semibold headings and regular body text. Local `ui-monospace` supplies record references without changing global font settings.
The labeled brief is the signature element. Pulse styles and gallery routes were not changed.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Heading hierarchy, field labels, time labels, long text, number and reference styles | Source checks clear; browser wrapping unverified |
| Surfaces | Structured list borders, neutral notices, focus outlines and minimum control height | Source checks clear; touch and focus appearance unverified |
| Animations | Loading view and navigation classes | No custom animation; slow-motion inspection not applicable |
| Icons | All new views | No icons added; labels provide navigation meaning |
| Performance | Server-rendered composition, type-only imports and disabled link prefetching | No new client state, animation dependency or broad transition |

### Changes and corrected findings

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | `src/app/(app)/customer/page.tsx:1` | Workspace-ready placeholder with no records | Guarded list/detail reads and honest read-only scope | Users must not mistake a shell for a finished workflow |
| MEDIUM | `src/app/(app)/customer/intake-views.tsx:51` | No saved-record navigation | Status, save time, reference, detail links and bounded pagination | Users can find and identify saved records |
| MEDIUM | `src/app/(app)/customer/intake-views.tsx:92` | No saved-field display | Seven labeled sections preserve values, including false and zero | Missing data must not replace valid answers |
| MEDIUM | `src/app/(app)/customer/intake-views.tsx:39` | No visible read-error recovery | Generic error notice and return link | Errors need a safe next action without private details |
| MEDIUM | `src/app/(app)/customer/loading.tsx:3` | No loading feedback | Static status announcement | Loading must not look like an empty successful read |
| LOW | `src/app/(app)/customer/intake-views.tsx:7` | New controls needed shared sizing and focus treatment | Minimum 44px height, underlined labels and explicit focus outlines | Controls remain discoverable and keyboard accessible |
| LOW | `src/app/(app)/customer/intake-views.tsx:74`, `:129` | Initial reference style used an unset global mono variable | Local system monospace stack | Record references use the intended utility type without a global change |

### Considered but rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| Customer header | A workflow stepper or completion percentage | This read view cannot prove overall workflow progress |
| Intake views | Import the full Pulse marketing stylesheet | Existing portal tokens fit this scope; shared marketing changes would require separate verification |
| Intake navigation | Animated cards and client-side data state | Server reads and ordinary links provide the required behavior without extra state |

### Verification and verdict

- Final focused package passed 73 tests across five files in run 11464.
- `npm run type-check` and `npm run lint` passed in run 11464.
- `npm run build` passed in run 42600 and produced 67 routes after the final font correction.
- `npm run check:integration-matrix` passed for 89 integration files. This is inventory evidence, not database execution.
- `npm run check:secrets` passed for 994 tracked files. New files also received manual review.
- `git diff --check` passed; Git reported existing line-ending warnings.
- An early test assertion incorrectly matched text across a nested `time` element. The corrected semantic assertion passes.
- The loading-boundary inventory check initially failed. Both inventory and matrix now contain the boundary.
- Lint rejected JSX inside `try/catch`. The handler now catches only data-read failures; rendering occurs afterward.
- Full unit run 20151 passed 3,153 tests and failed the old loading-inventory snapshot.
- Corrected full unit run 90113 passed all 300 files and 3,155 tests in 235.41 seconds.
- Final customer lint and type check 17548 passed after the last font correction.

`npm run dev` could not start because `MIGRATION_DATABASE_URL` is missing.
The first port check lacked permission. Port 3000 has an unidentified listener, which was not stopped.
After confirming port 3007 was free, `npm run start -- --hostname 127.0.0.1 --port 3007` started the local production preview.
The built-in browser showed the expected release-block page at `/customer`, with no console warnings or errors.
This verifies only the release block. It does not verify the customer page or an authentication redirect.
No release or authentication control was disabled.

Verdict: Approve for source-level interface polish; no actionable source findings remain.
Not verified: authenticated desktop/mobile views, keyboard and touch interactions, loading transitions, permission revocation and real database reads.
Release remains blocked. Customer writes, registration wiring, requirement/customization reads and the complete connected journey remain unfinished.
