# Four-option staff comparison preview

Status: Native staff preview verified. Not a published customer comparison.

The prior turn completed the profile-approval feature and passed all 4,100 unit tests.
Five local profile approvals remain pending after the automatic review rejection.
This check uses the three already approved real profiles and an existing synthetic option.
It does not bypass the five pending approvals.

## Saved inputs and result

The native staff browser opened submitted fictional intake `da7b8b35-1fb7-4f41-bab8-c8b80cc419ac`.
The saved requirement has key `input_payroll`, with requested value `yes` and weight 1.
Staff preparation selected vendor field `input_payroll` and answer path `requested` under rules version 2.
The new unpublished preview contains four options. The prior preview had one option before profile approvals.

Three real options show “More approved evidence is needed” and “Needs confirmation.”
Each has zero confirmed fit and zero evidence coverage because reviewed package scope is missing.
This does not mean the products lack payroll.
One of those options shows the separately approved Add-on delivery classification.
The existing synthetic option shows 100% fit and evidence coverage for its reviewed test scope.
Every cost and setup estimate remains Unknown.
No publish button was submitted. No customer choice or disclosure was created.

## Native browser checks

- At a 320-pixel viewport, document width and scroll width both measured 305 pixels.
- The matrix region measured 255 pixels wide with 688 pixels of internal content.
- ArrowRight moved the matrix scroll position to 19 pixels.
- All seven requirement/metric row labels retained sticky positioning.
- Enter opened the third option's evidence details. Space closed them.
- The screenshot showed readable evidence text and a visible keyboard focus indicator.
- Evidence details show controlled dates, version, and delivery classification.
- The matrix contained no links, images, or matching text for any of the eight vendor names.
- Browser warning and error logs were empty.
- The viewport was reset. Both working tabs remain available.

The first text-only evidence selector did not match the accessible full label.
Inspection showed a `summary` with hidden option text. A grounded summary locator completed the keyboard check.
No application code changed. Existing tests were not rerun without a code change.

## Remaining evidence

This is staff preview evidence only.
Five profile approvals, reviewed package conditions, remaining delivery classifications, publication, and actual customer selections remain open.
The customer form's keyboard and narrow-screen checks remain separate from this matrix check.
Do not mark Phase 1 complete or start Phase 2.

## September 16 follow-up

See [payroll form and scope evidence](phase1-payroll-browser-scope-2026-09-16.md).
The customer payroll keyboard and narrow-screen checks now pass.
The later preview confirms BambooHR scope and Add-on classification.
Earlier preview results above remain historical evidence.

## November 8 eight-product staff preview

The staff interface prepared an unpublished comparison for the same fictional saved intake.
The current preview shows eight real products. It has three confirmed matches and five options needing confirmation.

At a 320-pixel viewport, the document width and scroll width were both 305 pixels.
The comparison region was 255 pixels wide with 1,264 pixels of internally scrollable content.
Eight table headers used sticky positioning. ArrowRight moved the focused region to scroll position 40.
Keyboard focus on the last option moved the region to position 997. Enter opened its evidence; Space closed it.
The screenshot showed readable row labels and a visible focus outline.
The matrix contained no vendor names, links, or images. Browser warning and error logs were empty.
The viewport was reset. The comparison remains unpublished.

This verifies the staff preview. It does not establish customer publication or a new saved selection.

## November 8: local customer publication and selection

The owner approved publication of the fictional eight-option comparison. The staff interface published version 7.
The fictional customer saw all eight options. No provider names, links, or images appeared in the comparison.
Five choices were saved and remained after refresh. The remaining choices were disabled.
The local server rejected a direct sixth-choice request with `Initial candidate limit reached`. A read-only count remained five.
The customer page and selection request returned successful app-server responses. Browser warning and error logs were empty.
The native browser did not provide complete network-response inspection. This evidence does not verify hosted access or deployment.

## November 8: customer phone view and response masking

At 320 pixels, the customer page had no page-level horizontal overflow. The comparison scrolled within its own 263-pixel region.
Its content was 1,264 pixels wide. The requirement label stayed sticky.
Keyboard focus reached Option 8. Enter opened its evidence and Space closed it. The viewport was restored after the check.
An authenticated synthetic customer read the full current-publication RPC response. It contained eight options and no checked provider names, provider or product IDs, URLs, images, or private evidence fields.
This does not capture every browser network request or prove hosted behavior.

## November 8: local selection retries

An authenticated synthetic customer repeated the saved selection request with the same retry key.
The server returned the original selection as `replayed`. A changed request with that key was rejected.
A read-only check confirmed one batch, five items, and five candidates remained.
The first check expected the wrong error code. The corrected check expected `22023` and passed.

## November 8: direct product access

The authenticated fictional customer requested the eight masked product records directly from the local product table.
The request returned `42501` and no records. This single check does not complete authorization or RLS verification.

## November 8: native loading and empty states

A fictional local intake showed the comparison loading message. Before submission, it prompted the customer to submit first.
After submission with one fictional requirement, it stated that MMHR must publish an approved comparison.
No choice control appeared and saved choices remained zero. Browser warning and error logs were empty.
The local app server returned 200 for the tested draft, requirement, submission, and page requests.

