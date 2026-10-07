# Complete one MMHR pilot workflow

> **Delivery notice, October 7, 2026.** The product owner approved the [MVP complete UI/UX and backend roadmap, version 1.1](build-mvp-complete-ui-ux-roadmap-2026-10-06.md).
> It replaces the October 3 instruction to complete all mandatory software before live use.
> Launch Candidate A ships after roadmap phase P2. Launch Candidate B adds demos, proposals, and contract handoff after P3.
> Financial-record management and private document storage are outside the MVP.
> Where this document conflicts with the roadmap on launch scope or delivery order, follow the roadmap.
> Its full-software-completion sequence is superseded. Its recorded evidence remains valid history.
> A full rewrite follows the launch.

## Plan control

| Field | Value |
|---|---|
| Date | October 3, 2026 |
| Version | 1.20 |
| Status | Local feature implementation authorized; live pilot approval pending |
| Executor | Codex |
| Accountable owner | Rob Speciale |
| Staff acceptance | Rob and Jason |
| Product authority | [PRD](../../docs/PRD.md) |
| Architecture authority | [TECH_STACK](../../docs/TECH_STACK.md) |
| Task and status authority | [MVP launch checklist](release-mvp-launch-checklist.md) |
| Phase authority | [Six MVP phases](../../docs/phased-mvp-development.md) |
| Evidence baseline | [October 3 code audit](../../docs/code-audit-2026-10-03.md) and [requirement matrix](../../docs/code-audit-requirements-2026-10-03.md) |
| Manual operation | [Pilot procedure draft](../../docs/mvp-pilot-operating-procedure.md) |

The user requested this saved plan and later authorized completion of all unfinished features.
Complete internal testing with synthetic customer, staff, and vendor data before any real customer use.
The plan preserves the existing six phases, 20 launch tasks, and later v2 requirements.
The launch checklist remains the completion record. This plan supplies executable work and acceptance checks.

## Full software completion before live use

On October 3, the user approved the recommended completion sequence and authorized subagents for independent work.
Complete all mandatory software requirements and the synthetic rehearsal before the controlled live pilot.
The earlier manual MVP remains a historical milestone. Manual records do not complete the corresponding software requirements.
The canonical PRD still defines product scope. This execution sequence does not waive a requirement or release control.

| Order | Work | Required result before the next dependent phase |
|---|---|---|
| 1 | Refresh all 148 requirement rows against code, tests, and dated evidence | Each requirement has a status, remaining task, dependency, and acceptance condition |
| 2 | Resolve dependency findings and complete the integration gate | Approved package corrections and all required checks pass without weaker assertions or omitted cases |
| 3 | Finish documents, application email, and background jobs | Safe files and communications reach the correct authorized records; failures preserve review and recovery |
| 4 | Finish registration through contract handoff | Customer, staff, and vendor screens support the complete journey; approved catalog evidence supports published facts |
| 5 | Finish finance and ongoing operations | Signed-source eligibility, independent financial approval, invoices, collections, exceptions, onboarding, CRM, reports, administration, and required AI behavior pass |
| 6 | Run the complete synthetic rehearsal | A complete case reaches reported signing, simulated financial closure, and onboarding; negative cases fail safely |
| 7 | Verify a protected staging candidate after approval | Hosted journeys, staff acceptance, security, accessibility, performance, alerts, deletion, restore, and rollback have qualifying evidence |
| 8 | Run the separately approved live pilot and expand access | Participants accept actual use; deployment checks and all release evidence pass for the exact candidate |

Use the three authorized AgentMail inboxes for synthetic role communications.
Add separate synthetic organizations and reviewers where isolation and independent decisions require them.
Test invalid input, denied access, stale versions, expired sessions, duplicate submissions, provider failures, and recovery.
Never treat a reported signature, simulated payment, or agent-operated account as real participant acceptance.

Track software implementation, local acceptance, hosted acceptance, and release readiness separately.
Requirement counts do not measure development effort or justify an overall completion percentage.
Do not set a launch date until the refreshed backlog identifies remaining dependencies and acceptance work.

The initial work uses three independent subagents for requirement review, integration diagnosis, and dependency remediation preparation.
Keep file ownership separate. Preserve the existing dirty worktree and historical failure records.
Freeze validation inputs before simultaneous code changes. A baseline run cannot certify a later candidate.

Main risks are private data disclosure, unsafe files, incorrect financial closure, and lost history.
Use additive migrations and preserve original documents, receipts, decisions, and financial amounts.
Recover by disabling affected entry points and using a tested rollback or reviewed forward correction.

Package installation requires the approval stated in AGENTS.md.
Git writes, provider activation, permission changes, cloud migrations, catalog publication, and production actions retain separate approval boundaries.
The user's instruction to proceed authorizes the local completion work. It does not approve these external or separately controlled actions.

## Current authorization and rehearsal gate

The September 30 instruction starts local implementation across the documented unfinished features.
It does not authorize deployment, real customer use, cloud migrations, provider activation, or later Git actions.
AgentMail inboxes remain test email addresses. They do not require AgentID or Supabase registration.

