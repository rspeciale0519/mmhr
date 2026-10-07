# MMHR code and completion audit — September 30, 2026

## Result

MMHR has a substantial tested foundation and a partly connected customer-to-RFP workflow.
It is not ready for a production launch.
It is also not a complete v2 brokerage operating platform.

The current code supports registration, intake, staff evaluation publication, customer selection, recorded disclosure, and approved RFP portal delivery.
Real launch data, complete browser acceptance, permanent hosted access, and operational evidence remain open.
Most later workflows have commands and database records, but lack complete application operation.

The dependency security gate failed during this audit.
The release evidence manifest also fails its required readiness check.
Passing unit tests and a production build do not remove either failure.

Use the [requirement matrix](code-audit-requirements-2026-09-30.md) for all 148 requirement decisions, source references, and remaining work.
Use the [MVP checklist](../.codex/plans/release-mvp-launch-checklist.md) for the 20 launch tasks.
This audit does not approve publication, vendor facts, permission changes, cloud changes, or deployment.

## Product purpose and delivery judgment

MMHR helps employers select HR software through a managed brokerage service.
Customers use a private workspace. Vendors receive controlled requests. Staff own the review, relationship, and commercial process.
Customers pay no MMHR fee. Vendor commissions must remain separate from recommendation scoring.
The customer and vendor negotiate and sign their contract directly.

The best next investment is a complete pilot workflow that staff can operate reliably.
Finish approved comparison data, guided customer intake, staff next actions, disclosure, and a real vendor handoff.
Keep the agreed manual process for later pilot activities explicit and traceable.
Then connect later software workflows in business order.

Do not lower the PRD to match isolated commands.
Do not treat a table, type, test fixture, or state validator as a delivered workflow.
Do not treat the manual pilot as completion of later v2 automation.

## Audit boundary and method

The audit used the current working tree on `codex/full-delivery-verification`, with local HEAD `a31b10c`.
The tree already contained substantial tracked and untracked work.
This audit includes that work; it is not a report about HEAD alone.
Application code was not changed by this task.

The requirement baseline is 132 functional requirements and 16 non-functional requirements in the canonical PRD.
Only FR-IAM-08 is deferred.
The audit also checked the state model, MVP milestone, launch checklist, architecture, migrations, configuration, and CI workflows.

The review used these evidence levels:

1. Read each requirement and its acceptance boundary.
2. Inspect relevant pages, actions, routers, domain functions, SQL, configuration, and tests.
3. Trace application and background entry points to their dependencies.
4. Search for consumers of isolated exports and provider interfaces.
5. Run local application checks and disposable database tests.
6. Keep hosted, provider, human approval, and operational evidence separate from local code evidence.

An automated TypeScript inventory covered 894 source and test files.
Static import tracing started from 65 application and background entry files and reached 234 files.
Of 94 command modules, 27 were reachable from those roots; 67 were not.
These counts include helper modules and type dependencies. They are not a feature completion percentage.
Operational scripts and direct database RPC calls are outside that import graph.
The review therefore checked SQL exposure separately; absence from the UI does not prove absence from the security boundary.

This is a complete requirement mapping with targeted source review and local execution evidence.
It is not a claim that every source line or possible runtime path was tested.
No current production database, real customer records, external provider delivery, or live deployment was verified.
The complete integration command could not start because `MIGRATION_DATABASE_URL` was missing.

## Requirement status

| Classification | Count | Meaning |
|---|---:|---|
| Implemented locally | 5 | Narrow required behavior exists in the application with local evidence |
| Connected partial | 45 | Application entry points reach part of the requirement |
| Backend partial | 70 | Commands or persistence exist; the complete operating workflow remains incomplete |
| Contract only | 20 | Rules, types, interfaces, or projections exist without complete operational composition |
| Evidence open | 7 | Required measurement or operational proof is missing |
| Deferred | 1 | The PRD defers impersonation |
| Total | 148 | Every canonical requirement has one matrix row |