## November 8: native stale comparison retry

The older fictional comparison showed an error message and a Reload comparison link. The earlier saved choice remained visible.
After retry, the old comparison was still unavailable and the saved choice still counted as one of five.
Browser warning and error logs were empty. A new reviewed publication remains necessary for that old intake.

## November 8: local display routes

The local `/` and `/designs/pulse` routes loaded. Both displayed dark and light backgrounds after the theme control was used.
Browser warning and error logs were empty. The original dark theme was restored.
The design route labels its content as placeholder content. The local home page includes claims about 52 monitored systems and repeated checks.
Those claims were not verified by the local catalog evidence and need review before any launch.

## November 8: read-only scoring comparison

A focused local check compared database and application scoring with fictional inputs inside a read-only transaction.
The original test helper failed on its first case: the database received a JSON string instead of an object.
A scratch copy that sent the same inputs as JSON objects passed the helper's scoring, missing-data, scope, and ordering-independence cases.
The original helper remains unchanged and needs repair and verification. This check is not the full integration suite.
The same JSON parameter pattern appears in the publication test fixtures and other database test files.
Those uses need review. This check does not establish that each use fails.

## November 8: scoring test repair in separate copy

The unmodified test helper failed in the separate GitHub test copy with `Publication configuration is invalid`.
A test-only change sends serialized input as text before the database parses it as JSON.
The same read-only parity check then passed with the changed helper. Type check and lint also passed.
The project checkout and the local site do not yet contain this repair. Other database test fixtures still need review.
The full unit suite also passed: 503 files and 6,453 tests. This does not replace database integration tests.
The separate copy also passed `npm run build` with local placeholder settings. This does not verify a hosted deployment.

## November 8: read-only organization permission check

A read-only local database check used modeled claims for the existing fictional customer and an unexpired local session.
The permission function allowed customer portal access for the customer's organization and denied access for a different catalog organization.
This called the private permission function with a database owner connection. It did not verify a signed token or the public endpoint.
It also did not test another customer organization's publication. Full organization isolation and RLS verification remain open.

## November 8: saved publication scoring check

A read-only local test loaded the fictional customer's published version 7 and its eight saved options.
It recalculated each option from the saved requirements, approved input snapshot, and saved scoring configuration.
All eight matched the saved fit, evidence coverage, reasons, limitations, and evidence dates. Their order matched the format-2 rule.
The first test used an incorrect publication reference and failed. The corrected test selected the verified fictional intake and published version.
This checks one local saved publication. It does not prove current freshness, other customers, or hosted behavior.

## November 8: saved evidence expiry boundaries

A read-only local test checked every saved evidence input across the eight fictional comparison options.
The approved-input function returned each saved input one microsecond before its recorded expiry.
It excluded that same evidence or override at its exact expiry.
This tests the saved local inputs and current catalog state. It does not prove every expiry scenario or hosted behavior.

## November 8: saved comparison freshness calculation

A read-only local check recalculated the source snapshot for fictional published version 7.
Its saved digest matched the current inputs and the inputs one microsecond before the first saved evidence expiry.
The digest changed at the first expiry, as expected. The first expiry was still in the future during this check.
This tests the database calculation for this local comparison. It does not invoke the public endpoint or prove hosted behavior.

## November 8: paginated local customer database reads

A focused local test used the fictional customer's existing session with modeled claims and the authenticated database role.
The public publication-read function returned eight options across pages of three, three, and two. The cursors and option order were correct.
All option IDs were unique. The pages contained no checked product, vendor organization, evidence, or source identifiers, URLs, or image markup.
A request using a different catalog organization was denied with `42501`.
The test used an automatically rolled-back transaction. A later read-only check found eight options and all five saved choices.
This did not validate a signed token or test another customer's publication. Full cross-customer and hosted isolation remain open.

## November 8: pagination boundary checks

The same rolled-back local database test requested a page after the eighth option. It returned an empty page and no next cursor.
It rejected seven invalid requests with `22023`: zero, excessive, and fractional page limits; negative and excessive cursors; an unsupported detail version; and an extra field.
A read-only follow-up found all eight options and five saved choices unchanged.
The test used modeled claims. It does not prove browser, signed-token, cross-customer, or hosted behavior.

## November 8: local RFP approval setting

A read-only local check found one RFP approval policy row. The separate-staff requirement is off.
The installed approval command retains a staff permission check and an audit command. Anonymous callers cannot execute it.
This verifies the local setting and installed command structure. It does not repeat the full RFP approval workflow or verify production settings.

## November 8: cross-customer database checks

A focused local test used two existing fictional customers in different customer organizations. It created no accounts or access grants.
The first customer could read its eight-option comparison. The second customer had portal access to its own organization.
The second customer was denied access to the first customer's current comparison, a comparison page, and saved choices.
The server also denied its selection attempt for the first customer. A request mixing the two organizations was denied.
The selection denial occurred at the authority check, before the five-choice limit.
The transaction rolled back. A read-only follow-up confirmed all eight options and five saved choices remain.
These checks used modeled claims in the authenticated database role. They did not validate signed tokens or hosted behavior.
The second organization had no published test comparison, so the reverse direction remains untested.

