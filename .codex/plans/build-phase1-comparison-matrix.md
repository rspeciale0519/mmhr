# Phase 1 comparison implementation

Date: 2026-09-15.
Status: Phase 1 implementation authorized by the active user goal.
Catalog and scoring approval remain pending in the [decision package](decision-phase1-catalog-and-scoring.md).

## Outcome

Complete MVP-01, MVP-02, and MVP-03 against the [launch checklist](release-mvp-launch-checklist.md).
Build the approved matrix in the existing customer evaluation route.
Keep later phases outside this goal.

## Work sequence

1. Prepare the catalog, evidence, and scoring decision package.
2. Build the matrix presentation using explicit unknown states while decisions are pending.
3. Add versioned publication detail contracts and database projections from approved evidence.
4. Connect staff evidence review and publication controls.
5. Populate approved records only after the required decisions and evidence reviews.
6. Verify the real staff/customer workflow and complete the phase evidence.

## Implementation constraints

Reuse current request-scoped Supabase commands, tRPC procedures, selection handling, and immutable publications.
Do not add a parallel scoring engine or return raw vendor snapshots to customers.
Keep current selection confirmation, pagination, retry, and stale-publication controls.
Preserve the current dirty worktree and existing branch.
No Git delivery is authorized by this plan.

Database changes need reviewed additive migrations and local integration evidence.
Preserve version 1 behavior and snapshots.
Record forward application order and recovery before applying migrations locally.

## UI direction

Use the approved Pulse matrix, not another design exploration.
Keep existing application fonts and semantic color tokens.
Use restrained teal accents, strong row labels, tabular numeric values, and clear selected columns.
The fixed requirement column makes horizontal comparison useful on narrow screens.
Use native table semantics, visible keyboard focus, and explicit labels for incomplete evidence.

## Verification

Run focused contract, component, command, and integration checks for changed behavior.
Then run type checking, lint, unit tests, build, integration inventory, and relevant audit/secret checks.
Verify the real application with the native browser and approved local records.
Check selection persistence, paging, empty/error/retry states, narrow layouts, masking, console, and network errors.
Record actual results and limits. Local proof does not close hosted release evidence.

## Completion record

### September 15: Published detail path

Migration `0133_r3_masked_publication_details.sql` adds an opt-in `detailsVersion: 1` read projection.
It uses the existing immutable input snapshot, stored option identity, and configuration.
It preserves current authorization, stale-input checks, pagination, stored scores, and option order.
It does not approve or publish any real vendor records.

The customer adapters request this format through the existing read procedures.
Staff publication review uses the same matrix and retains its complete-page review requirement.
Preparation excludes unanswered and inapplicable requirements, matching the publication input filter.
The strict response schema rejects additional identity fields and inconsistent feature results.
The matrix renders six delivery types, distinct match outcomes, annual recurring cost, one-time charges, and setup estimates.
Cost and setup sections include units, employee basis where relevant, modules, assumptions, exclusions, and dated evidence.
Expandable sections keep the main matrix compact. Missing values remain unknown.

The projection recognizes three reviewed vendor fact fields:

- `comparison_feature_coverage`: a JSON object mapping configured fact keys to the six controlled delivery types.
- `comparison_annual_cost`: a JSON object matching the annual estimate schema, excluding the evidence object.
- `comparison_setup`: a JSON object matching the setup estimate schema, excluding the evidence object.

Evidence dates and provenance come from approved input records, not from values supplied inside these JSON objects.
Delivery-type evidence remains separate from evidence used for the recorded match.
Only approved catalog estimates belong in the shared vendor fact store. Do not import private customer quotes there.
Conflicting estimate records or malformed controlled values reject the detailed read.
The existing source and approval workflow must review these facts before publication.
Package conditions, exact restrictions, and the proposed version 2 scoring behavior remain to be implemented.
The new delivery labels do not change version 1 scoring.

**Forward path:** Review and test migration 0133 on the local database before starting the updated application.
Apply it after 0132. Existing callers omit `detailsVersion` and retain the original response.
Run publication integration checks, current-publication discovery, and the authenticated browser workflow before accepting this path.

**Recovery:** Revert the application reader to its prior request format if the new projection fails.
Keep the additive database helpers and immutable records. Correct defective functions through a reviewed forward migration.
Correct invalid vendor evidence through approved new records and a new publication.
No record deletion, cloud migration, or production action is part of this work.