The five locally implemented items are identity authentication, public page presence, Pulse homepage selection, consent-aware marketing analytics, and analytics consent enforcement.
They are FR-IAM-01, FR-MKT-01, FR-MKT-02, FR-ANL-01, and NFR-PRV-01.
The two consent requirements overlap by design in the PRD.
These counts do not measure effort, commercial value, or launch readiness.

The August roadmap count of six implemented requirements is historical.
FR-RFP-05 has amendment commands, but no complete application flow for creation, approval, and delivery of vendor amendments.
This audit classifies that requirement as backend partial.

## What is materially implemented

**Security foundation.** Verified Supabase claims, scoped authorization, RLS, permission defaults, audited commands, and replay receipts exist.
Customer registration creates a private workspace without administration rights.
Member and invitation controls use server procedures.
The identity worker handles approved identity administration intents.
See [authorization](../src/server/auth/authorization.ts), [membership procedures](../src/server/trpc/routers/memberships.ts), and [identity worker](../src/trigger/identity-admin-intents.ts).

**Customer evaluation path.** Customers can save intake and requirements, submit them, read published comparisons, and save up to five initial choices.
Staff can review evidence, publish masked evaluation versions, record disclosure, prepare an RFP, approve it, and deliver it to vendor portals.
The current comparison matrix is application code, not only a design preview.
See [customer evaluation](<../src/app/(app)/customer/evaluation/page.tsx>), [staff review](<../src/app/(admin)/admin/evaluations/review-controls.tsx>), and [RFP procedures](../src/server/trpc/routers/rfps.ts).

**Data controls.** Versioned vendor evidence, package scope, profile review, source ownership, freshness windows, and publication snapshots exist.
Approved facts and deterministic rules feed the customer comparison.
Unknown price and setup values remain unknown.
See [publication rules](../src/server/matching/option-publication-contract.ts) and [vendor evidence commands](../src/server/commands/vendor-evidence-database.ts).

**Marketing foundations.** Public routes, metadata, consent controls, lead capture, and a Beehiiv newsletter adapter exist.
A checked-in production block prevents public release without a matching approved release identifier.
See [newsletter adapter](../src/server/workflows/beehiiv-newsletter-service.ts) and [release block](../src/lib/public-release.ts).

**Later backend work.** CRM, candidate lifecycle, responses, demos, proposals, contracts, finance, onboarding, tasks, documents, and AI have extensive foundations.
Many commands have local persistence and isolation tests.
This work is reusable, but it does not yet provide the full staff, customer, and vendor workflows.

## Material findings

### A01 — The dependency security gate fails

`npm run check:dependency-audit` returned exit code 1 on September 30.
npm reported 30 affected dependency entries: 18 high and 12 moderate.
The report includes `brace-expansion`, `fast-uri`, and `ip-address`, with affected parent dependency chains.
Affected direct package chains include `@sentry/nextjs`, `eslint-config-next`, `shadcn`, and `trigger.dev`.
The count includes indirect dependencies; it is not a count of distinct application exploits.
The audit output reports no available fix for the reported root entries.

**Required result:** Review the dependency paths, select supported remediation, and rerun all relevant checks.
Do not run an automatic forced upgrade or weaken the required audit threshold.
The earlier September 5 zero-finding result cannot describe the current candidate.

### A02 — Many domains have no complete application workflow

The application exposes member, invitation, intake, evaluation, vendor evidence, and RFP procedures.
It does not expose complete staff workflows for deals, responses, demos, proposals, contracts, finance, onboarding, or reporting.
The vendor portal reads issued RFPs but does not provide the required response methods.
The command import analysis supports this finding; the individual matrix rows identify the missing behavior.

**Required result:** Deliver complete business flows with screens, commands, persistence, permissions, failures, and acceptance evidence.
Give every active case a visible owner, status, next action, due date, and review history.
Use the manual pilot procedure until the later software flows pass acceptance.

### A03 — Real catalog publication and customer acceptance remain open