## November 8: signed local cross-customer reads

A second existing fictional customer signed in through the local test service. No email was sent.
Its signed claims were verified. The account had portal access to its own organization and not to the first customer's organization.
Four local requests for the first customer's current comparison, comparison page, saved choices, or a mixed-organization view were denied with `42501`.
The test closed only its new session. A database check confirmed the earlier sessions remained.
A separate read-only check confirmed the first customer's eight options and five saved choices remained, and its comparison was still current.
This covers one direction and four local read paths. The second organization had no published test comparison.
Selection denial was tested separately with modeled claims. Reverse-direction, hosted, and full integration tests remain open.

## November 8: signed local cross-customer selection

The second fictional customer signed in through the local test service. Its signed claims were verified.
It had customer portal and option-selection permission in its own organization.
Its attempt to select for the first customer was rejected at the authority check with `42501`.
The test used a deliberately wrong comparison digest and a nonexistent option as extra safeguards.
The new test session was closed. Earlier sessions and the first customer's five saved choices remained.
This covers one local direction. Reverse-direction, hosted, and full integration tests remain open.

## November 8: signed access in both directions

A second existing fictional customer created a clearly labeled local draft through the normal customer command.
The draft has one history record and one audit record. It has no requirements or published comparison.
Both fictional customers signed in locally with verified claims. Each could read its own record and was denied the other customer's record.
The two new sessions were closed, and earlier sessions remained. The first customer's eight options and five saved choices remained.
No provider or real customer was contacted. No account, membership, access grant, or second publication was created.
The second customer's record is a draft. Reverse-direction access to a second published comparison and hosted behavior remain untested.

## November 8: second fictional submitted intake

The second fictional customer saved one payroll requirement and submitted its clearly labeled local intake.
A read-only check found revision 2, one active requirement, its history, and the expected audit records.
There is no comparison or publication for this intake. The first customer's eight options and five saved choices remain.
The new local test session was closed, and the customer's earlier sessions remained. No provider or real customer was contacted.
Existing fictional staff have no membership or workspace access to this second organization. Access changes and publication require separate authorization.

## November 8: second intake staff access review

Neither fictional staff account is a member of the second customer's test organization.
The two accounts have permission to manage grants, but the authority rules prevent either from granting access to the other.
A read-only search found no other verified fictional staff account that could receive such a grant.
The organization has other fictional administrator records, but no administrator sign-in or access change was made.
A second comparison cannot yet be prepared through the reviewed staff workflow. No access rule was bypassed.

## November 8: simultaneous retry check

A new local check attempted to reconstruct the five-choice request from the saved selection and receipt.
The reconstructed request did not match the saved receipt, including after the check tried all five-choice orders.
The check stopped before sign-in and sent no retry requests. The cause remains unverified.
The earlier sequential retry passed with the original request. Simultaneous retry behavior remains unverified.

## November 8: simultaneous retry result and proposed correction

The earlier fixture mismatch was a test-script conversion error. A corrected read-only check matched the saved request.
Two simultaneous signed local retries returned the original five choices. Selection, candidate, receipt, and audit counts stayed unchanged.
Both responses returned the first request's reference instead of their own. The selection result helper uses an ambiguous column name.
A temporary local copy of the helper returned two new references correctly. Its other response fields matched the existing helper.
The temporary function was rolled back. No permanent database change was made.
The new test sessions were closed, and earlier sessions remained. A repair and regression test are drafts in session scratch.
The proposed regression test and a permanent migration have not been run. Hosted behavior and full integration remain unverified.

## November 8: saved-choice and disclosure response masking

A signed fictional customer read the current comparison, saved-choice history, and recorded disclosures.
The responses contained eight options, five saved choices, and no recorded disclosures.
The combined responses contained none of the eight options' checked provider or product names and IDs.
They also contained no checked web links or image markup. The staff-only disclosure review returned `42501`.
The test closed its new session and confirmed the customer's earlier sessions remained.
This checks one local fictional customer and its current data. It does not verify every browser request or hosted behavior.

## November 8: retry impact in the application

The selection command checks that each response uses the request's reference. A different reference causes an `INVALID_RESPONSE` error.
The standard customer retry keeps the original request and reference. The local database replay returned that original reference.
A caller that reuses the selection key with a new request reference would receive an error even though the choices remain saved.
The draft correction addresses that case. It is not yet part of the application or local database.
The focused command and customer-interface checks passed 64 tests across two files. They use mocked command responses.

## November 8: scoring independence for the saved comparison

A read-only test used the eight options in the fictional version 7 comparison.
For each option, it added fictional values for nine types of commercial data at two values each.
All 144 variations left the database and application scoring results unchanged.
As a control, changing relevant product facts changed numeric scores for three options in both scoring methods.
The test did not save the fictional values. It does not cover every possible commercial field or a new publication's ordering.