Build complete application workflows for vendor replies, clarifications, demos, proposals, contracts, finance, and customer success.
Also complete the supporting customer, staff, vendor, document, communication, and reporting controls in the canonical requirements.
Use the existing backend foundations only after their permissions, associations, and state rules pass relevant tests.

Portal replies now have local submission, revision history, staff review, separate approval, and approved customer reads.
Clarification questions, vendor answers, linked revisions, and independent decisions also passed local browser tests.
The database now verifies removal of the unnecessary source response identifier from customer clarification reads.
All five formerly blocked security suites passed with isolated setup.
Demo planning, customer and vendor availability, staff confirmation, schedule changes, and history now have local browser evidence.
Demo outcomes passed genuine Auth database checks and customer, staff, and vendor browser checks.
The full unit run passed 4,270 tests. Focused demo checks, type checking, lint, and the production build also passed.
See [the demo verification record](../../docs/security/r6-demo-coordination.md) for exact results and remaining demo work.
These results do not establish complete FR-RSP coverage or full project completion.

Private upload completion passed twelve combined Auth, Storage, database, and scanner checks at migration level 153.
The later file-type correction passed 73 focused checks and a final 33-test manifest check.
Type checking, lint, and the upload production build passed. October 2 browser uploads passed for synthetic customer and vendor sessions.
Both files entered quarantine, with scans pending and no approval before disposable cleanup.

The proposal workflow now preserves structured original quotes and exact pricing across vendor-specific deals within one customer intake.
Nine database checks passed for separate approvals, private pending revisions, immutable comparisons, revoked replay, audit rollback, and historical reads.
All 154 migrations applied to an empty local database; eleven checks passed across 150 public tables.
Ninety-three contract, command, transport, screen, form, and authorization inventory checks passed. One additional schema inventory check passed.
Five genuine signed Auth checks passed, including a current staff session without sufficient MFA assurance.
Type checking, full lint, and the production build passed after the browser corrections.
Seventeen manual browser checks passed across customer, two vendors, and two staff accounts.
The corrected screens and forms passed 19 regression checks. The stable complete unit run passed 406 files and 4,667 tests.
The full integration run ended: 110 files and 1,056 checks passed; two checks failed.
Fresh portal reply and identity-intent suites passed 27 and 96 checks respectively.
Replay now uses the existing longer journey budget. The identity failure occurred before containment and remains under investigation.
See [proposal controls](../../docs/security/r6-proposal-pricing.md) for the exact scope and remaining requirements.
Approved file attachments and a complete proposal acceptance claim still require the remaining document processing controls.

The three approved AgentMail inboxes passed a direct synthetic customer, staff, and vendor email test.
Four logical messages arrived once. Identical retries returned their original receipts; changed-content retries failed with HTTP 409.
Both replies retained their original message associations. Application email delivery and ingestion remain unfinished.
See [the email test record](../../docs/security/agentmail-synthetic-role-test-2026-10-01.md).

Contract inputs, request commands, tRPC routes, and customer, staff, and vendor screens now exist.
Ten isolated draft database checks passed. Input, command, transport, and authorization checks passed 127 tests.
Workspace and form checks each passed eleven tests. The first form process failed before loading tests.
Four genuine Auth checks passed, including rollback and exact retry after the unchanged request timeout.
Customer selection, staff approval/introduction/signing, and vendor privacy/history passed synthetic browser checks.
Seventeen date conversion and eleven form regressions passed after correcting seconds precision.
Root migration 0154 and two integration suites are registered. Thirteen SQL and five genuine Auth checks passed.
Empty database verification passed eleven checks across 155 migrations. Historical compatibility passed two checks; restricted database verification passed ten.
The clock-drift regression passed with all 97 identity checks. The original complete integration failure remains unproved.
The normal local database has not received this migration. Some alternate browser cases remain pending; the registered candidate build passed.
See [contract verification](../../docs/security/r6-contract-portal.md). Do not claim this workflow is complete yet.

The next complete unit attempt passed 4,744 tests and failed one missing contract authorization inventory entry set.
One additional worker failed before loading its component. Corrected inventory and the omitted component passed in a 56-test run.
The corrected complete unit run passed 410 files and 4,745 checks, but one worker failed before loading.
Browser-only tests passed 86 files and 879 checks, but two workers failed before loading.
Both gates failed. Fork workers then passed all 88 browser files and 911 checks with unchanged isolation.
Windows now uses forks. The first complete run found a misplaced database migrator import in a test helper.
The helper moved into the existing migration module; all 54 boundary checks passed without changing their rules.
The fresh complete unit run passed all 411 files and 4,771 checks. Current type checking and full lint passed.
The contract CRM stage draft records each remaining transition and keeps financial closure separate; thirteen draft database checks passed.
Five genuine signed Auth checks passed for the stage correction. Registered browser verification passed customer, staff, and vendor signed-outcome reads.
Staff recorded the selection approval, introduction, negotiation, and synthetic reported signing through normal screens.
An invalid signing date and unchanged retry failed safely. Reload recovered the form; the valid outcome then succeeded.
Another vendor could not read the history. Customer and vendor histories hid staff notes and fit mobile widths.
Database proof retained the selected deal at `contracting` with open status. Financial closure remains separate.