The latest recorded catalog evidence is dated September 16, not this audit date.
It records eight active products and approved payroll-availability facts.
It records approved profiles for ADP, UKG, and BambooHR, with five other profile approvals still pending.
It also records unresolved scope or delivery facts and an unpublished mixed real/synthetic preview.
These records do not prove the current database state or a completed real customer comparison.

**Required result:** Complete each outstanding fact and profile review, then publish an approved real comparison.
Verify saved selections, evidence access, unknown values, refresh, failures, and narrow screens through the customer interface.
See the [profile review record](security/phase1-profile-approval-2026-09-16.md) and [Phase 1 implementation record](../.codex/plans/build-phase1-comparison-matrix.md).

### A04 — RFP drafting and delivery are narrower than the full PRD

The live staff form accepts manually composed RFP text.
It does not generate the complete questionnaire from approved intake.
Current delivery is portal delivery. It does not establish transactional email, acknowledgements, or reminder operation.
Amendment and clarification commands do not have complete customer and staff flows.

Manual drafting is permitted for the agreed MVP.
It does not complete FR-RFP-02 or the full RFP requirement group.
See [staff controls](<../src/app/(admin)/admin/evaluations/review-controls.tsx>) and [portal commands](../src/server/commands/rfp-portal.ts).

### A05 — Contract signing does not complete the commission workflow

Contract handoff and commission creation are separate commands.
No automatic composition connects a signed handoff to an eligible commission event.
The latest commission SQL validates an effective agreement and calculation, but accepts the supplied contract identifier and signing time.
It does not bind that event to a matching signed handoff record.

The event starts in `pending_review`.
The reviewed command path does not provide a complete calculation approval and invoice journey.
This is an integrity gap even though the focused commission tests pass.
See [contract SQL](../drizzle/0065_r6_contract_handoff_commands.sql), [finance SQL](../drizzle/0093_r7-finance-authorization.sql), and [commission command](../src/server/commands/commission.ts).

**Required result:** Link the signed contract, effective agreement, calculation, reviewer, and exactly one durable event.
Test duplicate signing, missing agreements, conflicting identifiers, recalculation, approval, and invoice readiness.
Preserve history and use reviewed forward migrations when this work is implemented.

### A06 — Financial closure is not enforced through the deal transition

`canFinanciallyCloseCommission` exists as a pure helper.
The deal command and SQL transition do not call or enforce that rule.
The deal model also lacks the PRD's explicit financial `Closed` state.

**Required result:** Check every related commission in the same transaction that closes a deal financially.
Require approved Paid, Voided, or Written Off outcomes.
Keep operational win status separate from financial closure.
See [commission rules](../src/server/finance/commission-contract.ts) and [deal SQL](../drizzle/0080_r2b_deal_commands.sql).

### A07 — State models differ across requirements and implementations

The PRD requires deal states including RFP, Demo, Stalled, Cancelled, Onboarding, and Closed.
The current deal enum instead uses a smaller sequence with `discovery` and `archived`.
Its TypeScript transition table allows a forward sequence, while SQL permits broader non-terminal movement.
Both differ from the complete PRD workflow.
Demo and other later lifecycle contracts also require reconciliation with the PRD minimum states.