## November 8: temporary retry repair workflow check

A local test compared the existing selection command with temporary copies that use the proposed reference correction.
Both returned the original five saved choices. The corrected copy returned the new request reference.
All other returned fields matched. Both commands rejected a changed request and a request for another organization.
The test used modeled customer claims and an existing fictional session. It rolled back the transaction and removed the temporary functions.
Selection, candidate, receipt, and audit counts stayed unchanged. The security-guard revision also stayed unchanged.
The permanent migration and a signed or browser test of the corrected command remain open.

## November 8: refreshed customer comparison and assets

The local site returned HTTP 200. A fresh native browser tab loaded the fictional customer's version 7 comparison.
It showed eight masked options and the five saved choices. The remaining choices were disabled.
The comparison table contained no checked provider names, links, images, SVGs, or CSS image URLs.
The browser asset inventory found no checked provider names in asset URLs. The tab had no warning or error logs.
The original staff tab remained open. A fresh staff review was denied in the active customer session.
This inventory covers observed page assets. The browser did not provide complete network response inspection.

## November 8: complete local customer page response

An authenticated fictional customer requested the comparison page from the local application.
The HTTP 200 response contained the expected comparison. Its complete HTML and embedded page data were checked.
The response contained none of the eight checked provider or product names and IDs, or their recorded source domains.
The checked private product, vendor, source, evidence, and content-hash field names were also absent.
The new test session was closed. Earlier sessions remained.
This checks one page response, not every browser request, future comparison, or hosted deployment.

## November 8: customer app API checks

Two fictional customers signed in through the local test service. Each could read its own intake through the app API.
The first customer's comparison returned eight options across pages of three, three, and two.
Its saved-choice response contained five choices. Its disclosure response contained no records.
The checked app responses hid the eight provider and product names, IDs, source domains, and selected private field names.
Each customer's request for the other customer's intake returned `NOT_FOUND` with HTTP 404.
The second intake has no published comparison. A reverse check against a second published comparison remains open.
Both new sessions were closed, and earlier sessions remained. This does not capture every browser request or prove hosted behavior.

## November 8: simultaneous retries through the customer app

A fictional customer sent two simultaneous retries of the exact saved request through the local app API.
Both returned the original five choices as `replayed`. Selection, candidate, receipt, and audit counts stayed unchanged.
A third retry kept the same key but used a new request reference. The app returned `INTERNAL_SERVER_ERROR`.
This confirms the known reference defect. The standard customer interface keeps the original reference when it retries.
The test closed its new session and confirmed earlier sessions remained. The permanent repair remains a draft.

## November 8: local RFP self-approval workflow

A rolled-back local test used an existing fictional staff session and modeled claims.
The staff member created a draft for the fictional customer and approved that same draft.
A customer approval attempt was denied. The MMHR approval and its audit record were present.
An exact approval retry returned the existing approval without an extra approval audit record.
The transaction was rolled back. No test RFP, approval, audit record, or delivery remained.
Separate staff approval remained off. Signed browser and hosted workflow checks remain open.

## November 8: separate-approval option simulation

A temporary copy of the approval command simulated the separate-approval setting as on.
In that simulation, the draft author could not approve the draft. A different fictional staff member approved it.
The MMHR approval and audit record were present. The transaction and temporary functions were rolled back.
The actual local setting remained off throughout the test. The actual setting was not switched on.
The app currently displays the setting but does not provide a switch to change it.
Changing the setting currently requires an authorized database configuration change.

## November 8: stale comparison and saved choice through the app

A signed fictional customer accessed an older local intake with a stale current comparison.
The app denied the current comparison and a new selection. The earlier saved choice remained readable.
The page displayed the unavailable-comparison message and saved-choice section.
The test used an invalid digest and nonexistent option as extra safeguards against a new choice.
A direct local check returned `Publication is stale` before those safeguards were reached.
Saved choice counts stayed unchanged. The new session was closed and earlier sessions remained.
This is one local stale-data case. It does not verify hosted behavior or successful recovery by republishing.

## November 8: simulated provider disclosure

A rolled-back test used fictional staff and customer sessions with modeled claims.
Before disclosure, the customer received no provider records. A customer attempt to record disclosure was denied.
The staff command rejected a missing discussion reference and a future discussion time.
After staff recorded a simulated discussion and disclosure, the customer received only the selected provider record.
An exact retry returned the same disclosure without an extra audit or receipt. All test records were rolled back.
The five saved choices remained. No real discussion occurred and no provider was contacted.
This does not verify a signed browser disclosure flow or hosted behavior.

## November 8: simulated conflicting feature evidence

A read-only test checked the eight saved options in the fictional local comparison.
None contained a feature marked both as a match and not supported.
The test then added conflicting feature coverage in memory to one otherwise matching option.
The database returned both `match` and `not_supported`, and both response checks accepted the result.
The customer interface maps those values to “Match confirmed” and “Not supported”.
The simulated coverage did not change the score. A changed matching fact did change the result.
No saved fact, comparison, or customer record changed. No browser rendering of the simulated conflict was tested.
Review publication validation and historical compatibility before a repair. Other comparisons and hosted behavior remain unverified.