**Evidence:** Focused contracts, commands, and matrix tests passed 138 cases in session 16250; type checking passed there too.
Final focused staff, customer, migration-order, and router checks passed 49 cases in session 24120.
Type checking 83595, full lint 14014, and production build 79200 pass, including the staff matrix.
Full unit run 79839 ended with 3,996 passes and two failures from outdated request and migration-count expectations.
Both expectations are corrected and their focused checks pass. Full replacement run 38083 remains running.
Integration 42855 failed in Docker setup and skipped all seven then-collected cases.
An eighth integration case now covers delivery-type projection; it has not executed.
Migration generation succeeded after using the configured local database port, 57022. No migration was applied.
The inventory covers 100 integration files and 134 migrations. Tracked-file secret scanning passes for 1,156 files.
An additional scan passes for seven task files, including untracked source and SQL.
Native preview checks pass at 320px and 390px for compact columns and contained scrolling.
Cost assumptions, setup assumptions, and unknown evidence expand with the keyboard. Both themes render; browser warning/error logs are empty.
The preview uses synthetic data. Server 62826 remains at 60852; native tab 2 is retained with its viewport reset and light theme restored.
Docker status command 10701 ended unsuccessfully. A user request to start Docker's engine is pending.

**Separate review:** Inspected the new SQL for identity leaks, scope changes, stale records, and unintended writes.
The projection selects a stored option by publication and organization before resolving its private product snapshot.
It returns controlled estimate values and evidence dates, not vendor identifiers, source URLs, or raw evidence text.
Malformed or conflicting detail facts reject the read. Current customer reads retain the existing snapshot freshness check.
No stored score, ordinal, publication, permission, or RLS policy changes in 0133.
This source review does not replace the blocked database tests.

### Earlier presentation checks

- Catalog proposal: prepared; approval pending.
- Matrix presentation: connected to the customer route and existing selection controls; detailed publication data remains incomplete.
- Published detail contracts: implemented in the worktree; database execution and approved records remain pending.
- Staff workflow and native browser evidence: pending.
- Focused comparison, page, and publication contract checks: 63 tests pass in session 38070.
- Type checking: passes in session 57522.
- Full lint and production build: passed in sessions 52305 and 65053 before the final overflow containment class.
- Full unit tests: session 40365 passed 353 files and 3,971 tests.
- Final page and selection tests: session 52391 passed 46 tests, including staff-review requirement filtering.
- Final type check and focused lint: sessions 6767 and 30438 passed.
- Integration inventory: 100 files complete. Dependency audit: zero vulnerabilities.
- Secret scan: 1,156 tracked files passed; this result does not cover untracked files.
- Native component preview: no page overflow at 320px or 390px viewport settings; both themes inspected.
  Five choices disable the sixth; removing one enables it. Keyboard evidence expansion passes. Warning/error logs are empty.
  These checks use synthetic props, not persisted application records. Real workflow and network verification remain open.
  Preview server session 88899 uses port 60852. Native tab 2 is retained; viewport override is reset.
- Docker engine: unavailable. Docker Desktop reports running, but engine pipes are absent and status requests remain unresolved.

### September 15, 11:33: scoring format 2 checkpoint

Migration 0134 and TypeScript scoring distinguish unknown required facts from confirmed mismatches.
Format 2 uses product ID ordering; historical format 1 keeps its prior scoring and ordering.
New preparations reject commercial criteria in either format. Staff controls still use format 1 pending approval.
Focused scoring, command, migration-order, and input-capture checks pass: 88 tests across four files.
Type check 4632 and focused lint 12565 pass.
Full unit38083 ended with 3,999 passes and one migration-count failure after 0134 was generated during the run.
The corrected count of 135 passes focused verification. A fresh full suite remains required.
SQL parity and ordering tests remain unexecuted. No migration was applied.
Apply reviewed 0134 locally after 0133 and verify parity before activating format 2.
For recovery, retain format 1 and historical publications; correct SQL through a forward migration.
Catalog approval, package conditions, evidence maintenance, approved records, and real workflow checks remain open.

### September 15, 11:40: broader verification

Full lint 97267 and production build 85569 pass. The build generates 70 routes.
The integration inventory passes for 100 test files.
Full unit10165 remains running; its result is not yet known.
The latest integration attempt failed Docker setup and skipped nine cases, including the commercial-criteria rejection assertions.
Source inspection found recordVendorEvidence and approveVendorEvidence commands, but no staff tRPC or page consumers.
Connect those existing commands through authorized staff controls rather than adding a separate evidence store.
Preserve draft capture, explicit review, evidence versions, expiry, and actor-bound approval.
Package and regional conditions must be resolved before matching facts receive approval.