Finance payment totals now use checked integer arithmetic. Fifteen finance regressions passed.
Root migration 0155 is registered. Eight calculation and five existing commission database checks passed.
Eighty-nine focused finance and authorization checks passed. Type checking, full lint, and the finance candidate build passed.
The complete finance unit run failed one worker startup after 4,761 tests passed. Its missing file passed 26 isolated checks.
Current signed-contract eligibility, source agreement approval, invoices, collections, and closure remain unfinished.
See [finance calculation evidence](../../docs/security/r7-finance-calculation-2026-10-01.md).

Invoice and payment commands now bind authorization correlation and exact returned entities.
Invoice creation also binds its creator to the authorized actor. Fifty focused checks passed.
Type checking and full lint passed after these changes.
The SQL payment approval gap and incomplete retry result fields still require a separate complete correction.
See [finance command evidence](../../docs/security/r7-finance-command-bindings-2026-10-02.md).

Root migration 0156 adds independent manual document review and 60-second session-bound access to exact private originals.
Assigned MFA staff can start review and record an explicit decision. The uploader cannot review their own version.
Approved current files receive a bounded download through the selected workspace. Provider signed URLs remain denied.
Eleven empty-database, two security, and ten restricted-database checks passed across the current 157 migrations.
Type checking, full lint, and the document candidate build passed.
The genuine Auth and Storage suite passed all 17 checks after correcting an expiry fixture to wait for every active grant.
The browser review rehearsal passed synthetic staff approval and rejection, customer approved access, vendor isolation, histories, and search.
Saved-file capture timed out. Actual file opening remains unverified.
Later staff search retained review links, and vendor approval and approved download initiation passed.
Customer and vendor browser uploads passed on October 2. A stale-workspace search showed a generic error and removed results.
The upload harness cleared only its owned disposable services. Both uploads were quarantined with scanning pending before cleanup.
The search correction passed 45 regression checks. Fresh type checking, full lint, and the production build passed.
The complete current unit gate failed one evaluation-options worker startup; 417 files and 4,868 tests passed.
Retry after disposable browser and integration services stop. Preserve the failed gate result.
The isolated file passed 26 checks outside the sandbox. The fresh complete run passed all 418 files and 4,940 tests.
The subsequent production build passed. Current type checking, full lint, and final whitespace review also passed.
The first fresh scanner test lacked Docker access. Its isolated rerun passed all thirteen checks at migration level 157.
The new check follows actual antivirus evidence through independent review and approved customer bytes.
The expanded Auth/Storage review suite passed all eighteen cases, including approved vendor bytes and denial of foreign customer and vendor accounts.
The 12-file focused run passed 212 checks but failed one worker startup. The missing document page passed 36 isolated checks.
The repeated 12-file run passed all 248 checks. The earlier failed runs remain failed.
Extraction, signed URLs, attachments, runtime activation, and complete document coverage remain open.
See [document review and access](../../docs/security/r4-document-review-access.md).

### Next finance implementation boundary

Bind each new financial event to the actual signed portal handoff and the same customer, vendor, deal, and contract.
Keep reported signing separate from approved financial inputs. Never infer signed contract value from a quoted annual estimate.
Require an approved exact source version for the vendor agreement and the signed contract.
Keep vendor commission sources in their authorized workspace. Customer access must not expose private vendor commission terms.
Capture currency, confirmed contract value, effective agreement dates, calculation rule, terms, and source evidence.
Require a separate staff decision before invoice readiness or financial closure.
Validate source replacement, stale revisions, audit rollback, changed retries, and revoked authority.
Reject fabricated contract identifiers through every callable financial creation path.

Use additive evidence records and scoped RPCs. Preserve earlier amounts, decisions, and histories.
The main risks are false contract eligibility, private commission disclosure, duplicate events, and unsupported closure.
Recover by disabling the new entry points and execution grants while preserving financial records and source versions.
Local disposable migration checks are authorized. Normal migration application, cloud changes, provider activation, and release need separate approval.

The software rehearsal must cover successful actions, rejected actions, retries, revoked access, and provider failures.
Approved real data and participant acceptance remain separate later gates.

## 1. Outcome

Deliver one complete customer-to-vendor pilot workflow using approved real product data and normal customer, staff, and vendor access.
Close the handoff with a recorded vendor acknowledgement, a reviewed response through the agreed manual channel, and a customer progress update.
Rehearse the remaining manual operating procedure through contract status, commission control, and onboarding.

The software path is:

1. The customer registers, confirms their identity, and receives a private workspace.
2. The customer saves requirements, resumes work, and submits the intake.
3. MMHR reviews the intake and publishes a masked comparison from approved real catalog records.
4. The customer compares all published options and saves up to five initial choices.
5. MMHR discusses requirements and records provider disclosure and commercial conflicts.
6. MMHR prepares, approves, and delivers the correct RFP version to the selected vendor organizations.
7. Vendor users sign in and read only their issued RFPs.
8. MMHR records acknowledgement, response, next action, and the customer's update through the approved pilot process.