### Requirement context matters

A second read-only test used three fictional yes/no requirements.
When a customer requested a capability, a matching positive fact and `not_supported` produced a misleading combination.
When a customer requested its absence, a matching negative fact and `not_supported` produced the same labels legitimately.
A requested capability with a negative fact produced a mismatch and `not_supported`.
The application and database scoring agreed in these cases. No saved records changed.
Do not reject every match with `not_supported`: the rule must consider what the customer requested and what the fact means.
The current generic matching configuration does not define that meaning. A safe repair needs a reviewed way to express it.
The existing integration test expects all six coverage labels with a match, including `not_supported`.
Publication details are calculated when read, so a read-side rejection could also hide an existing comparison.

## November 8: partner and paid-addition conditions

A read-only test used eight fictional partner and paid-addition cases.
With a reviewed delivery or module condition, accepted, rejected, and missing answers produced match, mismatch, and unknown.
With an empty scope, both labels could produce a match without an answer about that condition.
The label itself does not enforce the approved partner-acceptance or paid-module rules.
Application and database scoring agreed in these cases. No saved records changed.

The eight saved options contained one matched paid addition and no partner label.
The matched addition's scope recorded country, worker, and restriction conditions, but no module or delivery condition.
A later check traced the restriction to the saved customer's paid-addition answer. See below.

### Saved paid-addition condition

The matched option is BambooHR's proposed HR plan plus Payroll.
Its saved scope and coverage facts each link to an approved review for that product.
The scope's `restriction` condition requires `allowPayrollAddOn` to be true.
The fictional customer saved true for that answer.
In memory, changing the answer to false produced an ineligible result; changing it to unknown produced an unknown result.
The database and application agreed in all three cases. No saved data changed.
This confirms willingness to consider the addition. It does not establish an existing purchase or price.
Other products, partner acceptance, and automatic enforcement for incorrectly scoped facts remain unverified.

## November 8: selection retry repair draft check

The drafted regression changes the retry reference and corrects two test input conversions.
The full project type check passed with that draft supplied in memory.
No application file or database record changed. The draft was not run as an integration test.
The permanent repair, migration review, local integration test, and hosted checks remain open.

### Retry migration review

A read-only check compared the draft with the installed local function and the newer test copy.
The draft changes only the returned request reference. It preserves the existing function definition otherwise.
The installed function has its expected restricted execution settings. No database change was made.
The drafted regression also passed its code-quality check with no warnings.
The draft is not a registered migration. Review its permissions again after any authorized application.
If a later migration needs correction, use a reviewed forward change and preserve saved selections and audit records.

### Approved local fix branches

The owner approved two local branches on November 8.
`codex/fix-scoring-parity` contains the scoring test repair. Its read-only local scoring check passed.
`codex/fix-selection-retry` contains the retry migration and regression test.
The exact migration passed a local test inside a transaction that was rolled back.
The test verified the current retry reference, unchanged selections, access restrictions, and function permissions.
At that checkpoint, the migration was generated and registered in the branch but had not been applied locally.
Five older local migration checksums do not match the checked project files or available Git revisions.
The mismatch also remains after checking saved Git reflog versions and common line-ending variants.
Resolve that history before applying migrations to this database. Unit tests and the build were still running at this checkpoint.

### Concurrent retries and test-folder formatting

A local test ran two overlapping fictional retries against temporary copies of the corrected command.
Both returned their own request reference and the same five choices. Both transactions were rolled back.
The first broad unit run failed 19 tests: one expected the old migration count, and 18 read altered line endings.
The migration count was corrected. Historical SQL files in the new work folder were restored to their original bytes.
All 41 checks in the eight affected test files then passed. The full rerun passed all 6,455 unit tests.
After a Git metadata refresh, the work folder lists only the intended changes. No files were staged.
The installed local retry command also matches its tracked source and has the expected execution permissions.
Two initial builds stopped making progress and were stopped. The build then passed with local access and placeholder settings.
It compiled, checked types, and generated 119 static pages. The open local site returned HTTP 200 afterward.

## November 8: fictional estimate scope prototype

A test model checked whether a fictional annual estimate matched a fictional employee count and package.
Ten cases passed, including matching, missing, different, and invalid counts, plus package conditions.
The model would show Unknown when the required condition is missing or does not match.
The existing database and application scope checks agreed in these cases.
This model is not connected to the app. The current app can still return an estimate without matching its customer scope.
A complete repair needs a controlled customer count, reviewed package conditions, compatibility for old comparisons, and integration tests.
No real price, saved customer data, or publication changed.

### SQL prototype

A read-only SQL expression tested the same gate alongside the application model.
It agreed in eleven fictional cases, including a count condition that allowed extra values.
The installed estimate function still returned the estimate in those cases; only the test expression applied the gate.
The expression is not a migration and does not establish a controlled customer-count field.

### Keep estimate inputs out of fit scoring

