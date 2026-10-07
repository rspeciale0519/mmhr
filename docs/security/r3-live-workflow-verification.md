# Local customer workflow verification

Date: September 13, 2026.

This record separates real application checks from component previews.
All test records are synthetic. No external messages or production changes occurred.

| Step | Evidence | Result |
|---|---|---|
| Customer opens private workspace | Native browser with a real local Supabase session | Passed |
| Customer saves intake | Application form and persisted intake detail | Passed |
| Customer adds payroll requirement | Application form and persisted requirement card | Passed after session renewal |
| Customer submits intake | Application confirmation and submitted revision 2 | Passed |
| Staff reviews the submitted intake | Native browser with repaired local test login | Passed |
| Staff reviews more than 50 comparison options | Real component with synthetic responses in native browser | Passed; publication stays disabled before the last page |
| Comparison page fails and retries | Same component preview | Passed; reviewed count survives, and publication stays unavailable during failure |
| Provider disclosure and RFP delivery | Disposable database integration suite | Four tests passed, including staff self-approval and vendor scope |
| Staff publishes comparison | Real application in native browser | Passed; 24 local options |
| Customer chooses options | Real application in native browser | Passed; sixth choice disabled at five selections, then one choice saved |
| Staff records provider disclosure | Real application in native browser | Passed |
| Staff creates and approves own RFP | Real application in native browser | Passed with separate approval off |
| Staff delivers approved RFP | Real application in native browser | Passed; one selected vendor portal |
| Vendor reads delivered RFP | Real application in native browser | Passed; full content and deadline |
| Customer reads disclosed provider and delivered RFP | Real application in native browser | Passed |
| Authenticated saved-intake-to-vendor journey | Real local sessions and application forms | Passed |
| Customer signup and email verification | Not exercised in this browser run | Remains open |

## Corrections

The local fixture now uses the existing paired administrator bootstrap commands.
It verifies real MFA claims and administrator capacity.
Six incomplete synthetic platform assignments were revoked during setup.
Their records remain available.
Four legacy test workspaces were suspended because they still require migration review.
Their review flags and records remain unchanged.

The launcher now tracks cookie writes during each response.
This lets Supabase remove a smaller basic-session cookie when MFA creates multiple token chunks.
Two regression tests cover chunk replacement and removal.
No application authentication rule was weakened.

Submitted staff reviews now load all requirements, up to the comparison limit of 2,000.
The loader rejects partial results after an error and repeated keys across pages.
The comparison review advances through every options page before enabling publication.
Five focused tests cover these changes.

Migration 0132 filters unsupported legacy candidates before applying the disclosure page limit.
Its database regression test passes.
Local migrations through 0132 applied successfully.
Recovery uses a forward correction while preserving disclosure and audit records.

## Completed access repair

Automatic approval review rejected removal of generated MFA factors from the two synthetic staff accounts.
The user then explicitly approved this repair.
The fixture ran with `MMHR_LOCAL_FIXTURE_ROTATE_MFA=1` and the saved synthetic intake.
It replaced the generated staff factors and immediately enrolled and verified new factors.
Staff browser access succeeded with the corrected cookie handling.
The repair affected only local synthetic accounts.
The current launcher retains its generated credentials in memory while it runs.

## MVP usability and startup

Customer comparisons now show saved requirement labels instead of generated keys.
Staff intake links and requirement pagination remain in the staff workspace.
The RFP page has one main heading and shows a clear delivery status.
Vendor navigation provides a path back to the workspace.
The native browser verified the updated pages, including a phone-width comparison without horizontal overflow.

`npm run dev:local` reads the configured local Supabase settings and uses the existing development worker wrapper.
It detects an occupied application port and leaves the existing process unchanged.
See [MVP local operation](../mvp-local-operation.md) for startup and pilot scope.

## Validation

- Complete unit suite: 353 files and 3,968 tests passed.
- Initial MVP checks: 119 tests passed.
- Final navigation, requirement failure, and inventory checks: 33 tests passed.
- Disclosure and delivery integration: four tests passed.
- Account setup integration: ten tests passed.
- Customer registration integration: 39 tests passed.
- Authorization inventory: all 202 entries matched the source and matrix.
- Integration inventory: all 100 test files listed.
- Type checking, full lint, and the final production build passed with 70 routes.
- Secret scans passed for 1,156 tracked files and 30 new source/document files.
- The real browser checks had no captured warning or error logs.
- Local startup detected the occupied port and preserved the running server.

The final source review checked incomplete requirement reads, staff navigation, local endpoint validation, and preserved scoring inputs.
The changes add no database migration or production configuration change.
The old unit session was unavailable when work resumed; the new complete run provides the current result.

The first requirement save returned an uncertain error and saved no requirement.
After session renewal, the same form completed successfully.
The exact cause of that first transient failure is not established.
Temporary diagnostic logging was removed.