One selected provider must complete the pilot handoff and response loop.
Test additional vendor organizations to prove recipient isolation and multi-recipient delivery.
Do not reduce the approved eight-product catalog merely to make the test pass.

Real data means approved, current, product-specific vendor evidence.
It does not require putting private customer data into fixtures or repository files.
Use controlled customer requirements for engineering tests, then an authorized participant case for live acceptance.

An agent-controlled role session proves technical behavior only.
Customer, staff, and vendor participant acceptance must be recorded separately.
A rehearsal does not prove a real contract was signed, money was collected, or onboarding was completed.

## 2. Scope and completion boundaries

| In this plan | Completion boundary |
|---|---|
| Real catalog, rules, evidence, and comparison | Approved data reaches the customer matrix with correct masking and explanations |
| Account access and support | Normal registration, confirmation, sign-in, sign-out, and approved recovery paths work |
| Daily staff operation | Staff find the case, review records, perform allowed actions, and identify the next step |
| RFP review and portal delivery | Recorded MMHR approval and disclosure precede delivery of the correct immutable version |
| Pilot response loop | Authorized vendor acknowledges and responds; staff retain evidence and update the customer |
| Manual later work | Approved private records and staff rehearsal cover the retained operating procedure |
| Release readiness | Required checks, hosted acceptance, operational drills, and approvals have qualifying evidence |
| Controlled live pilot | Separately approved deployment and participant use pass the live checks |

The original pilot milestone used manual records for later business stages.
The new authorization includes automated response ingestion, AI, document processing, full CRM, demos, proposals, finance, and onboarding screens.
Complete these features and their synthetic role tests before real customer use.
Do not expose incomplete later RPCs merely because their screens are absent.
Every reachable operation still needs the required authorization, audit, and data controls.

## 3. Starting evidence and known blockers

The September 30 role-test baseline passed type checking, lint, 4,174 unit/component tests, and the production build.
Ninety-five isolated database suites passed 871 tests. All 142 baseline migrations applied to an empty disposable database.
These results describe that working tree only.

The following blockers remain:

- Current dependency audit: one critical, one high, two moderate, and one low affected entry. The gate still fails.
- Full integration command: the five earlier suites passed 60 isolated tests against 144 migrations. The latest 110-file full run remains unverified.
- Real catalog: outstanding profile, scope, delivery, and fact reviews; no verified complete real publication.
- Hosted operation: permanent accounts, full browser journey, and participant acceptance remain unverified.
- Daily operation: staff case handling and recovery require completion through ordinary controls.
- Release evidence: all 12 R9 categories remain pending.
- Manual operation: approved record locations, contact channels, responsibilities, and rehearsal remain open.

All 153 current migrations applied to an empty disposable database. Eleven inventory and security checks passed.
The September 30 portal and demo suite passed 27 tests against 145 migrations.
Private document work passed eight upload boundary checks and eleven dedicated worker checks.
The genuine ClamAV fixture passed three checks and removed its owned container and network.
Six focused document files passed 86 tests. These results do not establish a complete application upload workflow.
Eleven reservation database checks, five genuine Auth checks, and ten genuine Storage checks passed.
Thirty-nine focused command and inventory checks passed. Quarantine files still have no ordinary download access.
Ten combined backend checks passed through genuine Auth, Storage, PostgreSQL leases, and ClamAV.
They include a harmless antivirus Word package, changed hashes, exact worker ownership, expired access, and revoked sessions.
Forty focused scan worker/sweep checks passed. The final fixture boundary correction passed 61 focused checks.
The guarded worker passed twelve database checks. Eight upload boundary checks passed again.
The first full unit run found two test-boundary/inventory defects and one Windows thread startup error.
The defects are corrected. The earlier fresh full run passed 393 files and 4,400 tests.
Workspace document metadata, versions, and history passed ten database tests and eight genuine Auth tests.
Customer, vendor, and assigned staff browser checks passed ten cases, including cross-organization denial and narrow-screen use.
The final metadata screen passed type checking, lint, and the production build.
The latest complete unit attempt failed one Windows worker startup after 395 files and 4,441 tests passed.
The missed component passed 26 tests separately. The corrected complete run passed 396 files and 4,467 tests.
The later private file-name search passed 153 focused checks, thirteen database checks, nine genuine Auth checks, and eleven browser checks.
Search terms stay outside page URLs. Extracted content search remains unfinished.
Type checking, lint, and the search production build passed. The next complete unit gate remains open.
Four fresh customer, vendor, and assigned staff cookie/search checks passed without stale server refresh errors.
An overlapping complete unit attempt failed inventory comparisons and one Windows worker startup.
Upload edits changed its inventory during execution. Corrected inventory and the omitted component passed in a 66-test run.
Upload preparation, completion, and private direct Storage controls are now wired through scoped tRPC.
The first focused upload run passed 104 tests. Corrected page/upload checks passed 46 tests.
Twelve genuine Auth and Storage checks passed. Initial type checking and corrected full lint passed.
Twelve combined Auth, Storage, database, and ClamAV checks passed, including false manifest hashes and changed bytes.
The current production build passed. The stable complete unit run passed 401 files and 4,567 tests without worker startup errors.
That result precedes the browser file-type correction. Its current checks remain pending.
Browser upload verification failed to complete when the file chooser stalled beyond its requested timeout.
The test fixture expired before cleanup. Exact fixture labels identified its remaining containers, generated volumes, and network for removal.
Those owned resources were removed. Normal MMHR volumes remain intact.
Customer and vendor upload interactions later passed in a fresh disposable October 2 rehearsal.
Automatic demo reminders, document evidence controls, email ingestion, and later business workflows remain open.
Next, finish upload verification, independent review, signed access, scheduled processing, and approved content search controls.
See [private document work](../../docs/security/r4-private-document-work.md) for limits and recovery.
Document parser dependency approval remains pending. See [the concrete decision packet](decision-document-processing-dependencies.md).
The requested Next.js security update still needs dependency approval. Do not install it without that approval.