A read-only test added a fictional employee count as a scored requirement to a matching option.
With equal weights, the fit and evidence scores fell from 100% to 50% when no matching vendor fact existed.
Making that count required also changed eligibility from eligible to unknown.
The application and database agreed. No saved data changed.
An employee count used only for an estimate needs a separate, controlled input path.
The earlier prototype's fictional requirement key is not a complete design for that path.

### Separate estimate input and saved comparisons

A read-only test added a fictional estimate input to copies of the saved comparison data.
Both test counts left all eight application fit scores unchanged. Database score checks agreed.
The original saved data produced its original fingerprint. Each added or changed test input produced a different fingerprint.
The app uses that fingerprint to detect stale comparisons. A repair must preserve the old format for old comparisons.
This was a test model only. No application code or saved comparison changed.

### November 10: existing saved company context

The saved version 7 comparison already contains `intake.companyContext` in its immutable input snapshot.
A read-only check confirmed that the eight-option snapshot's digest matches the stored digest.
An in-memory change to that existing context changed the digest. Requirements, product inputs, and all eight recalculated results stayed unchanged.
The saved context had no key named `employees`, `employeeCount`, or `employee_count`; this does not rule out other free-form labels.
This finding can inform a controlled estimate input without adding a new top-level field to old snapshots.
It does not establish a validated employee count, reviewed package conditions, or safe display of existing estimates.
No saved records changed. Estimate scope and historical compatibility still need implementation and tests.

### November 10: estimate-scope implementation in the local worktree

The customer intake now has an optional employee count for estimates. A saved count remains separate from scored requirements.
The worktree adds a new comparison read format. It shows an annual estimate only when the saved count and reviewed scope match.
It shows a setup estimate only when its reviewed scope matches. Missing or conflicting inputs return Unknown.
The older read format remains available. The customer application requests the new format after migration 0173 is installed.

Focused tests passed for count entry, corrections, legacy answers, application and database scope agreement, and masked customer reads.
An isolated database test checked a matching fictional price and a different customer count. Scores stayed equal between read formats.
The first saved-choice migration test had one failure from an outdated test-only migration count. That assertion was corrected; a rerun remains open.
The full unit suite and final checks remain open. The local browser has not verified the new field.

The exact 0173 migration was rehearsed in a transaction against the existing local database and rolled back.
The earlier read result and scores stayed unchanged. All five saved choices, 197 data-table fingerprints, and checked public permissions matched after rollback.
The new private reader was not executable by the checked customer or anonymous roles. The migration had not been applied at the time of this rehearsal; see the later local update below.
The first two rehearsal attempts failed because the test did not allow the normal temporary security counter update. Both transactions rolled back.
Recovery is to keep the older application on read format 1 and make any necessary database correction as a reviewed forward migration.

### Focused retry database test

On November 8, `npm run test:integration -- src/server/db/r3-initial-selection.integration.test.ts` passed all eight tests in a separate temporary local database.
The test installed the branch migrations and checked retries, invalid requests, access restrictions, and competing selections.
The test's temporary database containers, network, volumes, and generated project directory were absent after cleanup.
At that checkpoint, the five older checksum differences remained unresolved, and migration 0171 was not installed locally.
The full database integration suite remains deferred to hosted staging.

### November 9 local history review

The SHA-256 for the applied 0046 file matches the current file with its audit state changed from `completed` to `masked`.
The installed initial-evaluation command still uses the earlier value. The current audit validator rejects it and accepts `completed`.
The branch adds migration 0172 to correct this function without changing its permissions or the assessment's masked state.
The focused initial-evaluation integration file passed three tests in a separate temporary database.
One test restored the old function and confirmed that the rejected audit value rolled back evaluation creation.
It then applied 0172 and verified evaluation creation, retry, the audit value, and unchanged function permissions.
The exact 0172 migration also passed a rollback test against the existing local database; saved record counts and function permissions were unchanged.

A read-only comparison found 4,560 checked objects in both the existing database and a fresh migrated database, with no missing or extra checked objects.
It found a second function difference from the pending 0171 repair, whitespace-normalized differences in other functions, and differences in table and function access settings.
The current database has narrower `service_role` access on 18 tables. A legacy trigger function has default execute privileges locally; its exact impact needs separate review.
The comparison did not cover every database property. Four older file checksums remain unexplained.
All 467 unlinked Git blobs were also checked; none matched those four applied file checksums.
An additional check compared all 4,014 Git blobs, regardless of their saved path; none matched.
At that checkpoint, neither 0171 nor 0172 had been applied to the existing local database. The full integration suite remains deferred to hosted staging.
The retry branch passed 6,455 unit tests, type checking, lint, a placeholder build, migration consistency, and secret checks on November 9.
The focused evaluation database test passed three cases. The earlier full unit attempt was stopped after one failure; that dependency test passed separately.

### November 9 non-destructive recovery rehearsal