### September 15, 11:47: staff evidence API

The vendorEvidence router now exposes record and decide through existing evidence commands.
Both operations require organization authority and platform staff access.
The decision binds reviewer identity to the authorized account; the browser cannot supply it.
Shared record validation checks draft status and matching fact/source references.
Focused router, command, and entry-point inventory checks pass 17 tests; type33590 and focused lint78992 pass.
Full unit10165 ended with 4,020 passes and two evidence-input failures while source edits were underway.
Current focused tests pass both cases; the cause remains unconfirmed pending a stable full run.
Staff page wiring and database execution remain incomplete. No fact approval or catalog publication occurred.

### September 15, 11:53: saved staff evidence reads

Migration 0135 adds mmhr_get_vendor_evidence for a selected vendor organization.
It requires workspace and platform staff access and returns up to 50 evidence bundles with review state and a continuation cursor.
The adapter validates organization, fact/source links, ordering, page size, and cursor before returning records.
The staff router exposes list through this adapter. Existing recording and approval commands remain unchanged by this migration.
Focused contracts, adapters, router, migration-order, and entry-point checks pass 28 tests. Type37920 and focused lint pass.
Database test coverage now includes saved draft reads and denial at AAL1, but execution is still unavailable.
The migration inventory is 136. Generated metadata came from drizzle-kit; no migration was applied.
Apply reviewed 0135 locally after 0134 before using the staff evidence list. It changes no stored records or table permissions.
Recovery: return to the prior application without the new list call; retain the additive function and correct defects with a forward migration.
Staff page and form wiring remain open. Use searchCrm for scoped vendor/product labels rather than asking users to enter record IDs.

### September 15, 12:06: staff evidence screen

The administration menu links to /admin/vendor-evidence.
The guarded server page uses scoped CRM product choices and paginated saved evidence reads.
Staff can capture a new draft, review its source notes and dates, save a decision, and start another draft after confirmed success.
The retained evidence notes supply the content hash. Notes record package, region, worker type, and restriction evidence.
These notes do not yet implement automatic package-condition matching or renewal of an existing fact.
The read response includes product name and database read time, so expiry labels do not depend on render-time clock calls.
Focused form/adapter tests pass 15; earlier page-entry inventory/adapter tests pass 15. Focused UI lint passes.
Build10447 passes 71 routes, before the final read-time adjustment. Final type7032 and full unit77847 are running.
Native synthetic preview at60853 verifies save failure, unchanged retry, success, another draft, and review completion.
At320px viewport, document client/scroll widths are both305px. Browser warning/error logs are empty.
The preview uses fallback fonts and synthetic transport; it is not authenticated database proof or final typography evidence.
Server96394 and native tab3 are retained. Viewport override is reset.
Staff error/loading pages, existing-fact renewal, package conditions, approved records, and real workflow verification remain open.

### September 15, 12:09: current source checks

Production build81233 passes 71 routes after the final read-time change. Full lint39501 passes.
Type7032 completed successfully. Dependency audit reports zero vulnerabilities.
The standard secret scan passes 1,156 tracked files; an additional scan passes 67 untracked source, migration, and documentation files.
Full unit77847 is still running. Its outcome remains unknown; source is held unchanged during this run.
Source inspection confirms that recording currently creates a new fact; it does not append evidence to an existing fact.
The approved-input resolver selects the latest evidence version, requiring approval before use. Any renewal implementation must preserve that behavior.
No SQL migration or real vendor approval was executed in this checkpoint.

### September 15, 12:21: structured answer selection and evidence recovery

Full unit77847 completed successfully: 356 files and 4,036 tests, before the following changes.
Staff preparation now selects an exact scalar field from structured saved answers instead of always sending an empty response path.
False, zero, and blank strings remain selectable; unsupported arrays or empty objects receive an explicit explanation and block preparation.
The original saved answer remains unchanged. Database scoring rules and publication formats are unchanged by this UI fix.
Added evidence loading and read-error states. Retry reloads saved evidence rather than repeating a capture or decision.
Focused structured-answer checks pass nine tests; boundary/inventory checks pass six. Type2992 and focused lint pass.
Current build94109 passes71 routes; full lint75533 passes. Final full unit77234 is running.
Native preview verifies required answer selection, nested false selection, and styled320px containment with305/305 client/scroll widths.
The first screenshot lost styles because the build replaced hashed assets. The preview now refreshes stylesheet links when serving a page.
The final screenshot shows the styled form. Browser warning/error logs are empty; viewport is reset.
Preview99671 remains at60853 with native tab3 retained. Earlier preview96394 and24067 were stopped as stale instances.
This remains synthetic component evidence, not real database or authentication proof.

