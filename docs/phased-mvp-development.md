# MMHR Phased MVP Development

> **Delivery notice, October 7, 2026.** The product owner approved the [MVP complete UI/UX and backend roadmap, version 1.1](../.codex/plans/build-mvp-complete-ui-ux-roadmap-2026-10-06.md).
> It replaces the October 3 instruction to complete all mandatory software before live use.
> Launch Candidate A ships after roadmap phase P2. Launch Candidate B adds demos, proposals, and contract handoff after P3.
> Financial-record management and private document storage are outside the MVP.
> Where this document conflicts with the roadmap on launch scope or delivery order, follow the roadmap.
> Roadmap phases P0 to P5 replace the phase order in this document.
> A full rewrite follows the launch.

## Document control

| Field | Value |
|---|---|
| Version | 1.2 |
| Date | 2026-09-30 |
| Status | Phase 1 implementation active; catalog and scoring policy approved; vendor fact review remains open |
| Product owner | Rob Speciale |
| Staff acceptance | Rob and Jason |
| Task authority | [MVP launch checklist](../.codex/plans/release-mvp-launch-checklist.md) |
| Product authority | [PRD](PRD.md) |
| Architecture authority | [TECH_STACK](TECH_STACK.md) |
| Full product roadmap | [v2 implementation roadmap](../.codex/plans/roadmap-v2-implementation.md) |
| Release authority | [R0 release control](../.codex/plans/module-r0-roadmap-and-public-release-control.md) |

This document groups the existing 20 launch tasks into six build phases.
It also provides the goal prompt for the first phase.
The user requested this document in the project docs folder.
Writing this plan does not start implementation or approve deployment.

The launch checklist remains the task record.
It owns task IDs, requirement mappings, dependencies, completion checks, and status.
This document owns phase grouping and explains the recommended build order.
Keep both documents linked to avoid two competing task lists.

No task status changes through this planning document.
Do not treat a phase description as evidence that its work is complete.

The [September 30 code audit](code-audit-2026-09-30.md) verifies the current implementation against all 148 requirements.
No phase is closed by that audit. Phase 1 still needs approved real publication and complete customer comparison acceptance.
Later backend commands do not establish completed later phases.
The launch checklist now records the audit gaps for each of its 20 tasks.
Resolve the failed dependency security gate before release, alongside the remaining implementation after repair authorization.
The user started the Phase 1 goal on September 15, 2026.
Use the [implementation record](../.codex/plans/build-phase1-comparison-matrix.md) for current work and evidence.
Each goal covers one phase only.
After that phase passes, prepare the next phase's goal prompt for user review.
Wait for authorization before starting the next phase.

## Launch outcome and scope

The MVP supports registration, saved requirements, staff review, vendor comparison, initial selections, disclosure, and approved RFP portal delivery.
Staff prepare the RFP after discussing requirements with the customer.
Vendor names remain masked until that discussion and recorded disclosure.
Customers can see all published options and initially select up to five.

Separate staff RFP approval remains off for the two-person team.
The staff member who creates the draft can approve it.
MMHR approval and its audit record remain required.
A customer draft still requires MMHR approval.
The configuration can support a later policy change; an administration toggle is not required for this launch.