**Required result:** Approve one transition specification before connecting these modules.
Test every allowed and denied transition through both TypeScript and direct SQL RPC calls.
Do not rename the PRD states merely to make existing tests pass.
See [PRD state model](PRD.md#6-state-models) and [deal contract](../src/server/crm/deal-contract.ts).

### A08 — External services and background processing remain incomplete

Document commands record metadata and scan states. They do not implement private byte storage or a real malware scanner.
Signed-access validation accepts a supplied URL; it does not create a storage-provider URL.
The upload-related contracts also differ in accepted file types and size limits.
Inbound email has an interface, but no complete provider webhook and durable ingestion path.

The two Trigger.dev entry files cover health and identity administration intents.
They do not establish document processing, RFP ingestion, transactional delivery, renewal reminders, or AI processing workers.
The Beehiiv adapter is an exception: actual provider-call code exists, although live delivery remains unverified.

**Required result:** Compose each required service through its approved internal interface, with durable work, retry rules, and visible failures.
Verify actual provider behavior before declaring that integration complete.

### A09 — AI execution, evidence, and approval are separate foundations

The AI service accepts injected adapters and validates output.
Routing, fixture evaluation, durable run commands, and an in-memory run repository exist separately.
Vendor extraction calls the service without the complete routing and durable run composition.
Reported run cost in the simple service is not measured provider cost.
There is no complete operational AI workflow with approved providers, persisted provenance, and consequential-output review.

**Required result:** Connect execution, schema validation, source artifacts, measured cost, failures, fixtures, and human approval as one workflow.
Keep AI outside recommendation scoring, permission decisions, RFP approval, and financial closure.
See [AI service](../src/server/ai/ai-service.ts), [routing](../src/server/ai/ai-routing-contract.ts), and [extraction command](../src/server/commands/vendor-extraction.ts).

### A10 — Reporting and event measurement are mostly contracts

Revenue, pipeline, vendor performance, customer journey, and work queues have pure projection functions.
They are not complete application reports backed by current database queries.
The analytics event contract defines funnel and workflow events, but `captureAnalyticsEvent` has no application call sites.
Consent-aware page views alone do not complete funnel and product analytics.

**Required result:** Capture real lifecycle events and build staff reports from authoritative records.
Verify currency, attribution, stage timing, exclusions, and sensitive-data handling.

### A11 — Security foundations need complete exposure verification

The inspected application paths use verified identity and scoped permission checks.
The direct server database pool bypasses RLS, so it cannot establish user authority by itself.
Many later SQL commands remain executable as authenticated RPCs, even without application imports.
Some later commands use broad workspace permission with higher assurance.
This audit does not claim an exploit, but the complete action and role matrix remains a release requirement.

**Required result:** Verify direct RPC calls, role changes, revocation, recovery restrictions, sensitive fields, and cross-organization denial on the release candidate.
Complete staff permission, sharing, and audit views without weakening server checks.
Preserve the existing deny-first design and recovery path.

### A12 — Release readiness remains unproved

All 12 categories in `scripts/r9-release-evidence.json` remain false with pending references.
They cover CI, integration, browsers, accessibility, performance, availability, deletion, restore, security, deployment, rollback, and public approval.
Operational evidence validators cannot establish the measured targets.
No current hosted journey, provider delivery, restore drill, deletion drill, or production monitoring result was verified here.

The local production build displays the release block.
This proves the current local build's behavior, not activation on an existing deployment.
Production deployment and live verification remain separate approved actions.

## Validation record

All results below refer to this audit session on September 30 unless stated otherwise.

| Check | Result | Limit |
|---|---|---|
| `npm run type-check -- --incremental false` | Passed | Run earlier in this same conversation against unchanged application source |
| `npm run lint` | Passed | Run earlier in this same conversation against unchanged application source |
| `npm test` | 364 files; 4,100 tests passed | Unit and component suite; not the database integration suite |
| `npm run build` | Passed; page generation completed at 71/71 | Includes retained design routes; this is not a feature count |
| `npm run check:integration-matrix` | Passed; 100 integration files | Inventory coverage, not proof those files all passed |
| `npm run test:integration` | Failed before tests started | `MIGRATION_DATABASE_URL is not set` |
| Empty-database migration suite | 11 tests passed | All 142 SQL migrations applied to a disposable database |
| Customer registration suite | 39 tests passed | Disposable database |
| Evaluation publication suite | 9 tests passed | Disposable database |
| Initial selection suite | 8 tests passed | Disposable database |
| Disclosure suite | 4 tests passed | Disposable database |
| CRM command suite | 3 tests passed | Disposable database |
| Commission suite | 5 tests passed | Tests existing behavior; does not close findings A05 or A06 |
| Deal suite | 1 test passed | Tests existing behavior; does not reconcile the state model |
| RFP approval suite | 8 tests passed | Disposable database |
| RFP distribution suite | 7 tests passed | Disposable database; does not prove actual email delivery |
| Vendor evidence suite | 1 test passed | Disposable database; does not approve real vendor facts |
| `npm run check:dependency-audit` | Failed; 18 high and 12 moderate dependency entries | Includes direct and indirect dependencies |
| `npm run check:secrets` | Passed; 1,156 tracked files inventoried | Defined high-confidence patterns and exclusions; untracked files are outside this script |
| `npm run check:r9-evidence:release` | Failed; all 12 categories pending | Expected release block; not accepted release evidence |
| Built-in browser, local production build | Release-block page rendered; no captured error or warning logs | No authenticated journey or browser network trace was verified |

The isolated database command format was:

```text
npm run test:integration -- src/server/db/<suite>.integration.test.ts
```

The first eight suites were `r1-empty-migration`, `r1-customer-registration`, `r3-evaluation-publication`, `r3-initial-selection`,
`r3-disclosure`, `r2b-crm-commands`, `r7-commission`, and `r2b-deal`.
The additional suites were `r4-rfp-approval`, `r4-rfp-distribution`, and `r2b-vendor-evidence`.
All 11 suites passed, with 96 tests in total.
The wrapper used disposable Docker databases and did not migrate a cloud or production database.
An earlier focused test batch had one five-second inventory timeout; its isolated rerun passed all four tests.
The later complete 4,100-test run passed without that failure.

The local runtime was Node.js 24.20.0. CI specifies Node.js 22.
Remote CI execution on the final candidate remains required.
The build emitted a Sentry `disableLogger` deprecation warning.
It also warned that the Next.js `middleware` convention is deprecated in favor of `proxy`.
The secret scan emitted a Node module-type warning. Neither warning caused a failed check.

Document validation confirmed exactly 148 unique matrix rows, with no missing or extra PRD identifiers.
All checked local Markdown link targets exist.
All 894 inventoried TypeScript source and test files retained their original hashes.
The document diff passed whitespace checks. Existing unrelated working-tree edits remain in place.

## Delivery order

Keep the existing six phases and 20 MVP task IDs.
The checklist now has 15 Partial and five Open tasks. None is Ready or Released.
MVP-07 advanced from Open to Partial because the [manual pilot procedure draft](mvp-pilot-operating-procedure.md) now exists.
Operating setup and staff rehearsal remain open.
Use these priorities inside that sequence:

1. Finish Phase 1 with approved real catalog data and a complete customer comparison check.
2. Prepare stable staging and permanent accounts, including the agreed account-support process.
3. Complete daily staff operation, customer review, recorded disclosure, and a real vendor portal handoff.
4. Rehearse the manual pilot procedure through responses, selection, contract status, commission tracking, and onboarding.
5. Resolve dependency findings and all required privacy, accessibility, performance, recovery, and hosted journey checks.
6. Complete staff acceptance, evidence approval, and the separately approved deployment and live checks.

Work on dependency remediation can proceed alongside the remaining pilot implementation after repair authorization.
Neither activity permits a production release before the gates pass.

For later v2 delivery, connect response intake and review first.
Then connect demos, proposals, selection, and contract handoff.
Complete finance integrity and closure before financial operation depends on the software.
Next connect onboarding, renewals, task queues, and reports.
Introduce AI and automated acquisition only with the required service, provenance, review, and failure controls.

## Completion rules for future updates

Every completion claim must identify the requirement, user entry point, server enforcement, stored result, failure behavior, and dated verification.
A release claim must also identify the deployed candidate and accepted operational evidence.
Record historical evidence with its date. Do not silently present it as a current database or deployment check.
Keep the full v2 requirement set unchanged unless the owner makes an explicit scope decision.

The audit updates documentation only.
All implementation defects, catalog decisions, provider activation, and release actions remain open until their own checks and approvals pass.