The proposal review found a model conflict. Existing comparisons require one deal, but each deal belongs to one vendor.
The later proposal workflow must compare approved versions within the same customer intake across the separate vendor deals.
Preserve immutable source quotes, exact vendor/deal associations, received dates, billing periods, assumptions, and independent staff decisions.
Customer reads must expose approved versions only. Preserve prior versions and show unknown costs without treating them as zero.
Do not connect the legacy proposal approval RPC or caller-supplied source references directly to customer comparisons.
Local migration and authorization tests must cover different vendors, stale revisions, revoked sessions, replay, and audit failure.
Recovery must disable new proposal entry points and retain source quotes, decisions, and history.
Cloud migration and live participant acceptance retain their separate approval gates.

The last real catalog record is dated September 16.
Recheck current records before acting. Do not treat historical approvals as permission for a different fact or environment.

## 4. Execution sequence

### Preparation — Establish a safe and reproducible starting point

**Maps to:** MVP-15 and the shared prerequisites for all six phases.

I will:

1. Inspect the current branch, working tree, existing worktrees, source changes, and active services.
2. Record which existing changes belong to the pilot and preserve unrelated work.
3. Propose the required Git isolation before any branch or other Git action.
4. Confirm the local test database target without reading or printing `.env.local` values.
5. Restore a supported full integration command using the existing local database and worker design.
6. Diagnose the dependency findings and prepare supported, limited remediation.
7. Keep the required security threshold and application behavior unchanged.
8. Verify the intended Node.js runtime against the Node.js 22 CI configuration.
9. Run focused checks for each repair, followed by the applicable broader gates.

Do not introduce a new production dependency without approval.
Do not use a cloud database to overcome a local test configuration problem.
If a dependency finding lacks a supported fix, record the blocker and prepare a concrete remediation choice.

**Deliverable:** A reproducible local validation setup and reviewed dependency repair.
**Exit:** Required engineering checks can run, or a precise external blocker has a documented resolution path.
Catalog source preparation can continue while an independent infrastructure decision remains pending.

### Phase 1 — Finish the approved real comparison

**Maps to:** MVP-01, MVP-02, MVP-03.
**Affected areas:** Vendor evidence screens, catalog commands, matching rules, publication SQL, and customer comparison components.

I will:

1. Compare the eight approved catalog candidates with the current stored products, profiles, sources, and facts.
2. List each missing approval, stale source, package condition, region restriction, and delivery limitation.
3. Refresh required evidence from permitted primary sources.
4. Prepare a review packet with exact proposed facts, source dates, scope, limitations, and expiry.
5. Separate confirmed evidence from Unknown, Limited, Add-on, Partner, and Not supported outcomes.
6. Obtain the required fact and profile approvals through the existing review controls.
7. Verify the approved scoring version, weights, exclusions, and treatment of unknown data.
8. Publish a comparison for the controlled customer case from approved real records.
9. Complete matrix behavior, evidence details, selection persistence, and relevant failure states.
10. Verify the published result through the customer interface after a new sign-in and reload.

Never invent prices, setup times, package inclusion, or unsupported capabilities.
Missing approved estimates must appear as Unknown with a clear explanation.
No synthetic provider or illustrative fact may enter the accepted real publication.
Commission information must remain outside eligibility and fit calculations.

**Deliverables:** Approved catalog review records, versioned rules, real publication, and customer browser evidence.
**Exit:** Every published value has qualifying evidence or an explicit unknown state, and all published options remain available.
The five-choice limit applies only to initial selections.
Unresolved catalog approvals remain blockers; they are not silently removed from the approved scope.

### Phase 2 — Establish hosted access and account support

**Maps to:** MVP-10, MVP-11, MVP-04.
**Affected areas:** Authentication actions, account setup, member/invitation controls, environment configuration, and deployment configuration.

I will:

