# Customer submission confirmation

Status: implemented; local standard gates, isolated browser checks and focused checks pass.
Real browser-to-database submission and production readiness remain unverified. Full migration 0110 verification remains open after a failed integration run.

## Scope and authority

This screen connects the [submission command](r3-customer-intake-submit.md) to the saved customer intake.
It advances FR-INT-02 in [PRD](../PRD.md); it does not complete the evaluation or RFP workflow.
The server page requires separate `intake.submit` authority for the current portal identity and selected organization.
Draft-save authority cannot substitute for submission authority.
The control appears only on a saved detail view, for draft or in-progress status and a revision below the integer maximum.
It does not appear on intake or requirement edit screens.
The page passes only the authorized organization, stored intake ID and stored revision.
Query parameters cannot supply actor or organization authority.
The server command remains authoritative if status, access or saved requirements change after rendering.

## Confirmation and uncertain results

Review opens an inline confirmation section. Its checkbox starts unchecked.
The text states that submission uses all current saved answers and active requirements.
This includes other requirement pages and recent teammate changes.
The view does not infer eligibility from one paginated requirement page.
The text explains the minimum required requirement and the end of customer editing.
Submission does not send an RFP, contact providers or create an assessment.

Secure request identifiers are created only after confirmation.
The mutation uses `retry: false`, a pending control lock and a synchronous duplicate-request guard.
Known first rejection codes require a fresh review through a fixed local intake link.
An unknown or internal error keeps the exact input object for an explicit retry.
A later rejection cannot erase uncertainty about the first request.
Raw server and transport errors never appear in the screen.
Confirmed state is set before navigation; navigation failure cannot undo it.
A replay can return a later lifecycle status, so success text directs the customer to inspect current status.

## Risk and recovery

The main risks are stale saved state, duplicate submission and authority changes.
Explicit saved-state wording, immutable server evidence, current authorization and exact retry receipts limit those risks.
The checkbox is user confirmation, not an authorization or database lock.
Deploy migration 0110 before exposing the connected code.
Recovery removes this page wiring through a reviewed forward change or revokes the new RPC.
Keep submitted records, history, audit events and receipts.
This package adds no migration, dependency, shared style or permission key.

## Verification

CI34318285955 at `4abfe42` applied migration0110 and passed standard checks.
Integration passed91 files and889 tests; two files and four cases failed.
One assertion retained the old35-key permission count instead of36.
One timestamp assertion required a JavaScript Date while the database returned a string.
Two denial cases attempted requirement saving after revoking the caller's authority.
The fixtures now check36 complete definitions, database timestamp bounds, and valid saved data before revocation.
They retain exact metadata comparison, denial codes and zero submission history, audit and receipt assertions.
Independent review found no weakened security check. A new CI run must verify these corrections.

- `npm test -- src/app/(app)/customer src/server/auth/entry-point-inventory.test.ts`: 10 files, 188 tests pass.
- Extended submission component tests: 17 pass, including all four rejection codes, spoofed error data and a later replay status.
- `npm run type-check` and `npm run lint`: pass.
- `npm run build`: pass, 67 routes. Existing Sentry and middleware deprecation warnings remain.
- `npm run check:integration-matrix`: pass, 93 files.
- `git diff --check`: pass.
- Full unit run 93856: 324 files and 3,638 tests pass in 468.31 seconds.
- Three additional navigation cases were added during that run. Final component/navigation run 35183 passes all 38 cases.
- Final test-file type checking and focused lint 4087 pass.
- Final full run 63111 passes all 324 files and 3,641 tests in 546.59 seconds at source commit `4abfe42`.
- Independent page review found no material defect. Main review traced the component input and error paths to the existing command.

The built-in browser tested the actual component and shared customer frame through a loopback preview at port 3015.
The preview replaces transport and navigation with explicit test adapters and uses no real customer data.
Observed states: initial review, unchecked confirmation, cancel, keyboard checkbox and focus, disabled pending controls, success,
first rejection, unknown failure, unchanged retry success, uncertainty after a later rejection, and confirmed state after navigation failure.
Desktop, 375-pixel mobile and 768-pixel tablet layouts were inspected.
Mobile and tablet layouts had no horizontal overflow; tested buttons and links were at least 44 pixels high.
The mobile checkbox label measured 48 pixels high. Keyboard submission focus had a visible three-pixel ring.
The browser returned no warning or error logs during these checks. The tab remains open and its viewport is restored.
The preview uses Arial fallback; actual Geist rendering and authenticated route composition remain unverified.
Mock transport does not prove real request delivery, authorization, database persistence or refreshed server state.
The existing application preview remains subject to the release block; this test does not bypass it.

Both submission commits are pushed. Earlier CI34315077521 at `ab1ec96` passed 92 files and 871 integration tests.
New CI34318285955 at `4abfe42` is running and includes submission migration 0110 for the first time.
The earlier database pass does not prove the new submission boundary. No merge, cloud migration or release occurred.

## Interface review

Mode: full. Scope: the new submission section and its states within the existing customer frame.
Framework: Next.js and React; existing Tailwind semantic tokens, worksheet layout and product type system.
The interface skills kept the change within the existing portal design and required visible status and usable control sizes.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Component copy, heading hierarchy, browser desktop/mobile/tablet wrapping | Clear; production font rendering unverified |
| Surfaces | Confirmation boundary, status divider, control measurements and keyboard focus | Clear |
| Animations | Component has no staged animation; state changes use text and disabled controls | Clear; no animation needs slow replay |
| Icons | No new icons or image assets | Clear |
| Performance | Existing shared button, explicit color transition, no new dependency or continuous effect | Clear within component scope; production performance unverified |

No actionable interface-polish findings remain.

| Location | Candidate | Rejected because |
| --- | --- | --- |
| Submission confirmation | Modal overlay | Inline review retains saved-intake context and avoids a new focus-trap surface |
| Submission controls | Animated state transitions | Immediate text and disabled controls communicate this routine operation without motion |

Verdict: Approve for the inspected component. Live identity, database, actual font rendering and production performance remain unverified.