The owner requested another path that preserves the existing test data.
The local database has 212 accounts. All have addresses in reserved test domains. The database was not copied.
An isolated fictional-data test simulated four old history differences, saved five choices, and used the installed migration program to apply 0171 and 0172.
It verified that all 171 old history records, the five choices, and function permissions stayed unchanged. All nine tests in that focused file passed.

A second rehearsal applied both exact migrations together inside a transaction on the existing local database, then rolled back.
It compared all 171 old history records and fingerprints for 197 data tables before and after the rehearsal.
The five saved choices, function permissions, and migration sequence value were unchanged.
The existing database has not been permanently changed by these checks. The four original migration versions remain unknown.
If the fixes are applied later, preserve those old records and report the differences as unresolved. Use a reviewed forward correction for recovery.

### November 9 local forward update

The owner requested a way to continue without deleting the existing test data.
After the isolated migration-program test and a rolled-back local rehearsal, migrations 0171 and 0172 were applied to the local database.
The guarded check verified the local endpoint, exact pending files, existing functions, permissions, and the saved baseline immediately before application.
After application, all 171 earlier migration rows remained unchanged and the two new rows were present.
Fingerprints for all 197 checked data tables matched, including all five saved choices. The checked function permissions were unchanged.

A further rolled-back test used modeled claims for existing fictional customer and staff sessions.
The customer replayed the five saved choices with a new request reference. Altered and cross-organization requests were denied.
The staff test created and replayed a fictional masked evaluation and checked its audit record. Both tests rolled back.
The four original migration files remain unavailable. Their historical checksum differences are not resolved by this update.
The test used modeled claims, not a signed browser session. Full database integration remains deferred to hosted staging.
The project server on port 3006 did not respond during this check. Port 3100 returned a login redirect and was not identified as this project's server.

### November 10 customer comparison investigation

The earlier denied customer request called `mmhr_create_initial_evaluation` directly with modeled claims.
The current customer comparison screen does not call that older command.
The older command requires an AAL2 session; the fictional customer had an AAL1 session and no verified MFA factor.
The same modeled customer had workspace and customer-portal access. The current comparison read returned eight published options and five saved choices.
The diagnostic transaction rolled back. Record counts and the checked security guard remained unchanged.

The current flow saves customer needs, lets staff publish the comparison, and lets the customer select options.
An isolated database test used a fictional customer with an AAL1 session and no MFA factors.
It submitted needs, published six options as staff, read all six as the customer, and saved five choices.
The focused current-publication integration file passed all seven tests. Type checking, targeted lint, and the changed-test secret scan passed.
No application access rules changed. The test's temporary Docker resources were absent after cleanup.
This evidence does not establish a signed browser result. The project server was unavailable for that check.

### November 10 customer-created intake test

The isolated no-MFA workflow test was extended to create the intake through `mmhr_save_customer_intake`.
The fictional customer then saved a requirement and submitted the intake. Staff published six fictional options.
The customer read all six and saved five choices. The focused integration file passed all seven tests.
Type checking and targeted lint passed. The isolated test used modeled claims and removed its temporary Docker resources.
This test does not establish a signed browser result. The existing local customer's saved data was not changed.

### November 10: estimate-scope and saved-choice verification

Migration `0173_r3_estimate_scope.sql` passed a rollback rehearsal against the existing local test database.
The rehearsal preserved 197 checked table fingerprints, five saved choices, the checked permissions, and the previous read format.
The migration had not been applied at the time of that check; see the later local update below.

The selection-history test used separate disposable databases.
All nine integration tests passed after the setup moved to a guarded rehearsal helper.
The test covered migration history, saved choices, retry behavior, the five-choice limit, and access checks.
No matching temporary containers, networks, or volumes remained after the run.

Type checking, lint, the integration inventory, and tracked and untracked secret scans passed.
The production build passed with local placeholder settings.
A full unit run had four test failures and one worker startup error.
Focused reruns passed the affected tests after two test repairs.
One combined focused run still reported a worker startup error; that worker's nine tests passed in a separate retry.
The clean full unit rerun passed all 6,476 tests across 505 files.

The local server remains stopped pending the expired-worker-login decision.
A customer-created evaluation has not yet been verified in the browser.

### November 10: local estimate migration plan

The local update would apply only migration 0173 after checking the local endpoint, the migration hash, and all 173 existing history timestamps.
The check records 197 data-table fingerprints, five saved choices, and the existing public function permissions before the update.
It checks the same data and permissions after the update and confirms that one migration record was added.
The earlier four historical checksum differences remain unresolved and their records must stay unchanged.

The risk is that a failed update could leave the local application and database on different read formats.
If the migration fails, check the migration record and function definitions before retrying.
Keep the older application on read format 1 and use a reviewed forward migration for any correction.
The rollback rehearsal passed; the read-only preflight passed without writing to the database.

### November 10: local estimate migration applied

Migration 0173 was applied to the local test database after the rollback rehearsal, focused checks, and full unit rerun passed.
The guarded update confirmed the exact local endpoint and migration hash.
All 173 earlier migration records, 197 checked data-table fingerprints, five saved choices, and checked public permissions remained unchanged.
The new migration record and estimate reader are present. The four historical checksum differences remain unresolved.
A rolled-back post-update check using modeled fictional customer claims read eight options and five saved choices in both formats. Scores stayed unchanged, and unsupported estimates stayed hidden. Signed browser verification remains open.