1. Prepare the restricted staging configuration, migration sequence, backup plan, and recovery instructions for approval.
2. Verify separate staging and production data, credentials, callback URLs, and access boundaries.
3. Keep the production release block intact until the required release approval.
4. Prepare the exact staff and vendor membership changes for approval.
5. Establish normal customer, staff, and vendor accounts after the required authorization.
6. Verify customer email confirmation and exactly one private workspace without administration rights.
7. Verify staff MFA, invitation acceptance, sign-out, expired sessions, and revoked access.
8. Complete the approved password recovery and replacement confirmation-email paths.

The recommended account-support design is self-service password reset and confirmation-email resend through the configured identity service.
This is a product decision to approve before implementation of those paths.
Do not use the staff MFA recovery exception for customer credential recovery.
Users must enter their own new credentials where required.

**Deliverables:** Reviewed environment configuration, permanent account access evidence, and tested account-support instructions.
**Exit:** Each role reaches only its intended surface through normal access, without fixture scripts or manual database privilege changes.

### Phase 3 — Finish ordinary operation and close the vendor response loop

**Maps to:** MVP-05, MVP-06, MVP-07.
**Affected areas:** Customer intake, staff evaluation controls, RFP procedures, customer/vendor reads, and the manual case register.

I will:

1. Make required intake fields understandable without technical field-type knowledge.
2. Verify save, resume, revision, submission, staff review, and correction through ordinary controls.
3. Ensure staff can find the case and identify its owner, status, next action, and due date.
4. Use existing application records where available and approved private records for retained manual activities.
5. Verify discussion, disclosure, conflict explanation, and their audit records before delivery.
6. Complete RFP preparation, preview, approval, recipient checks, and delivery feedback.
7. Keep staff self-approval consistent with the approved two-person-team setting.
8. Confirm customer drafts still require MMHR approval.
9. Verify the vendor's normal inbox shows the correct complete version and deadline.
10. Prepare approved vendor notices, acknowledgement instructions, response channels, and follow-up dates.
11. Obtain authorization before sending external notices or invitations.
12. Record the vendor acknowledgement, response, review decision, and customer's next update.

RFP drafting remains staff-led for this pilot.
The portal delivery record must not imply that an email was sent or received.
Keep manual acknowledgement evidence separate from automated delivery status.

I will finalize the [manual procedure](../../docs/mvp-pilot-operating-procedure.md) with approved private record locations and named responsibilities.
I will prepare a controlled rehearsal for demos, proposals, contract outcomes, partial payment, disputes, financial closure, and onboarding failure.
The rehearsal must show that unpaid or unresolved commissions prevent manual financial closure.
A later signed contract must have a separate purchase effort and commission record.

**Deliverables:** Operable case flow, correct portal handoff, recorded response loop, and a complete manual procedure.
**Exit:** Staff can run the case without developer commands, fixture launchers, or direct database edits.
The vendor can act on the issued RFP, and the customer receives a traceable next step.

### Phase 4 — Align public statements and policies with the pilot

**Maps to:** MVP-08, MVP-09.
**Affected areas:** Marketing pages, forms, resource entry points, disclosures, privacy, terms, and R0 claim records.

I will:

1. Compare every pilot-facing promise with verified software and manual service behavior.
2. Prepare supported wording for claims, figures, evidence, pricing, affiliations, and service descriptions.
3. Repair advertised broken entry points or replace unsupported promises with accurate reviewed wording.
4. Verify registration, contact, partner, resource, and newsletter actions that remain advertised.
5. Align policies with actual consent, sharing, retention, commission, and support practices.
6. Obtain the required claim and policy approvals before public release.

Preserve the design gallery and label illustrative material accurately.
Do not advertise later automation as an available pilot feature.

**Deliverables:** Reviewed content changes and completed claim/policy approval records.
**Exit:** All published pilot claims are supported and every advertised action works.

### Phase 5 — Verify the complete candidate and its recovery controls

**Maps to:** MVP-12 through MVP-17.
**Affected areas:** All enabled routes and RPCs, tests, CI, monitoring, data controls, and deployment recovery.

I will:

1. Run the complete acceptance matrix in Section 5 on the final candidate.
2. Verify direct requests and SQL RPCs independently from visible controls.
3. Resolve the earlier intermittent requirement-save failure or retain it as an explicit unresolved blocker.
4. Test retries, duplicate submissions, stale revisions, expired sessions, failed delivery, and changed permissions.
5. Verify keyboard use, screen-reader behavior, contrast, responsive layout, and critical empty/error states.
6. Measure LCP and INP using the required method and record sample size and limits.
7. Test operational alerts, backup restore, approved deletion, and compatible rollback or forward recovery.
8. Run the full local engineering gates and the reviewed candidate's remote CI after authorized Git submission.
9. Review the final diff, migrations, secrets, unused exposure, and recovery instructions.
10. Prepare evidence records for all 12 R9 categories.

A laboratory performance result must not be described as a real-user percentile result.
Where field evidence is not yet available, retain the limitation and obtain the required release decision.
Do not mark an unmet measurement as passed.
Prelaunch evidence must distinguish tested monitoring from a later monthly production availability result.