Staff handle responses, demos, proposals, contracts, commissions, and onboarding during the pilot.
The customer and vendor negotiate and sign directly.
The [retained later work](../.codex/plans/release-mvp-launch-checklist.md#retained-later-work) remains part of the full product roadmap.

## Recommended phase order

| Phase | Build group | Existing task IDs | Result |
|---|---|---|---|
| 1 | Vendor catalog and comparison | MVP-01, MVP-02, MVP-03 | Approved data and rules support the working Comparison matrix |
| 2 | Hosted environment and account access | MVP-10, MVP-11, MVP-04 | Restricted staging and normal customer, staff, and vendor access |
| 3 | Customer, staff, and vendor operation | MVP-05, MVP-06, MVP-07 | Staff can run a customer case through vendor handoff |
| 4 | Public content, policies, and disclosures | MVP-08, MVP-09 | Public statements match the service and operating procedure |
| 5 | Complete candidate verification and operational readiness | MVP-12, MVP-13, MVP-14, MVP-15, MVP-16, MVP-17 | Tested workflows, release candidate, and recovery procedures |
| 6 | Staff acceptance and controlled launch | MVP-18, MVP-19, MVP-20 | Accepted service, approved release, and verified production operation |

Tasks MVP-10 and MVP-11 move ahead of the hosted completion checks for account access and vendor delivery.
Those checks already depend on the environment and intended accounts.
This grouping changes execution order without changing task IDs or requirements.

Each task has one primary phase in the mapping below.
Preparation can start earlier when dependencies permit.
Run focused tests during every implementation phase.
Phase 5 completes candidate-wide evidence; it does not postpone testing.

## Complete task mapping

Task names below match the existing checklist.
Use its [ordered task list](../.codex/plans/release-mvp-launch-checklist.md#ordered-launch-checklist) for the detailed completion rules.

| Task ID | Existing task name | Primary phase |
|---|---|---|
| MVP-01 | Approve the initial vendor catalog and scoring rules. | 1 |
| MVP-02 | Complete the live comparison data. | 1 |
| MVP-03 | Implement the approved Comparison matrix. | 1 |
| MVP-04 | Complete customer registration and account access. | 2 |
| MVP-05 | Complete everyday customer and staff operation. | 3 |
| MVP-06 | Complete the real vendor handoff. | 3 |
| MVP-07 | Prepare the manual pilot operating procedure. | 3 |
| MVP-08 | Approve public content and working entry points. | 4 |
| MVP-09 | Approve policies and disclosures. | 4 |
| MVP-10 | Prepare usable staging and the production configuration. | 2 |
| MVP-11 | Prepare permanent staff and vendor access. | 2 |
| MVP-12 | Verify the full hosted journey. | 5 |
| MVP-13 | Resolve failure and recovery behavior. | 5 |
| MVP-14 | Verify accessibility and performance. | 5 |
| MVP-15 | Verify the engineering release candidate. | 5 |
| MVP-16 | Verify hosted access and privacy controls. | 5 |
| MVP-17 | Verify monitoring, backup, deletion, and rollback. | 5 |
| MVP-18 | Complete staff acceptance. | 6 |
| MVP-19 | Complete release evidence and approvals. | 6 |
| MVP-20 | Deploy and verify the initial release. | 6 |

## Phase 1: Vendor catalog and comparison

**Tasks:** MVP-01, MVP-02, MVP-03.

**Outcome:** A customer compares published vendor options against saved requirements in the approved matrix.

These tasks belong together because the interface needs approved facts and a defined scoring method.
A finished design cannot provide useful comparisons without that data.

**Dependencies:** Reuse the existing identity, vendor-evidence, requirement, publication, selection, and disclosure foundations.
Inspect them before making changes.
The [September 13 workflow evidence](security/r3-live-workflow-verification.md) is a dated local baseline, not proof of the new matrix.

**Build order:**

1. Prepare the launch catalog and scoring decision package from the provider research.
2. Obtain the required product decisions before publishing approved facts or scoring rules.
3. Extend approved evidence and publication data for the matrix.
4. Add only the staff controls required to maintain and publish that data.
5. Implement the approved matrix using the real customer workflow.
6. Verify data, selections, masking, error states, and browser behavior.

Neutral interface and contract work can use clearly synthetic test records while product decisions remain pending.
That work cannot close MVP-01 or establish approval for real vendor records.

**Affected areas:** Vendor evidence, matching rules, publication contracts, database access, customer evaluation, and existing staff publication controls.
See [implementation notes](#phase-1-implementation-notes) for inspected source paths and constraints.

**Exit:** All three checklist completion checks pass with dated evidence.
Rob approves the launch catalog and scoring decisions.
Staff can publish approved comparison data.
Customers can inspect all options and save up to five initial selections.
Unknown estimates remain explicit when approved information is unavailable.

**Risk and recovery:** Incorrect facts or scoring can mislead customers.
Use reviewed sources, versioned rules, immutable publications, and correction procedures.
Use additive database changes where practical.
Record compatible migration and application recovery steps.

**Approval points:** Catalog, customer-visible scoring, required module decisions, and any new production dependency.
Routine implementation uses the existing approved scope.
This phase does not require production deployment.

## Phase 2: Hosted environment and account access

**Tasks:** MVP-10, MVP-11, MVP-04.

**Outcome:** Restricted staging supports the intended customer, staff, and vendor sign-in paths.

Environment, email, memberships, and registration belong together because local fixtures cannot verify hosted access.

**Dependencies:** Use the reviewed deployment plan and existing identity foundations.
Prepare configuration early.
Complete hosted checks only after staging is usable.

**Build order:**

1. Prepare reviewed staging and production configuration under MVP-10.
2. Obtain approval for required cloud and account changes.
3. Establish the intended staff and vendor access under MVP-11.
4. Complete fresh customer registration, confirmation, sign-in, workspace creation, and sign-out under MVP-04.
5. Record and test the chosen account-support method.

Password recovery and confirmation-email replacement remain open product decisions.
The checklist recommends self-service flows.
An approved support-assisted procedure can satisfy the MVP operating decision.
Do not treat either recommendation as an approved feature.

**Affected areas:** Hosting, Supabase environments, email, domains, authentication, account setup, memberships, and deployment records.

**Exit:** All three tasks pass their checklist checks in the target environment.
Rob, Jason, and intended vendor users can use normal access.
A fresh customer can register without administration rights.
Staff MFA and recovery remain functional.

**Risk and recovery:** Incorrect environment or membership settings can block access or expose records.
Keep staging separate, record configuration changes, and verify permission boundaries.
Document recovery before applying hosted changes.

**Approval points:** Cloud changes, account or permission changes, and unresolved account-support choices.
Preparing production configuration does not authorize production migrations or deployment.

## Phase 3: Customer, staff, and vendor operation

**Tasks:** MVP-05, MVP-06, MVP-07.

**Outcome:** MMHR can operate a customer case through approved vendor handoff without developer assistance.

These tasks connect the customer screens, staff actions, vendor portal, and manual pilot procedure.

**Dependencies:** Phase 1 supplies the comparison.
Phase 2 supplies hosted access and intended recipient accounts.
The manual procedure can be drafted earlier.

**Build order:**

1. Complete customer save, resume, submit, and next-step behavior.
2. Complete staff case discovery, evidence maintenance, comparison publication, discussion records, and RFP preparation.
3. Verify staff approval and delivery of the correct RFP version.
4. Verify customer and vendor reads under their intended permissions.
5. Finalize the manual procedure against the actual screens and delivery behavior.

Assign an owner, contact method, response expectation, record location, and escalation route for each manual activity.
Include vendor notices, responses, demos, proposals, contract outcomes, commissions, and onboarding.
Prepare message templates without sending messages during document preparation.

**Affected areas:** Customer intake, staff case controls, RFP approval, portal delivery, vendor access, and operating documentation.

**Exit:** All three tasks pass their checklist checks.
Routine cases use the intended interface and documented procedure.
Synthetic fixture launchers and undocumented database edits are unnecessary for normal operation.

**Risk and recovery:** Incorrect recipients or versions can produce an invalid handoff.
Verify recipient scope, approval history, repeat-request behavior, and recoverable delivery failures.
Preserve the agreed staff self-approval policy.

**Approval points:** Required operating decisions and any real outbound messages or external changes.

## Phase 4: Public content, policies, and disclosures

**Tasks:** MVP-08, MVP-09.

**Outcome:** Public pages and customer disclosures describe the actual launch service.

These tasks belong together because service claims and policies must agree with the approved catalog and operating procedure.

**Dependencies:** Phase 1 supplies approved vendor and scoring facts.
Phase 3 supplies actual business practices.
Content inventory and draft review can start earlier.

**Build order:**

1. Review each public claim and its evidence.
2. Make approved content corrections and verify advertised entry points.
3. Align policies, sharing consent, commission disclosures, retention, and scoring explanations.
4. Record the required reviews in R0.

**Affected areas:** Marketing routes, forms, lead routing, public resources, policies, consent, and release records.

**Exit:** Both tasks pass their checklist checks.
Every advertised form and resource works.
Approved statements match the implemented service.
The design gallery remains available under the existing release rules.

**Risk and recovery:** Research statements or preview examples can be mistaken for verified service claims.
Keep source evidence and approval records distinct.
Preserve reviewed history and the public-release block until release approval.

**Approval points:** Public claims, policies, disclosures, and relevant owner reviews.
The research document does not supply these approvals.

## Phase 5: Complete candidate verification and operational readiness

**Tasks:** MVP-12, MVP-13, MVP-14, MVP-15, MVP-16, MVP-17.

**Outcome:** A specific hosted release candidate has complete workflow and operational evidence.

These tasks use the same candidate, environment, and representative records.
Their results must describe the version that will receive launch approval.

**Dependencies:** Phases 1–4 supply the workflow, accounts, approved content, and operating procedure.
Continue focused verification throughout earlier phases.
Prepare monitoring and recovery arrangements during environment work.

**Completion order:**

1. Verify fresh registration through approved RFP delivery in the native browser.
2. Resolve failure and recovery defects found across the journey.
3. Complete accessibility and performance checks on the resulting candidate.
4. Complete engineering checks and CI for the exact reviewed candidate.
5. Verify hosted access, privacy, audit records, consent, and ranking independence.
6. Complete monitoring, deletion, restore, and rollback exercises.

Recheck affected evidence whenever a fix changes the candidate.
Record the cause or remaining uncertainty of the earlier intermittent requirement-save failure.
Do not add unrelated security features to satisfy access verification.

**Affected areas:** Critical screens, failure handling, tests, CI, hosted permissions, alerts, backups, deletion, and deployment recovery.

**Exit:** All six checklist tasks pass with dated evidence and stated measurement limits.
Required checks include type checking, lint, unit tests, build, complete integration tests, inventory, dependency audit, and secret scans.
Use the existing checklist for accessibility, performance, availability, deletion, and recovery targets.
Laboratory performance results are not real-user field measurements.
Measure monthly availability after launch as the checklist requires.

**Risk and recovery:** Old local results can be mistaken for current hosted evidence.
Record candidate identity, migration level, environment, roles, method, and results.
Use controlled records for drills.
Prefer a forward database correction when rollback could lose records.

**Approval points:** Git delivery, hosted changes, destructive exercises, and any production action remain separately controlled.
Prepare each proposed action before requesting its required approval.

## Phase 6: Staff acceptance and controlled launch

**Tasks:** MVP-18, MVP-19, MVP-20.

**Outcome:** Rob and Jason accept the service before an approved production release.

Acceptance, release evidence, and deployment belong together because each depends on the same verified candidate.

**Dependencies:** MVP-07 and Phase 5 must support staff acceptance.
All tasks through MVP-18 must satisfy the release evidence and R0 checks.

**Build and release order:**

1. Have Rob and Jason complete a representative case using the intended screens and manual procedure.
2. Resolve acceptance blockers and repeat affected checks.
3. Complete all release evidence categories and R0 exit rules.
4. Record the approved candidate, release ID, domains, metadata, and indexing behavior.
5. Request the required Git, cloud migration, and production approvals.
6. Deploy approved code and compatible migrations.
7. Verify live domains, email, access, RFP delivery, indexing, and alerts.
8. Support the first customer cases and record issues.

**Affected areas:** Staff acceptance records, R0 controls, R9 evidence, deployment, live checks, and launch support.

**Exit:** MVP-18 and MVP-19 meet their completion checks.
MVP-20 reaches Released only after authorized deployment and successful live checks.

**Risk and recovery:** Production behavior can differ from staging.
Use the tested recovery procedure if critical live checks fail.
Restore the release block when required.
Preserve records during recovery.

**Approval points:** Required owner acceptance and release approval.
Approval of this development document does not authorize Git actions, cloud migrations, or production deployment.

## Research use across the tasks

Use [50-provider HRIS and payroll research](hris-payroll-provider-research-2026-09-14.md) as the starting evidence inventory.
The user selected US employers first, with global options included.
The research is a candidate pool, not a ranking or approved launch catalog.
Public feature inventories cannot establish every subscription entitlement or deployment behavior.

| Task | Required use of the research | Limit |
|---|---|---|
| MVP-01 | Propose launch products, source records, capability fields, and verification questions | Obtain product, plan, region, freshness, and scoring approvals |
| MVP-02 | Populate approved comparison facts and evidence references | Missing pricing, setup, or feature facts remain unknown |
| MVP-05 | Define staff review and maintenance work for approved vendor records | A research import cannot replace review or approval |
| MVP-08 | Locate sources for proposed vendor-related statements | Public claims still require their own review and approval |

Do not force all 50 providers into the launch catalog.
Prepare a practical proposed catalog for Rob to review.
Keep deferred providers in the research pool with their unresolved questions.
Count distinct products carefully when acquisitions, renamed products, or shared payroll services occur.
Recheck source currency during implementation.

## Phase 1 implementation notes

These observations come from source inspection on September 14, 2026.
Recheck them before implementation.
They define starting points, not a replacement architecture.

| Existing area | Source starting point | Implementation constraint |
|---|---|---|
| Approved design | [PRD comparison design](PRD.md#approved-mvp-comparison-design) | Use the matrix and its complete display requirements |
| Vendor evidence | [vendor-evidence-contract.ts](../src/server/crm/vendor-evidence-contract.ts) | Preserve source, review, approval, expiry, and override rules |
| Publication data | [option-publication-contract.ts](../src/server/matching/option-publication-contract.ts) | Extend the published contract for missing matrix details |
| Publication commands | [evaluation-publication.ts](../src/server/commands/evaluation-publication.ts) | Keep the existing publication and permission path |
| Application procedures | [evaluations router](../src/server/trpc/routers/evaluations.ts) | Find all readers, writers, schemas, and tests before changing contracts |
| Customer interface | [evaluation-options.tsx](../src/app/%28app%29/customer/evaluation/evaluation-options.tsx) | Preserve pagination, saved choices, conflict handling, and retry behavior |
| Staff controls | [publication-controls.tsx](../src/app/%28admin%29/admin/evaluations/publication-controls.tsx) | Extend only controls needed for Phase 1 |
| Database publication model | [r3-publication.ts](../src/server/db/schema/r3-publication.ts) | Keep approved facts, rules, and immutable publication versions consistent |
| Local startup | [MVP local operation](mvp-local-operation.md) | Reuse a healthy project server and existing approved test setup |

The inspected publication contract contains scores, coverage, fit reasons, limitations, and freshness.
It does not yet contain the complete feature, annual-cost, and setup fields required by the matrix.
The current coverage calculation measures weighted evidence availability.
It is not a calibrated probability of customer success.

The existing eligibility logic treats some missing required facts differently from a completely empty fact set.
Explain this behavior in the scoring decision package.
Agree on the missing-data policy before changing results.
Keep database scoring and its TypeScript reference consistent.

The publication page size is 50.
It is not the total number of options that the customer can inspect.
Preserve pagination beyond one page and keep the separate five-selection rule.

Evidence can reveal a masked vendor through source URLs, branded text, images, or response fields.
Provide useful masked evidence details before disclosure.
Allow identity-bearing evidence only through the permitted disclosure or staff path.

Use approved estimates only when their basis is clear.
Annual cost needs currency, assumptions, included modules, and relevant exclusions.
Setup estimates need a time unit, scope, source date, and stated uncertainty.
Unknown values are valid displays; invented numbers are not.

Do not build a separate scoring engine in the browser.
Do not confuse later demo scorecards with the initial published fit score.
Avoid a parallel comparison path when the current publication workflow can support the matrix.

## Verification and release evidence

Each implementation phase needs focused checks and review of its changed files.
Database, authentication, migration, and query changes need local integration evidence.
Rendered changes need native browser verification.
Documentation-only changes need text, link, path, and command checks.

Keep completion evidence in the checklist through dated references.
The [release evidence register](../.codex/plans/release-mvp-launch-checklist.md#release-evidence-register) retains all 12 existing categories.
Phases 5 and 6 close those categories against the actual candidate.
All [R0 exit rules](../.codex/plans/module-r0-roadmap-and-public-release-control.md#exit-rules) remain required.
Do not mark release evidence passed from this plan or from local component previews.

## Phase 1 goal prompt

Status: authorized for Phase 1 execution on September 15, 2026; later phases remain unapproved.
The prompt defines scope, decisions, checks, and completion evidence.
Successful completion still depends on approved facts, product decisions, a working environment, and passing verification.

Copy the following prompt when Phase 1 is approved.
The prompt contains 3904 characters with LF line breaks, or 3922 with CRLF line breaks.
Both counts include spaces and punctuation; code fences are excluded.

<!-- phase-one-goal:start -->
```text
Complete only Phase 1 of the MMHR MVP: MVP-01, MVP-02, and MVP-03. Deliver the approved Comparison matrix using saved customer requirements and approved, published vendor data. Stop after Phase 1 for my review.

Read AGENTS.md and required project memory first. Follow docs/phased-mvp-development.md. Follow .codex/plans/release-mvp-launch-checklist.md and its completion checks. Read docs/PRD.md and docs/TECH_STACK.md. Inspect current code, tests, migrations, and installed versions before editing.

Use docs/hris-payroll-provider-research-2026-09-14.md for the catalog, prioritizing US employers. Keep all 50 as candidates; propose a practical launch subset. Distinguish products, plans, regions, payroll methods, duplicate products, restrictions, and missing facts. Record permitted sources, review dates, and freshness periods. Separate native features, paid additions, partner services, limited support, confirmed absence, and unknown information.

Prepare one scoring recommendation with worked examples. Explain eligibility, weights, missing-data treatment, evidence coverage, freshness, and ordering. Keep commissions, commercial relationships, and payment status outside scoring and ordering. Obtain Rob's approval for the proposed catalog and scoring rules before publishing them. Reuse recorded approvals and continue independent work while decisions are pending.

Extend existing evidence, publication, and staff controls. Preserve versioned facts and rules, immutable publications, permissions, pagination, saved selections, stale-data checks, and safe retries. Keep database and application scoring consistent. Show fit separately from evidence coverage. Use supported cost and setup estimates with units, assumptions, restrictions, and dates. Show unknown values; never invent facts or prices.

Build the customer matrix with vendor columns, requirement rows, sticky labels, and contained horizontal scrolling. Show fit, annual cost, required features met, feature coverage, evidence coverage, setup estimates, and evidence details. Use Pulse styling and clear selection states. Display all published options; enforce the five-initial-selection limit on the server. Preserve choices after save and refresh. Mask vendor identities until the required discussion and disclosure are recorded.

Check links, branded text, images, and returned data for identity leaks. Support keyboard use, narrow screens, and loading, empty, error, retry, stale, and successful-save states. Preserve the gallery and existing approval, consent, audit, and ranking controls. Keep separate staff RFP approval off; retain MMHR approval. Leave later features and unrelated redesigns outside this phase.

Run focused tests, type checking, lint, unit tests, and the production build. Run local integration tests for database, authentication, migration, or query changes. Run relevant inventory, dependency, and secret checks. Test scoring, missing or expired facts, organization isolation, masking, pagination, selection limits, persistence, failures, and duplicate requests. Verify the real workflow in the native browser using approved accounts and a healthy server. Check console/network errors and affected Pulse themes and routes.

Preserve unrelated work and follow existing architecture. Review migrations and document compatibility and recovery before local application. Respect required approvals for external writes, permissions, dependencies, and Git actions. Do not deploy, apply cloud migrations, expose secrets, or expand scope.

Provide the screen, approvals, change summary, and dated test/browser evidence. Update the checklist, documentation, and memory accurately. Report failed checks and missing approvals; never claim completion while requirements remain open. Local checks do not close hosted release evidence. After Phase 1 passes, provide the Phase 2 prompt for review. Do not start Phase 2.
```
<!-- phase-one-goal:end -->

## Change record

- **2026-09-14, v1.1:** Shortened the goal prompt to meet the 4,000-character limit, including spaces and punctuation.
  Confirmed that each goal covers one phase and requires review before the next phase starts.
- **2026-09-14:** Created six build phases with an exact mapping to the existing 20 launch tasks.
  Connected provider research to MVP-01, MVP-02, MVP-05, and MVP-08.
  Added the Phase 1 goal prompt for user review.
  No task was marked complete and no implementation or release action was authorized.
