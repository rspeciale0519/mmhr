# MMHR MVP Launch Checklist

> **Delivery notice, October 7, 2026.** The product owner approved the [MVP complete UI/UX and backend roadmap, version 1.1](build-mvp-complete-ui-ux-roadmap-2026-10-06.md).
> It replaces the October 3 instruction to complete all mandatory software before live use.
> Launch Candidate A ships after roadmap phase P2. Launch Candidate B adds demos, proposals, and contract handoff after P3.
> Financial-record management and private document storage are outside the MVP.
> Where this document conflicts with the roadmap on launch scope or delivery order, follow the roadmap.
> Its task IDs remain tracking labels. Roadmap Section 9 maps them to work packages UX-01 to UX-17.
> A full rewrite follows the launch.

## Document Control

| Field | Value |
|---|---|
| Version | 1.3 |
| Date | 2026-10-03 |
| Status | Authoritative MVP launch sequence; implementation and release evidence remain incomplete |
| Product owner | Rob Speciale |
| Authorization | User requested documentation alignment on September 14, 2026 |
| Product authority | [PRD](../../docs/PRD.md) |
| Architecture authority | [TECH_STACK](../../docs/TECH_STACK.md) |
| Full product roadmap | [v2 roadmap](roadmap-v2-implementation.md) |
| Public-release authority | [R0 control](module-r0-roadmap-and-public-release-control.md) |
| Build grouping | [Phased MVP development](../../docs/phased-mvp-development.md) |

This checklist replaces the conversational 20-task list as the MVP launch sequence.
It records the agreed MVP milestone within the full v2 roadmap.
It does not approve new recommendations, public claims, Git actions, cloud migrations, or deployment.

The phased development document groups these 20 tasks into six build phases.
This checklist retains task IDs, requirement mappings, dependencies, completion checks, and status.
Hosted environment and account preparation move earlier to satisfy existing dependencies. Task IDs remain unchanged.