**Deliverables:** Exact-candidate test results, browser evidence, security review, and operational drill records.
**Exit:** No unresolved defect remains that breaks the pilot, exposes unauthorized data, or violates a required release check.
All required evidence must satisfy the existing R9 rules; this plan does not waive them.

### Phase 6 — Obtain participant acceptance and run the controlled live pilot

**Maps to:** MVP-18, MVP-19, MVP-20.

I will:

1. Prepare separate customer, staff, and vendor acceptance scripts with the approved real catalog.
2. Record Rob and Jason's normal staff workflow and manual procedure rehearsal.
3. Obtain recorded customer and vendor participant feedback through approved contact arrangements.
4. Resolve acceptance defects and rerun the affected checks.
5. Complete the release evidence packet for the exact reviewed candidate.
6. Present the candidate, migration plan, recovery plan, and live verification steps for production approval.
7. Deploy only after the separately required Git, migration, and production authorizations.
8. Verify live account access, comparison, disclosure, approval, recipient isolation, and vendor reads.
9. Complete the authorized acknowledgement and response loop for the participant case.
10. Record the result, open follow-up work, named owners, and next review date.

If a participant has not acknowledged or responded, report the workflow as awaiting that action.
Do not substitute an agent-created response for participant acceptance.
If deployment fails, follow the reviewed recovery plan and keep release status incomplete.

**Deliverables:** Participant acceptance, approved release, live verification, and one traceable completed pilot handoff.
**Exit:** All completion conditions in Section 8 pass.

## 5. Required acceptance matrix

| Case | Expected result | Required evidence |
|---|---|---|
| New customer registration | Confirmed identity; one private workspace; no staff rights | Hosted browser, stored record, and authorization checks |
| Confirmation and recovery | Valid approved paths work; invalid or expired links fail safely | Browser results and provider delivery evidence |
| Intake save and resume | Reload retains the correct revision and values | Browser and persistence checks |
| Interrupted or stale save | Clear result; no silent overwrite or duplicate action | Failure reproduction and regression test |
| Submitted intake correction | Staff and customer see the intended revision and history | Normal workflow and stored history |
| Real comparison publication | Approved sources and rules produce the expected masked result | Publication identifiers and source review references |
| Unknown or expired evidence | Clear limitation; no invented value or unsupported match | Data cases and customer display |
| More than five available options | All options display; only five initial choices can be saved | Browser boundary case and server rejection test |
| Saved selection after refresh | Choices persist and remain linked to the correct publication | New session and database read |
| Vendor masking | Identity remains hidden before the authorized disclosure | UI, response payload, evidence, and error checks |
| Recorded disclosure | Discussion, conflicts, actor, reason, and time remain traceable | Customer view and audit record |
| Unapproved RFP delivery | Server rejects it without delivery side effects | Direct procedure and SQL tests |
| Approved RFP delivery | Correct version reaches exactly the intended organizations | Staff, customer, vendor, and audit evidence |
| Repeat delivery request | Safe replay; no duplicate recipient action | Retry test and stored delivery records |
| Wrong vendor or customer organization | No foreign RFP, comparison, private note, or finance access | Direct requests and role matrix |
| Revoked membership | Old sessions cannot keep protected access | Hosted session and RPC denial checks |
| Staff approval setting | Approved self-approval works; configured separation is enforced | Both policy states in controlled tests |
| Vendor acknowledgement and response | Actual participant action has a dated case reference | Approved private communication record |
| Customer follow-up | Reviewed status and next action reach the intended customer | Authorized message or normal application record |
| Manual finance rehearsal | Duplicate events and incorrect financial closure are prevented | Controlled rehearsal with partial payment and dispute |
| Manual onboarding rehearsal | Failed history remains; next action and owner are recorded | Staff rehearsal record |
| Accessibility and responsive use | Critical controls work without a pointer and on narrow screens | Assisted and automated checks |
| Recovery drills | Restore, deletion, alerting, and deployment recovery meet required controls | Measured, dated target-environment evidence |

Use the built-in browser first, following the repository's browser fallback order.
Capture console and network evidence where available.
Record unavailable evidence as unverified.
Check both `/` and `/designs/pulse`, in both themes, if shared Pulse code changes.

## 6. Validation and evidence handling

Run focused checks immediately after each behavior change.
Run local integration tests for database, authentication, RLS, migration, and query changes.
Inspect the target and write effects before any data-writing check.

The final candidate requires:

```text
npm run type-check
npm run lint
npm test
npm run build
npm run test:integration
npm run check:integration-matrix
npm run check:dependency-audit
npm run check:secrets
npm run check:r9-evidence
npm run check:r9-evidence:release
```

The last command may pass only after all underlying evidence qualifies.
Do not change manifest values merely to make the command pass.
Check untracked candidate files as well as the existing tracked-file secret scan.

Save non-sensitive verification summaries under `docs/security/` with dates and descriptive names.
Keep temporary logs in the session scratch directory.
Store private case evidence only in the approved operational location.