### September 15, 12:26: final unit result

Full unit77234 completed with 358 passing files and 4,043 passing tests in 458.80 seconds.
No application source changed during this checkpoint.
The integration inventory passes for 100 files. The tracked secret scan passes for 1,156 files.
The Docker inspection failed with configuration and engine access errors; it does not establish a healthy database.
Catalog approval, package-condition handling, approved records, SQL execution, and the real browser workflow remain open.
The current checklist retains MVP-01 as open and MVP-02/MVP-03 as partial.
This evidence does not complete Phase 1 or authorize Phase 2.

### September 15, 12:30: reviewed fact scope foundation

Added `src/server/matching/fact-scope.ts` with a strict, versioned scope contract.
Conditions refer to saved requirement keys and scalar paths, with explicit allowed values.
All conditions must match. Missing answers or missing scope remain unknown; a known conflict takes precedence.
An explicit reviewed empty condition list means unrestricted scope. Commercial keys are rejected.
Typed JSON equality preserves false and zero without converting strings to booleans or numbers.
Focused tests pass12 cases; focused lint passes.
This helper is not connected to publication scoring or database execution yet.
Next connect scope to reviewed evidence and immutable publication inputs, then implement matching SQL and staff capture controls.
SQL must use the same typed JSON equality. Historical format1 publications must remain unchanged.
Do not describe package-condition handling as complete until those connections and parity tests pass.

### September 15, 12:33: connect application scoring to approved scope

Format2 now reads `comparison_fact_scopes` from immutable approved inputs.
Its JSON value maps capability field keys to reviewed scope objects. Duplicate map records fail validation.
Missing scope or missing customer answers gives no match or coverage credit.
A confirmed scope conflict prevents a match but counts as known evidence. Scope expiry participates in the result expiry.
Format1 ignores this new scope input and retains its previous behavior.
Focused51 tests and focused lint pass. The prior full suite does not cover these changes.
SQL0134 still has the previous format2 behavior. Database/application parity is therefore unfinished.
Next add the corresponding SQL migration and parity vectors; update detail outcomes and staff scope capture.
Do not activate format2 before those checks and the pending scoring approval pass.

### September 15, 12:39: prepare matching database scope rules

Migration0136 adds private scope validators and updates format2 evaluation and masked detail outcomes.
Scope records remain ordinary reviewed, versioned vendor evidence captured in publication inputs.
The evaluator requires all conditions, distinguishes missing answers from conflicts, and includes scope expiry.
The detail read reports unknown outcomes when scope is missing rather than treating every recorded capability as a known mismatch.
Format1 calculations and reads retain their behavior. No stored publication rows or grants were changed.
New private helper execution is revoked from public and application roles.
Parity vectors cover confirmed, conflicting, missing, whitespace, and malformed scope inputs and masked outcomes.
Focused53 and focused lint pass. Integration setup failed; all9 publication tests were skipped due Docker access failure.
SQL execution and parity remain unverified. Generated metadata and the migration-order check record137 migrations.
Generation first failed because MIGRATION_DATABASE_URL was missing. A non-secret loopback placeholder allowed generation without a database connection.

Forward path: review and apply0133 through0136 in order to the approved local test database, then run integration checks.
Recovery: retain format1 application controls and immutable records. Use a reviewed forward SQL correction if0136 fails verification.
Do not enable format2, publish real facts, or apply cloud migrations through this checkpoint.
Staff scope capture/review support, approvals, approved data, and the real workflow remain open.

### September 15, 12:45: staff scope capture

The evidence form now offers Package and regional conditions as a record type.
Staff can add conditions, choose typed allowed answers, and explicitly record source-confirmed unrestricted scope.
The form serializes approved scope keys without asking staff to write JSON.
The existing draft, source, evidence, review, and retry commands remain in use.
Server record validation rejects malformed scope records and scope without a product.
Focused11 tests, type57420, and full lint48581 pass.
Build32550 and full unit80759 are running. Preserve source until their final results arrive.
Native synthetic preview passes adding/removing conditions, keyboard selection,320px containment305/305, failed-save locking, and successful retry.
Browser warning/error logs are empty. Viewport is reset; preview12181 serves60853 and tab3 remains for continued work.
These checks do not establish actual database persistence or an authenticated workflow.
SQL verification, real approvals and records, readable saved scope review, and evidence renewal remain open.