The October 3 instruction requires complete mandatory software and synthetic role tests before real customer use.
Use the [current execution plan](build-complete-pilot-workflow.md#full-software-completion-before-live-use) and [requirement audit](../../docs/code-audit-requirements-2026-10-03.md).
The earlier manual MVP definition remains historical guidance. It does not waive the current completion gate.
Task statuses below retain the September 30 checkpoint until each task receives qualifying current acceptance evidence.

Rob is the accountable owner under the existing R0 owner register.
Jason participates in the staff acceptance session.
Each task uses the review roles of its mapped roadmap modules.

## Launch Boundary

The MVP provides customer registration, saved intake, staff review, the approved Comparison matrix, initial selections, disclosure, and approved RFP portal delivery.
Staff prepare the RFP after discussing requirements with the customer.
Vendor names remain masked until that discussion and recorded disclosure.
All published options remain available; the initial selection limit is five.
Separate staff approval remains off for the two-person team. MMHR approval and its record remain required.

Staff handle responses, demos, proposals, contracts, commissions, and onboarding during the pilot.
The customer and vendor negotiate and sign their contract directly.
These manual arrangements do not complete the corresponding v2 software requirements.
See [retained later work](#retained-later-work) and [local MVP operation](../../docs/mvp-local-operation.md).

The MVP may launch before all R5–R8 software features are complete.
The MVP must first pass all required R9 release evidence categories and all R0 exit rules.
R9 remains incomplete for the full product until its remaining product scope is verified.
Existing authorization, audit, consent, and ranking rules continue to apply to every exposed operation.

## Status and Dependency Rules

- **Open:** Required work or qualifying completion evidence remains missing.
- **Partial:** Some implementation or local evidence exists; the launch completion check remains unmet.
- **Decision open:** A product choice must be recorded. It does not authorize the proposed implementation.
- **Ready:** The completion check passes with a dated evidence reference for the release candidate.
- **Released:** The approved deployment and live checks pass.

MVP task IDs are tracking labels, not additional PRD requirement IDs.
Their mappings identify the relevant requirement portions; they do not claim complete coverage of each parent requirement.
Existing R1–R4 foundations must be reused and verified before dependent behavior changes.
Independent tasks can proceed together after their dependencies pass.
The numbering sets work priority, not permission to postpone testing until the end.

Each behavior change requires focused checks during implementation.
Database, authentication, migration, and query changes require local integration evidence.
Rendered changes require native browser checks, including relevant failure and narrow-screen states.
Required module approvals remain in force. Use session authorization where it already applies.

## Ordered Launch Checklist

### September 30 code-audit checkpoint

The [code audit](../../docs/code-audit-2026-09-30.md) traces all 148 requirements to implementation evidence and gaps.
No launch task is Ready or Released.
MVP-07 is now Partial because a procedure draft exists. Its setup and staff rehearsal remain open.
The other task statuses remain unchanged: 15 Partial and five Open in total.
Historical September records below remain dated evidence, not current hosted verification.

| Task | Audit result and next completion evidence |
|---|---|
| MVP-01 | Complete remaining real profile and fact approvals. Verify sources, scope, expiry, and active scoring configuration. |
| MVP-02 | Publish a comparison from approved real records. Verify price and setup unknowns, evidence, scope, and scoring explanations. |
| MVP-03 | Matrix code exists. Complete customer browser checks for selection, refresh, errors, keyboard use, and narrow screens. |
| MVP-04 | Registration database suite passed 39 tests. Complete hosted email confirmation and the recorded account-support decisions. |
| MVP-05 | Staff review and publication controls exist. Complete ordinary case ownership, next actions, editing, and recovery without fixture scripts. |
| MVP-06 | Portal delivery code and isolated RFP tests pass. Verify actual vendor accounts, correct recipients, content, and response instructions. |
| MVP-07 | Use the [pilot procedure draft](../../docs/mvp-pilot-operating-procedure.md). Confirm record locations, contact channels, owners, and staff rehearsal. |
| MVP-08 | Unapproved claims remain. Gated resource delivery lacks a connected implementation. Verify every advertised entry point and service promise. |
| MVP-09 | Approve wording against actual data sharing, commission practices, consent, retention, and the manual process. |
| MVP-10 | No fresh hosted configuration evidence was obtained. Prepare reviewed staging, runtime, migrations, service configuration, and recovery. |
| MVP-11 | Permanent account and permission verification remains open. Synthetic local identities do not meet this check. |
| MVP-12 | No complete hosted browser journey ran during this audit. Record registration through vendor reads on the exact candidate. |
| MVP-13 | Local contract tests pass. Reproduce session expiry, interrupted saves, stale writes, duplicate actions, and failed handoff in the hosted workflow. |
| MVP-14 | No current accessibility or percentile performance result exists. Complete the required measurements and assisted checks. |
| MVP-15 | Type, lint, 4,100 unit tests, and build passed. Dependency audit failed. Full integration and exact-candidate remote CI remain open. |
| MVP-16 | Eleven isolated database suites passed 96 tests. Complete the full target role matrix, including direct authenticated RPCs and sensitive fields. |
| MVP-17 | Evidence validators exist. Actual monitoring alerts, backup restore, deletion, and rollback drills remain unverified. |
| MVP-18 | Rob and Jason must complete the workflow and manual handoffs through normal access. Record defects, decisions, and acceptance. |
| MVP-19 | All 12 R9 manifest categories remain pending. Attach qualifying evidence and approvals without substituting old or synthetic results. |
| MVP-20 | Local production blocking works. Deployment, gate activation on the target, and live checks require separate approval and evidence. |

The dependency audit reported 18 high and 12 moderate affected dependency entries.
Do not waive that gate or infer readiness from the passing application checks.

### Task definitions

1. **MVP-01 — Approve the initial vendor catalog and scoring rules.** Status: Partial; catalog and policy approved, individual vendor records remain open.

   **Maps to:** R2B/R3; FR-CRM-02, FR-VND-01, FR-VND-05, FR-VND-06, FR-VND-07, FR-VND-08, FR-MAT-01, FR-MAT-02, FR-MAT-04, FR-MAT-06, FR-MAT-07, NFR-DATA-01, NFR-DATA-02.
   **Depends on:** Existing R1 access controls and R2B vendor-evidence foundations.
   **Complete when:** Real launch records have permitted sources, review dates, approved facts, and configured freshness windows.
   Record the customer-visible scoring method, weights, missing-data rules, and commercial independence.
   Preview sample values and scoring weights are not production approvals.
   Use the [50-provider research](../../docs/hris-payroll-provider-research-2026-09-14.md) to prepare the proposed catalog and evidence records.
   Approved records also support MVP-02, MVP-05, and MVP-08. Research alone cannot approve vendor facts, scoring, or public claims.
   September 15: Rob approved the [eight-product catalog and scoring policy](decision-phase1-catalog-and-scoring.md). Individual vendor facts still require source and package review.
   September 16: approved local setup created eight catalog workspaces. All eight products are active with individually approved payroll-availability facts. BambooHR also has approved Add-on coverage. The audited profile-review flow is implemented and verified locally with migration0141. ADP, UKG and BambooHR profiles are approved. Automatic approval review rejected Paycom; specific approval for the five remaining local profiles is pending. BambooHR has reviewed scope for a proposed US employee payroll addition; the later staff preview confirms matching fit and Add-on coverage. UKG native payroll delivery is saved as a draft; automatic review requires specific approval. Other structured scopes, remaining delivery coverage and real catalog publication remain open. See [profile review evidence](../../docs/security/phase1-profile-approval-2026-09-16.md). See [catalog controls evidence](../../docs/security/phase1-catalog-controls-2026-09-16.md).

2. **MVP-02 — Complete the live comparison data.** Status: Partial.

   **Maps to:** R3; FR-INT-03, FR-EVL-03, FR-EVL-04, FR-MAT-03, FR-VND-07, NFR-DATA-01; PRD Approved MVP Comparison Design.
   **Depends on:** MVP-01.
   **Complete when:** Published comparisons provide approved feature coverage, pricing estimates, setup estimates, score explanations, and evidence details.
   Fit and evidence coverage remain separate. Missing approved information appears as unknown or unavailable.
   New data paths preserve masking, permissions, pagination, and publication consistency.
   September 15: typed details, approved rules format2, staff evidence reads, package conditions, renewal, and source ownership are implemented locally.
   Migrations0133-0138 passed relevant local integration checks and were applied locally.
   The actual staff interface published a rules2 synthetic comparison. The previous selection remains stored.
   New evidence records capture source ownership and review intervals; earlier records remain unchanged.
   Approved real records and complete customer browser verification remain open. See the [implementation record](build-phase1-comparison-matrix.md).

3. **MVP-03 — Implement the approved Comparison matrix.** Status: Partial; detailed data and native browser verification remain open.

   **Maps to:** R3; FR-INT-04, FR-EVL-02, FR-EVL-03, FR-MAT-03, FR-MAT-08, NFR-ACC-01; PRD Approved MVP Comparison Design.
   **Depends on:** MVP-02.
   **Complete when:** The application uses the approved matrix with saved customer requirements and published vendor data.
   Verify all options, five initial selections, retained choices, readable labels, evidence access, and contained horizontal scrolling.
   Verify loading, empty, error, retry, and successful save states. The design preview alone cannot close this task.
   September 15: the matrix presentation uses the existing selection controls. See the [implementation record](build-phase1-comparison-matrix.md).
   Staff review uses the same matrix and supports explicit field selection for structured answers.
   Synthetic phone, keyboard, and retry checks pass. Evidence loading and read-retry states are implemented.
   These component checks do not establish authenticated workflow, persistence, or approved-data completion.
   September 16: native customer testing found and corrected saved-product display across comparison versions with migration0139.
   Selection-history focused88 and integration8 pass. Latest full4100, type, lint, and build71 pass. Existing matrix refresh and narrow-screen checks pass. The new standard payroll form passes typed save, refresh, edit, invalid-input, narrow-screen, and keyboard checks. See [payroll browser evidence](../../docs/security/phase1-payroll-browser-scope-2026-09-16.md).
   See [selection history evidence](../../docs/security/phase1-selection-history-2026-09-16.md). Real catalog publication and new-choice browser save remain open.

4. **MVP-04 — Complete customer registration and account access.** Status: Partial; account-support decisions open.

   **Maps to:** R1/R2A; FR-IAM-01, FR-IAM-10, FR-MKT-06, FR-MKT-07, FR-MKT-09, FR-MKT-10.
   **Depends on:** Existing identity, account-setup, and lead-routing foundations; MVP-10 for hosted evidence.
   **Complete when:** A new customer completes signup, email confirmation, sign-in, workspace creation, and sign-out in the hosted environment.
   Verify registration fields, email rules, lead ownership, consent, and absence of administration rights.
   Record the account-support decisions below. New self-service recovery screens require approval before implementation.

5. **MVP-05 — Complete everyday customer and staff operation.** Status: Partial.

   **Maps to:** R2B/R3/R4/R8 portions; FR-CRM-01, FR-CRM-02, FR-CRM-04, FR-CRM-05, FR-INT-01, FR-INT-02, FR-EVL-05, FR-EVL-07, FR-RFP-01, FR-RFP-02, FR-RFP-03, FR-RFP-04, FR-ADM-02, FR-ADM-03.
   **Depends on:** MVP-03 and the existing account-access path.
   **Complete when:** Customers can save, resume, submit, and understand their next step.
   Staff can find customer cases, maintain approved vendor evidence, publish comparisons, record discussions, and prepare and approve RFPs.
   Use existing controls where practical. Routine operation must not depend on the synthetic fixture launcher.
   Advanced CRM and administration features remain later work.

6. **MVP-06 — Complete the real vendor handoff.** Status: Partial.

   **Maps to:** R1/R4; FR-IAM-11, FR-IAM-12, FR-RFP-03, FR-RFP-05, FR-RFP-06, FR-MAT-08.
   **Depends on:** MVP-05 and MVP-11 for hosted recipient evidence.
   **Complete when:** Invited vendor users can sign in and read only the RFPs issued to their organization.
   Verify recipients, approved versions, deadlines, complete content, and the customer's disclosed view.
   Give vendors clear instructions for sending responses to MMHR during the pilot.

7. **MVP-07 — Prepare the manual pilot operating procedure.** Status: Partial; draft prepared, operating setup and rehearsal remain open.

   **Maps to:** R4/R6/R7/R8 portions; FR-RFP-06, FR-RSP-05, FR-CMN-01, FR-CMN-02, FR-CMN-04, FR-WRK-01, FR-DMO-02, FR-CTR-03, FR-CTR-04, FR-FIN-02, FR-FIN-05, FR-FIN-07, FR-CSM-01.
   **Depends on:** The agreed launch boundary; finalize against MVP-05 and MVP-06.
   **Complete when:** Each manual activity has an owner, contact method, response expectation, record location, and escalation route.
   Cover vendor notices, acknowledgements, reminders, responses, demos, proposals, contract outcomes, commissions, and onboarding.
   Prepare message templates and a staff procedure. Preserve version, approval, commercial, and customer history.
   September 30: the [procedure draft](../../docs/mvp-pilot-operating-procedure.md) defines required records, handoffs, message templates, and acceptance checks.
   No operational destination, external message, account change, or staff acceptance was executed by the documentation task.

8. **MVP-08 — Approve public content and working entry points.** Status: Partial; claim approvals open.

   **Maps to:** R0/R2A; FR-MKT-01, FR-MKT-02, FR-MKT-03, FR-MKT-05, FR-MKT-08, FR-MKT-10, FR-MKT-11.
   **Depends on:** The launch boundary and MVP-01 for vendor claims. Content review can start immediately.
   **Complete when:** Each published claim has approved evidence or has been removed through a reviewed change.
   Verify navigation, signup links, contact forms, lead routing, partner forms, and any advertised resource or newsletter workflow.
   Retain the design gallery and identify illustrative content appropriately.
   Do not present later features, placeholder statistics, or copied research as a working service.

9. **MVP-09 — Approve policies and disclosures.** Status: Partial; approvals open.

   **Maps to:** R0/R2A/R3; FR-MKT-03, FR-MKT-09, FR-MAT-04, FR-MAT-05, FR-ANL-01, NFR-PRV-01, NFR-PRV-02; PRD Section 9.
   **Depends on:** MVP-01 and MVP-07 for actual business practices.
   **Complete when:** Privacy, terms, commission disclosures, data sharing, consent, and retention statements match actual controls and operations.
   Record the required reviews in R0. Verify that customer-facing explanations match the approved scoring method.

10. **MVP-10 — Prepare usable staging and the production configuration.** Status: Open.

    **Maps to:** R1/R9; NFR-AUTH-01, NFR-ISO-01, NFR-REC-01; TECH_STACK Sections 10 and 15; R0 release controls.
    **Depends on:** A reviewed deployment plan and approval before cloud changes.
    **Complete when:** Vercel, separate Supabase environments, domains, email, and required services have reviewed configuration.
    Provide approved restricted staging access without exposing an unapproved public release.
    Test migrations and application-worker permissions in staging. Keep migration-owner access separate from application access.
    Record backups, compatible deployment order, and recovery steps. Production migration execution belongs to MVP-20.

11. **MVP-11 — Prepare permanent staff and vendor access.** Status: Open.

    **Maps to:** R1/R4; FR-IAM-01, FR-IAM-02, FR-IAM-03, FR-IAM-09, FR-IAM-11, FR-IAM-12, FR-RFP-03.
    **Depends on:** MVP-10 and explicit approval for account or permission changes.
    **Complete when:** Rob, Jason, and launch vendor contacts use their intended accounts, memberships, and normal sign-in paths.
    Verify staff MFA and access recovery under the existing policy.
    Verify separate RFP approval is off for the two-person team, with approval and audit records preserved.
    A customer draft still requires MMHR approval. An administration toggle is not required for this MVP.

12. **MVP-12 — Verify the full hosted journey.** Status: Partial; hosted evidence open.

    **Maps to:** R1–R4; FR-MKT-06, FR-INT-01, FR-INT-02, FR-INT-03, FR-INT-04, FR-MAT-08, FR-RFP-01, FR-RFP-02, FR-RFP-03, FR-RFP-05, FR-RFP-06; R9 criticalBrowserJourneys.
    **Depends on:** MVP-01 through MVP-06, MVP-10, and MVP-11.
    **Complete when:** Native browser evidence covers fresh registration through approved delivery and customer/vendor reads in staging.
    Use controlled test cases with representative approved data and real hosted sessions.
    Record the deployment, migration level, roles, steps, and results. Local synthetic evidence remains supporting evidence only.

13. **MVP-13 — Resolve failure and recovery behavior.** Status: Partial.

    **Maps to:** R1/R3/R4/R9; FR-INT-02, FR-RFP-05, FR-RFP-06, FR-CRM-05, NFR-OBS-01; PRD Section 8.
    **Depends on:** Test the relevant behavior during MVP-02 through MVP-06; finish after MVP-12.
    **Complete when:** Expired sessions, interrupted saves, stale data, invalid input, duplicate requests, failed delivery, and retries have verified outcomes.
    Investigate the earlier intermittent requirement-save failure and record its cause or remaining uncertainty.
    Confirm that recovery preserves records and does not create duplicate approval or delivery actions.

14. **MVP-14 — Verify accessibility and performance.** Status: Partial; hosted measurements open.

    **Maps to:** R9; NFR-ACC-01, NFR-PERF-01, NFR-PERF-02.
    **Depends on:** Check during UI work; finish on the MVP-12 release candidate.
    **Complete when:** Critical pages pass keyboard, screen-reader, contrast, responsive, and automated accessibility checks against WCAG 2.1 AA.
    Measure public-page LCP against 2.5 seconds and critical interaction INP against 200 milliseconds, both at the 75th percentile.
    Record environment, sample, method, and limitations. Do not describe laboratory measurements as real-user field evidence.

15. **MVP-15 — Verify the engineering release candidate.** Status: Partial; final candidate and CI evidence open.

    **Maps to:** R9; all changed requirement portions; TECH_STACK Section 16; roadmap Section 9.
    **Depends on:** Focused checks run throughout implementation. Final checks follow all release-candidate changes.
    **Complete when:** Type checking, lint, unit tests, production build, complete integration tests, inventory, dependency audit, and secret scans pass.
    Review the final diff, migrations, test tooling, and unrelated work. Preserve user edits.
    Obtain approval for commits, pushes, and pull requests. Verify CI against the exact candidate intended for release.
    Record failed or unavailable checks. Earlier passing runs do not certify a changed candidate.

16. **MVP-16 — Verify hosted access and privacy controls.** Status: Partial; target review open.

    **Maps to:** R1/R9; FR-IAM-02, FR-IAM-03, FR-IAM-07, FR-IAM-09, FR-IAM-10, FR-IAM-11, FR-IAM-12, FR-MAT-04, NFR-AUTH-01, NFR-ISO-01, NFR-AUD-01, NFR-PRV-01.
    **Depends on:** Relevant changes require checks immediately; final review follows MVP-10, MVP-11, and MVP-15.
    **Complete when:** Customer, vendor, and staff boundaries pass in the target configuration, including direct requests and cross-organization denial.
    Verify audit records, consent behavior, private storage, and ranking independence for every exposed path.
    Enabled upload or AI paths must also satisfy NFR-DOC-01 or NFR-AI-01 and their functional controls.
    Do not add unrelated security features to close this task.

17. **MVP-17 — Verify monitoring, backup, deletion, and rollback.** Status: Partial; operational evidence open.

    **Maps to:** R8/R9; FR-ANL-01, FR-ANL-02, FR-ANL-03, FR-ANL-04, FR-RPT-05, NFR-AVL-01, NFR-OBS-01, NFR-PRV-02, NFR-REC-01, NFR-REC-02.
    **Depends on:** MVP-10 and the release candidate; privacy procedure from MVP-09.
    **Complete when:** Error alerts, availability checks, and basic intake-to-RFP tracking produce useful, consent-aware records.
    Perform and record a deletion drill, backup restoration, and deployment rollback rehearsal.
    Verify a recovery point within 24 hours and recovery time within eight hours.
    Assign quarterly restore tests and the 30-day deletion-request procedure, subject to applicable retention.
    Prepare monthly availability measurement against 99.9%. Measure the first complete month after launch.
    Preserve a compatible application version; use a forward database correction when rollback could lose records.

18. **MVP-18 — Complete staff acceptance.** Status: Open.

    **Maps to:** R3/R4/R8 portions; FR-EVL-05, FR-EVL-07, FR-RFP-03, FR-WRK-01, FR-ADM-02; R9 criticalBrowserJourneys.
    **Depends on:** MVP-07 and MVP-12 through MVP-17.
    **Complete when:** Rob and Jason complete a representative customer case using the intended screens and manual pilot procedure.
    Record their acceptance and resolve blockers before public release.
    The case must not require developer-only account switching or undocumented database edits.

19. **MVP-19 — Complete release evidence and approvals.** Status: Open.

    **Maps to:** R0/R9; all launch requirement portions; [R0 exit rules](module-r0-roadmap-and-public-release-control.md#exit-rules).
    **Depends on:** MVP-01 through MVP-18 and the exact reviewed release candidate.
    **Complete when:** Every release evidence category has a genuine dated reference and all R0 exit rules pass.
    Record approvals, the versioned release ID, and approved metadata and robots behavior.
    If release preparation changes code or configuration, repeat the affected checks and update the candidate evidence before approval.
    Test both blocked and approved release states. Inventory the main domain, aliases, and old deployment URLs.
    Protect or retire old URLs through separately approved actions. Preserve the design gallery and review history.
    Attach staging deployment checks and the rollback rehearsal before requesting production deployment approval.

20. **MVP-20 — Deploy and verify the initial release.** Status: Open.

    **Maps to:** R0/R9; NFR-AVL-01, NFR-REC-01, NFR-OBS-01; TECH_STACK Section 15.
    **Depends on:** MVP-19 and explicit approval for the relevant Git, cloud migration, and production actions.
    **Complete when:** Approved code and compatible migrations are deployed and live checks pass.
    Verify every public domain and alias, registration email, sign-in, permissions, RFP delivery, approved indexing, and active alerts.
    Add production check evidence to the release record. Support the first customer cases and record issues.
    If critical checks fail, restore the release block and use the tested recovery procedure.

## Product Decisions Still Open

These are recommendations, not approved new MVP features.
MVP-04 must record the chosen support method before it can be marked Ready.

| Decision | Recommendation | Existing requirement relationship | Approval state |
|---|---|---|---|
| Customer password recovery | Add a customer self-service recovery flow | Supports FR-IAM-01; the current MVP scope does not specify this screen | Open; product-owner decision required |
| Replacement confirmation email | Add a confirmation-email resend action | Supports FR-IAM-01 and FR-MKT-06; distinct from vendor invitation resend | Open; product-owner decision required |

An approved support-assisted method can satisfy the MVP operating decision if it is documented and tested.
Do not reset credentials through the staff MFA recovery exception or weaken identity checks.
Customer-visible scoring methodology remains a separate approval in MVP-01.

## Retained Later Work

All existing mandatory v2 requirements remain in scope.
The table identifies later software delivery, not completed requirements or deleted commitments.
Public pages must not promise these features before their qualifying release.
Any path enabled during the MVP must meet its applicable permissions, data, consent, and safety requirements.

| Later software work | Roadmap modules and PRD mappings | MVP handling |
|---|---|---|
| Customer RFP editing and richer clarification/amendment tools | R3/R4; FR-IAM-10, FR-RFP-01, FR-RFP-02, FR-RFP-04, FR-RFP-05 | Staff discussion and versioned approved RFP preparation |
| Automated RFP email, reminders, inbound processing, and document workflows | R4; FR-RFP-06, FR-CMN-01 through FR-CMN-04, FR-DOC-01 through FR-DOC-05 | Portal delivery plus recorded staff communication |
| Structured vendor responses and normalization | R4/R5; FR-RSP-01 through FR-RSP-06 | MMHR receives and reviews responses manually |
| Automated vendor acquisition and AI assistance | R2B/R5; FR-VND-02, FR-VND-03, FR-VND-04, FR-AI-01 through FR-AI-10 | Staff prepare and approve vendor facts; AI is not required for the pilot path |
| Demo coordination, proposals, and contract-handoff screens | R6; FR-DMO-01 through FR-DMO-03, FR-PRP-01 through FR-PRP-03, FR-CTR-01 through FR-CTR-04 | Staff coordination; direct customer/vendor contracting |
| Commission calculation, invoices, collection, and reconciliation screens | R7; FR-FIN-01 through FR-FIN-08 | Staff maintain approved commercial records and follow-up |
| Onboarding, renewals, and advanced reporting | R8; FR-CSM-01 through FR-CSM-05, FR-RPT-01 through FR-RPT-05, FR-CRM-09 | Staff follow-up and basic launch monitoring |
| Advanced CRM, collaboration, exports, and administration | R2B/R3/R8; remaining FR-CRM, FR-EVL, FR-WRK, and FR-ADM portions | Only the operational subset required by MVP-05 and MVP-07 |
| Managed content and expanded resource/newsletter tools | R2A; FR-MKT-04, FR-MKT-08, FR-MKT-11 | Reviewed content changes; every advertised form or resource must work |

The full [requirement traceability matrix](roadmap-v2-implementation.md#11-requirement-traceability-matrix) remains the inventory for all v2 requirements.
Impersonation remains Deferred. Category expansion and public ranking remain outside this MVP under their existing decision gates.

## Release Evidence Register

Update [scripts/r9-release-evidence.json](../../scripts/r9-release-evidence.json) only after the corresponding check has qualifying evidence.
Every category was pending when this checklist was created. This document does not change those values.

| Evidence key | Checklist task | Required record |
|---|---|---|
| standardCi | MVP-15 | Successful CI run for the reviewed candidate |
| integrationTests | MVP-15, MVP-16 | Complete integration results and target configuration evidence |
| criticalBrowserJourneys | MVP-12, MVP-13, MVP-18 | Hosted journey and staff acceptance records |
| accessibilityEvidence | MVP-14 | Keyboard, screen-reader, contrast, responsive, and automated checks |
| performanceEvidence | MVP-14 | LCP and INP results with method and limitations |
| availabilityMonitoring | MVP-17 | Configured monitoring and a successful alert test |
| deletionDrill | MVP-17 | Approved deletion procedure exercised with controlled records |
| restoreDrill | MVP-17 | Restore outcome and measured recovery point/time |
| securityReview | MVP-16 | Candidate and target access/privacy review |
| deploymentSmokeTest | MVP-19, MVP-20 | Staging checks before approval; live checks after deployment |
| rollbackRehearsal | MVP-17 | Compatible rollback or forward-recovery exercise |
| publicReleaseApproval | MVP-19, MVP-20 | Required owner approvals and separate production authorization |

Required package commands are `npm run type-check`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:integration`.
Also run `npm run check:integration-matrix`, `npm run check:dependency-audit`, and `npm run check:secrets`.
Use `npm run check:r9-evidence:release` only as an evidence gate, not as a substitute for the underlying checks.

## Existing Evidence and Limits

- The [September 13 workflow record](../../docs/security/r3-live-workflow-verification.md) verifies local saved intake through vendor delivery with synthetic records.
- That record reports 3,968 passing unit tests and a passing build. It does not certify later source changes or hosted deployment.
- Signup and email confirmation were not exercised in that browser run.
- The [matrix decision](../../docs/PRD.md#approved-mvp-comparison-design) approves the design. It does not prove application implementation.
- The [approval policy](../../docs/security/r4-approval-policy.md) supports staff self-approval. Its administration toggle remains later work.

## Change Record

- **2026-09-14, v1.1:** Linked the six build phases and provider research. Preserved all 20 task IDs, completion rules, and statuses.
- **2026-09-14:** User authorized one authoritative MVP checklist, requirement mapping, and alignment of development documents.
  Recorded the earlier MVP milestone, retained later v2 requirements, and separated recommendations from approved scope.