Each evidence record must identify:

- Requirement and MVP task IDs
- Candidate revision and any uncommitted changes
- Environment, migration level, and relevant configuration version
- Actor role and anonymized case reference
- Expected result, actual result, command or browser steps, and date
- Publication, RFP, approval, or audit references where relevant
- Failure details, evidence limits, owner, and remaining action

Update the launch checklist only when its completion condition passes.
Update the requirement matrix only for behavior actually completed.
Keep later v2 software requirements incomplete when the pilot uses manual handling.

## 7. Decisions, approvals, and recovery

Prepare concrete review packets before asking for approval.
Use existing valid authorization when it already covers the exact action.

| Point | Codex prepares | Required authority or input |
|---|---|---|
| Implementation start | This plan and its phase boundaries | User approval for the named implementation phase or full plan |
| Git isolation and submission | Scoped file list, branch proposal, and validation results | Separate authorization for branch, commit, push, PR, merge, and release actions |
| Catalog publication | Exact facts, profile scope, source evidence, expiry, and proposed publication | Authorized fact/profile decisions and publication approval |
| Account support | Self-service reset and resend behavior with acceptance checks | Product decision for the recommended support paths |
| Staging setup | Configuration, restricted access, migration, backup, and recovery plan | Approval for external writes, cloud changes, and any required purchase |
| Permanent access | Exact users, organizations, roles, and intended access | Approval for account or permission changes |
| Pilot participants | Proposed case, roles, contact purpose, and acceptance scripts | Authorized customer/vendor participants and approved contact arrangements |
| Manual records | Required fields, access rules, retention, and evidence links | Approved private record locations and contact channels |
| Messages | Exact recipient, purpose, content, and data shared | Explicit authorization to send external messages |
| New production dependency | Need, version, affected behavior, and validation plan | Dependency approval before installation |
| Public claims and policies | Exact wording and supporting evidence | Required R0 owner review and approval |
| Production release | Tested candidate, complete evidence, migration and recovery instructions | Separate production authorization and required release approvals |

Earlier Phase 1 authorization does not authorize later phases.
If approval covers one phase only, stop after its verified exit and present the next phase for review.
If approval covers this full plan, continue across its phases within that scope and retain the separate action approvals above.

Main risks and recovery paths:

| Risk | Prevention and recovery |
|---|---|
| Existing work is overwritten | Record the starting tree; make scoped edits; preserve unrelated files and changes |
| A fact is wrong or out of scope | Keep it unpublished; correct through versioned review; retain prior evidence |
| A publication exposes identity early | Block the affected path; correct masking; verify every customer payload before resuming |
| The wrong organization receives an RFP | Validate recipients before delivery; preserve incident evidence; revoke affected access through an authorized action |
| A migration breaks existing data or code | Use compatible staged changes; rehearse first; retain backups and a reviewed forward recovery path |
| Retry creates duplicate approvals or delivery | Preserve stable idempotency keys and immutable version binding; test uncertain responses |
| A provider or account path fails | Show failure clearly; use the approved support process; retain the pending case action |
| Dependency remediation breaks behavior | Keep changes scoped and reversible; run affected tests and full candidate checks |
| A manual commission record closes too early | Require reviewed terminal outcomes; preserve calculation, invoice, payment, and dispute history |
| Participant or approval work is delayed | Continue independent authorized work; report the exact unresolved dependency without claiming completion |

## 8. Final definition of done

The pilot workflow is complete only when all these conditions pass:

- Mandatory software and the complete synthetic customer, staff, and vendor rehearsal pass before real customer use.
- Every requirement has current implementation and acceptance evidence; manual handling does not satisfy a software requirement.
- The agreed real catalog and scoring configuration have recorded approvals.
- No synthetic vendor facts appear in the accepted customer comparison.
- A customer can register, confirm identity, save requirements, compare options, and retain selections through normal access.
- Staff can manage the case, disclose providers, approve the RFP, and deliver the correct version without developer tools.
- A vendor participant can access only its issued RFP, acknowledge it, and respond through the approved pilot channel.
- Staff review the response and provide a recorded customer update with an owner and next action.
- Customer, staff, and vendor acceptance records identify actual participant use and unresolved feedback.
- The manual procedure has approved record locations and a successful staff rehearsal.
- Required local, integration, browser, CI, security, accessibility, performance, and operational checks have qualifying evidence.
- All required R9 categories and R0 exit conditions pass for the intended release.
- Any live deployment has separate approval and successful live verification.
- The checklist, audit status, operating instructions, and memory record reflect the actual result.

Do not call the full v2 platform complete when these pilot conditions pass.
Do not call a real commercial case complete until its actual contract, commission, and onboarding outcomes occur.

## 9. First action after implementation approval

Start with the October 3 requirement refresh and security/integration blockers.
Then complete the document, communication, and background-job foundations before their dependent workflows.
Prepare the exact remaining vendor fact and profile review packet before requesting publication approval.
Report progress by completed acceptance checks, current defects, and blocking decisions.
Do not estimate completion from file counts or passing unit tests alone.