### September 15, 12:47: broader checks on unchanged source

Build32550 completes successfully with71 routes. Full unit80759 remains confirmed live.
Dependency audit reports zero vulnerabilities. Integration inventory passes100 files.
Secret checks pass1156 tracked files and77 untracked source, migration, and documentation files.
The untracked scan reports an unavailable global Git ignore file; the explicit returned project file set was scanned.
The checklist now identifies implemented scope capture and unverified SQL0136 without closing the task.
No source changed during this checkpoint. Database proof, catalog approval, and the real workflow remain open.

### September 15, 12:59: database and real workflow restored

An elevated Docker check with scratch configuration returned engine29.7.2. Local Supabase runs on57021/57022.
Full unit80759 passes359 files and4062 tests.
Publication integration initially passed8 and failed1 because the ordering fixture assumed an empty global vendor catalog.
The corrected fixture retains all existing options and adds explicit approved scope for its two scored products.
It proves format2 orders by product despite different scores and preserves the previous format1 publication.
Publication17581 passes9 tests; staff evidence84621 passes1; initial selection50029 passes8.
These runs applied the complete migration set to disposable databases, including0136, and verified SQL/application parity.
Type79264 and focused lint pass after the integration fixture correction.
The test wrapper rejects multiple file arguments; subsequent runs used one supported file per command.

Applied0133 through0136 to the existing project-local database after these checks. A read confirms137 migration rows.
No cloud or production database was used. Keep immutable records and format1 controls for recovery; use a forward correction if required.
Port3000 is owned by svchost and was left unchanged. Development server47166 is ready at3006.
Synthetic launcher92260 resumed the saved synthetic intake using the previously authorized staff MFA repair.
Credentials remain in the launcher process. Native tab4 verified customer access, saved requirements, and one saved initial choice.
The comparison shows its recovery state. A scoped local diagnostic confirms24 stored options and expired evidence, with earliest expiry2026-09-15T04:15:43.263Z.
No successful current matrix read is claimed. Continue audited evidence renewal and real browser verification.
Catalog/scoring approval, approved real records, and the remaining staff review usability remain open.

### September 15, 13:09: append reviewed evidence versions

The existing evidence record command now accepts optional expectedEvidenceVersion.
Renewal preserves the original fact, value, source history, and previous evidence versions.
Migration0137 locks and checks the existing fact and latest version before adding a source and the next evidence version.
Changed fact values, changed product scope, stale versions, and older capture times are rejected.
The new evidence still needs review; immutable publications are not updated by renewal.
Staff controls collect a new source URL, capture date, expiry, and findings. The retry retains the original request.
Focused80548 passes20 tests; type45993 and focused lint50153 pass before the final date comparison and additional UI test.
Initial integration61705 failed during migration because a JavaScript replacement interpreted a SQL dollar sequence.
The SQL was rebuilt using literal replacements and inspected. Disposable integration37168 passes the renewal, replay, changed-value, and stale-version assertions.
Generated inventory138 includes0137. Local database remains at137 migrations;0137 is not applied yet.

Forward path: finish the UI checks, apply0137 locally, then test renewal and review with the approved synthetic accounts.
Recovery: retain all evidence and publications. Older callers omit expectedEvidenceVersion and keep the original create behavior.
If correction is needed, use a forward SQL fix; do not rewrite saved evidence or extend old expiry dates.
The real staff workspace selector currently lists only the customer workspace. Resolve authorized vendor workspace access before the browser renewal check.
No renewal was submitted and no new facts or scoring rules were published in this checkpoint.

### September 15, 13:14: local renewal migration and readable review

Applied the tested0137 migration locally. The database confirms138 migration rows.
Saved scope evidence now shows condition labels, answer paths, and typed allowed values instead of raw JSON.
Missing scope and explicitly unrestricted scope have different explanations. Invalid records remain visible with a correction message.
Focused3702 passes10 form/display tests. Type4229 and full lint27729 pass.
Build5421 and full unit30610 are running. Preserve source until they finish.
The requested permission change is limited to the existing synthetic staff account and one local synthetic vendor workspace.
Approval is pending under the supplied working agreement. No membership or permission override was added.
The real renewal/publication workflow and final catalog approval remain unfinished.