### November 10: scoring parity on both local database paths

The isolated publication integration file passed all nine tests before the helper repair.
Its scoring case compared the database and application results for weighted, missing, scoped, numeric, and commercial-independence cases.
The same unmodified helper failed when called directly against the existing local test database in a read-only transaction.
It sent a serialized configuration as a JSON string where the database required an object.

The previously approved helper repair now binds serialized JSON as text before PostgreSQL parses it.
The corrected helper passed the same read-only local scoring check.
This changes test code only. It does not change customer scores, saved comparisons, or database permissions.
After the repair, all nine isolated publication integration tests, type checking, lint, the access-boundary tests, the integration inventory, and the secret scan passed. The full unit rerun passed all 6,476 tests across 505 files.

### November 10: isolation between two published comparisons

An isolated database test created two fictional customer organizations and published a separate comparison for each.
Each customer read their own comparison and saved one choice.
Each customer then reloaded their own saved choice.
Both customers were denied when they tried to read the other comparison, page, or saved choice, or select an option for the other customer.
The test also denied mixed customer and publication identifiers in both directions.
The stored choices belonged to their respective organizations.

All 11 tests in the isolated current-publication file passed.
Type checking, lint, 57 access-boundary tests, integration inventory, secret scan, and the diff check passed.
No matching temporary containers, networks, or volumes remained after cleanup.
The test used modeled fictional claims. It does not establish signed-browser or hosted isolation.

### November 10: warning for an unclear feature match

The comparison now asks the customer to review a feature when the saved outcome is a match and coverage says not supported.
It also adds a review note beside the score and required-feature count when those values are shown.
The display keeps the saved score, eligibility, ranking, and selection behavior unchanged.

This warning does not establish whether the saved match is correct.
The result can be valid when the customer asks for a feature to be absent.
A correct scoring decision needs reviewed information about the meaning of the saved requirement.
Historical comparisons and approved scoring need a separate compatibility review before any data-level correction.

The focused component tests passed, including the ambiguous and ordinary mismatch cases.
Type checking, lint, a build with local placeholders, and the tracked secret scan passed.
A native browser preview used fictional options and no database.
It displayed the warning in both themes and kept the narrow comparison within its scrollable region.
The fictional selection and evidence controls worked. The preview had no browser console warnings or errors.
A complete network capture and a signed customer browser session remain unverified.
The real local server remains stopped pending the worker-login decision.

The replacement full unit run passed all 6,478 tests in 505 files on November 10.
The earlier run did not produce a final result after its command session became unavailable.
The replacement run does not verify the signed customer browser flow.

### November 10: internal coverage scoring prototype

A test-only format 3 path now checks reviewed package inclusion for paid additions and the customer's saved partner decision.
It treats missing conditions, unreviewed limitations, and unclear capability meaning as unknown.
A reviewed limitation can match when its restriction is represented in scope and the saved answers satisfy it.
Explicit presence meaning can distinguish a requested capability from a requested absence when the absence evidence is consistent.
Conflicting evidence remains unknown.

This path is not accepted by publication commands and is not connected to the database or staff screens.
No existing comparison, score, selection, or database record changed.
The generated migration 0174 deliberately raises an error if applied before it is completed.
Do not run migrations from this worktree until its database implementation and recovery review are complete.
The focused scoring and scope tests passed 66 cases; type checking, targeted lint, and the diff check passed.
The full unit suite and build have not been rerun after this prototype.
Database parity, isolated integration, staff controls, approved evidence, and signed customer browser checks remain open.

The guarded migration now contains a draft private format 3 database scorer.
An isolated database test installed only that draft in a disposable database after the existing migration prefix.
Four integration tests passed, including delivery outcomes, reviewed limits, invalid inputs, and evidence freshness.
The test database's matching containers, network, and volumes were absent after cleanup.
The application scoring and scope tests passed 68 cases. Type checking, targeted lint, and the diff check passed.
The draft scorer is not wired to publication or the customer read path.
Migration 0174 still raises an error before the draft is installed. Do not apply it yet.
The full unit suite and build have not been rerun after the scoring prototype.

### November 10: final coverage migration applied locally

This entry supersedes the earlier guarded-draft status above.
Migration 0174 passed 13 isolated integration tests, including commercial-reference rejection and old-format compatibility.
A second review confirmed that the old helper bodies remain unchanged except for explicit format routing.
The local rollback rehearsal preserved 197 table fingerprints, 174 historical migration records, and nine old comparison results.
Application then passed the same preservation checks. All 175 local migrations are recorded, with none pending.
No cloud migration was applied. Four older historical checksum differences remain unresolved and preserved.
The staff screen still prepares format 2; format 3 UI wiring and signed browser verification remain open.
See `docs/claude-handoff-2026-11-10.md` for the branch, exact migration hash, recovery limits, and remaining work.