After Phase 1 passes, provide the Phase 2 goal prompt for review.
Do not start Phase 2.

### September 15, 13:23: recover build evidence and refresh scans

Earlier build5421 has no process handle. Replacement build98504 exits0 and generates71 routes.
Existing Sentry and middleware deprecation warnings remain.
Integration inventory passes100 files. Tracked secret scan passes1156 files.
Supplemental scan covers84 untracked source, migration, and documentation files with0 findings.
Git cannot access its global ignore file; the supplemental scan uses the returned project file list.
Full unit30610 remains live on direct polling. Elevated inspection confirms project Vitest PID32444.
No test completion is claimed. No source, membership, cloud, or publication changes were made.
Catalog/scoring and synthetic vendor workspace access approvals remain pending.

### September 15, 13:30: complete unit suite and exercise renewal form

Full unit30610 exits0:360 files and4067 tests pass, duration780.19 seconds.
The longer run was active, not stopped; no test restart or source change was needed.
The native component preview now renders the saved-scope display and renewal form from application source.
Typed Boolean, text, and numeric answers render distinctly. Explicit unrestricted scope has its own explanation.
Invalid renewal dates produce validation feedback. A simulated failed save locks and retains the original request.
Retry reaches the success message. Captured warning/error logs are empty.
These transport-mocked checks do not prove authentication, persisted records, review, or publication.
The viewport override did not change the observed1265px document width. Latest mobile renewal verification remains open; the override was reset.
Preview16041 serves60853. Native tabs3/4 remain available.
Approved-input integration9937 exits0:4 tests pass against current migrations. Pending, rejected, or stale latest evidence cannot use an older approval.
The suite also verifies approved matching inputs, private provenance, and replay of the original snapshot.
No application source, permission, cloud, or publication changes were made in this checkpoint.

### September 15, 20:22: apply explicit approvals

Rob approved the catalog/scoring proposal and access for the synthetic staff account to one local synthetic vendor workspace.
The decision document records the approval; individual real fact reviews remain required.
A guarded local operation added contributor membership and workspace access only for Synthetic provider1.
It verifies loopback57022, the saved synthetic intake, synthetic staff identities, and exactly one matching vendor workspace before changes.
Native browser tab6 confirms the workspace opens and staff evidence controls load.
The actual interface saved input_payroll evidence version2 and then saved its approved review.
The original fact and old evidence remain visible. No real vendor claim was approved through this test.
New staff preparations now send rules version2; existing publications remain unchanged.
Matching tests pass39. The combined run hit a browser worker startup timeout; the isolated interface rerun passes6.
Type checking67377, focused lint69108, and production build79690 pass.
Development server19535 serves3006. Launcher92260 handle is missing; existing browser authentication remained usable.
Recovery for test access is revocation of membership3e8d02b5-c674-485c-80e8-cf1cefe9d48c and overridea718b4ec-e15f-41af-8f22-8e16e8cfa373.
Next: reviewed synthetic package scope, new comparison publication, real customer selection checks, and reviewed real catalog records.

### September 15, 20:35: local rules2 publication verified

Native staff controls saved and approved synthetic package scope, then published comparison sequence2 with rules2.
The current option shows 100% fit and coverage; cost, setup, and delivery type remain unknown.
Read-only DB verification confirms sequence2/rules2 and the preserved sequence1 selection. Sequence1 publication is revoked.
This does not verify selection on the new publication. Browser warning/error logs are empty; tab6 is retained.
Automatic approval review rejected the local customer login helper because this account sign-in needs specific approval.
No customer sign-in occurred. The explicit approval question remains pending; do not use a workaround.
Customer selection/masking, mobile verification, and reviewed real catalog facts remain open. Phase1 is incomplete.

### September 15, 21:03: source registry completion checkpoint

Migration0138 assigns each new evidence source to the verified saving actor and records capture method and review cadence.
Registry metadata reads are opt-in; older read and write callers remain compatible. Historical records and permissions are unchanged.
Focused25, type, lint, build71, and disposable integration33801 pass. Local migration39108 applied.
Native tab6 saved an unapproved synthetic registry-check fact with owner/manual/90days. The page passes320px305/305 containment.
Inventory100, tracked scan1156, untracked scan90, and dependency audit0 pass.
Full unit38069 remains live; preserve source and poll the same handle before claiming a full-suite result.
See ../../docs/security/phase1-source-registry-migration.md for compatibility and recovery.
Customer login approval remains pending after automatic review rejection. Real catalog entry/review and complete customer verification remain open.
