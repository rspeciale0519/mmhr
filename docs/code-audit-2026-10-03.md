# MMHR code audit for October 3 2026

MMHR has more usable local workflows than the September 30 audit recorded. The complete product and live launch remain unfinished.
The main blockers are finance integrity, application email, document processing, ordinary staff operation, dependency security, and accepted release evidence.

The [requirement matrix](code-audit-requirements-2026-10-03.md) maps all 148 canonical requirements.
It records existing behavior, remaining work, source and test references, priorities, and acceptance targets.
The historical [September 30 report](code-audit-2026-09-30.md) and [matrix](code-audit-requirements-2026-09-30.md) remain unchanged.

## Scope and inspection boundary

Product authority is [PRD version 2.5](PRD.md). Architecture authority is [TECH_STACK version 2.7](TECH_STACK.md).
All mandatory requirements remain in scope. A manual pilot does not complete a corresponding software requirement.
MMHR supports private HR software selection, vendor coordination, CRM, commission operation, and customer success.
Customers pay vendors directly. Vendor commissions must remain outside recommendation scoring.

The audit inspected branch `codex/full-delivery-verification`, HEAD `a31b10c73d0b7bdbda6f10251515e1dbf327aa96`, with its existing uncommitted work.
This is the Phase 1 baseline before the subsequent October 3 finance safety correction.
Planned corrections are not implementation evidence in this record.
Later source changes require their own dated supplement and relevant checks.

The audit used these methods:

1. Compare every matrix identifier with the canonical requirement inventory.
2. Read canonical product behavior, state models, acceptance rules, architecture boundaries, and release policy.
3. Inspect routes, server actions, tRPC registration, provider adapters, task entry points, and their command consumers.
4. Read changed workflow commands and selected SQL controls for associations, authority, receipts, states, and failure behavior.
5. Check existing matrix source locations and their production consumers using TypeScript import inspection.
6. Compare current code with dated local database, Auth, Storage, scanner, browser, and gate records.
7. Retain incomplete status when a mandatory method, integration, interface, or acceptance result remains missing.

The inventory maps all requirements. This is not an exhaustive review of every source line or every runtime path.
Import inspection supports reachability findings. It does not prove runtime operation or expose every dynamic import and SQL entry point.
Authenticated SQL RPCs remain exposed even when no application component imports their TypeScript wrappers.
A schema, fixture, pure rule, unused command, or test count cannot establish a complete workflow.

No application test, hosted check, provider call, or database migration ran during this documentation audit.
Runtime results below retain their original dates and limits.
The audit reads saved evidence; it does not present previous tests as a new October 3 execution.
It does not read private environment values or grant authority for deployment, catalog approval, or cloud changes.

## Current requirement classifications

| Classification | September 30 | October 3 | Meaning |
|---|---:|---:|---|
| Implemented locally | 5 | 5 | Narrow stated behavior has local code and evidence |
| Connected partial | 45 | 72 | Application entry points reach part of the mandatory behavior |
| Backend partial | 70 | 43 | Stored commands exist without the complete application workflow |
| Contract only | 20 | 20 | Rules or interfaces exist without complete operational composition |
| Evidence open | 7 | 7 | Required measurements or operational proof remain missing |
| Deferred | 1 | 1 | The PRD defers impersonation |
| Total | 148 | 148 | 132 functional and 16 non-functional requirements |

Twenty-seven rows move from backend partial to connected partial.
Thirty-seven rows receive updated behavior, references, or remaining work.
The five narrow local classifications remain identity authentication, public page presence, Pulse selection, consent-aware analytics, and consent enforcement.
Their identifiers are FR-IAM-01, FR-MKT-01, FR-MKT-02, FR-ANL-01, and NFR-PRV-01.

These counts are not a project completion percentage.
Five narrow local classifications do not mean that only five features exist.
The new portal workflows provide substantial usable behavior, while complete requirement acceptance remains open.
Requirements differ greatly in effort and value. Some also overlap by design.
An unweighted row ratio would misrepresent the product.

Use separate implementation and launch records.
Implementation acceptance needs the required behavior, normal entry point, server enforcement, stored result, failure behavior, and dated checks.
Launch readiness also needs accepted evidence for the exact deployed candidate and separately approved external actions.

## Existing usable local workflows

### Registration and initial evaluation

Customers register, receive private workspaces, save intake and requirements, and read published masked comparisons.
Initial choices retain state and enforce the five-selection limit without limiting displayed approved options.
Staff review evidence, publish comparisons, record discussion and disclosure, prepare an RFP, approve it, and deliver it to vendor portals.
These paths existed in the September 30 baseline.

Current sources include [intake procedures](../src/server/trpc/routers/intakes.ts), [evaluation procedures](../src/server/trpc/routers/evaluations.ts), and [RFP procedures](../src/server/trpc/routers/rfps.ts).
Real catalog approval, publication, permanent-account acceptance, questionnaire generation, amendments, and delivery automation remain open.

### Portal replies and clarifications

Vendors submit structured replies against their exact delivered recipient.
Immutable revisions preserve the original statements and normalization records.
Staff review replies. A different staff member approves or rejects them.
Customers read approved results; a later pending revision retains the preceding approved result.

Staff questions bind to the exact reply and a deadline.
Vendors answer and can link a newer revision from that same recipient.
A separate staff decision cannot approve an otherwise pending response.
Customer reads omit pending associations and private decision fields.

See [reply commands](../src/server/commands/rfp-portal-response.ts), [clarification commands](../src/server/commands/portal-clarification.ts), [reply evidence](security/r4-portal-responses.md), and [clarification evidence](security/r4-portal-clarifications.md).
Email replies, response-document attachment intake, automatic reminders, extraction, and complete operator recovery remain unfinished.

### Demos and proposal quotes

Staff capture demo plans. Customers and vendors provide zoned availability.
Only staff confirms a schedule accepted by both parties.
Conflicts, changes, cancellation, immutable histories, and recorded outcomes have synthetic local evidence.
Automatic notices, reminders, approved evidence selection, and complete scorecard operation remain open.

Vendors submit structured quotes with exact minor-unit prices and original source text.
Separate staff approval gates quote and comparison visibility.
Comparisons freeze approved source versions across vendors within one customer intake.
Pending revisions remain private. Approved historical records retain their original prices and sources.
Approved source-file attachments, email intake, extraction, and complete proposal acceptance remain open.

See [demo commands](../src/server/commands/demo-coordination.ts), [quote commands](../src/server/commands/proposal-quotes.ts), [demo evidence](security/r6-demo-coordination.md), and [quote evidence](security/r6-proposal-pricing.md).

### Selection and contract handoff

Customers select an approved quote and record reasons and risks.
A separate staff account approves the selection.
Staff record introduction, negotiation status, and reported contract outcomes.
Customer and vendor screens retain scoped histories and hide private staff notes.

Registered browser evidence records a synthetic signed outcome on an open deal at `contracting`.
Reported signing does not establish legal document validity, an eligible commission, a payment, or financial closure.
Withdrawal, rejection, and every alternate terminal browser route remain unverified in the current registered rehearsal.

See [contract commands](../src/server/commands/contract-handoff-portal.ts), [registered controls](../drizzle/0154_r6_portal_contract_handoff.sql), and [contract evidence](security/r6-contract-portal.md).

### Private documents

Customer and vendor browser uploads now store private original bytes and enter quarantine.
Actual byte size, format, hash, leases, and ClamAV protect the joined local scanner path.
Assigned MFA staff review exact clean versions independently of their uploaders.
Approved current versions use authenticated, session-bound, short-lived access through a POST download route.
Metadata, versions, histories, and literal filename search have normal application screens.

The review suite uses modeled scanner evidence. A separate thirteen-check suite composes actual antivirus, independent review, and approved customer bytes.
Browser downloads reached initiation and successful byte responses. Saved-file capture and actual file opening remain unverified.

Parsing, extraction, approved content search, signed provider access, business-record attachments, retention, scheduled operation, and hosted provisioning remain open.
See [document procedures](../src/server/trpc/routers/documents.ts), [scanner worker](../src/server/workflows/document-scan-worker.ts), and [document evidence](security/r4-document-review-access.md).

## Material blockers and required results

### A01 Dependency security remains blocked

The independent [October 3 dependency review](../.codex/plans/decision-security-dependency-remediation-2026-10-03.md) reports 16 affected package entries.
It records one critical, twelve high, two moderate, and one low entry, including inherited parent findings.
The installed application uses Next.js `16.3.4` in [package.json](../package.json).
Approval for the proposed Next.js `16.3.6` update remains pending at the inspection boundary.
The document audit did not execute this check. The independent dependency review repeated it without changing installed versions.

Required result: approve a supported correction, inspect the lockfile changes, and pass the dependency gate and relevant application checks.
Do not reduce the audit threshold or use an unreviewed forced upgrade.
The new dependency review supersedes both September 30 and October 2 dependency counts.
The unpatched `braces` advisory remains a blocker after the available compatible corrections.

### A02 Complete integration evidence remains open

The earlier complete run covered 112 files. It passed 110 files and 1,056 tests, with two failures.
Fresh reply and identity suites later passed 27 and 97 checks.
Those isolated passes do not make the failed complete run successful.
The original identity failure cause remains unproved.
The current inventory contains 116 integration files, but inventory success does not prove execution success.

Required result: investigate the original failures and pass the complete current integration suite on the exact candidate.
Verify direct RPCs, live sessions, revocation, MFA, recovery restrictions, sensitive fields, audit rollback, and cross-organization denial.

### A03 Finance eligibility and approval remain incomplete

Current event creation accepts supplied contract identifiers and signing times.
Portal signing does not automatically compose an eligible commission event.
Source agreement identifiers do not establish actual approved agreements or their effective dates.
Quote prices cannot establish confirmed signed-contract value or currency.

Current payment SQL rejects Voided and Written Off events but can accept `pending_review` events.
It can then set an unapproved event to Partially Paid or Paid.
This conflicts with independent financial approval.
The existing payment fixture exercises this unsafe eligibility behavior; its pass is not approval evidence.

Invoice and payment TypeScript commands now bind exact entities, authority, correlation, and expected action results.
Their SQL replay branches still omit fields required by those command contracts.
An exact retry can therefore fail result validation after a stored write.
Mock receipt tests do not prove actual SQL retry compatibility.

Required result: bind actual signed contracts, approved effective agreements, exact calculations, separate review, and immutable original outcomes.
Unapproved events must reject invoice and payment operation.
Retain ownership, due dates, approved supporting documents, exact balances, reversals, reconciliation, exceptions, and history.

See [finance SQL](../drizzle/0093_r7-finance-authorization.sql), [invoice command](../src/server/commands/invoice.ts), [payment command](../src/server/commands/commission-payment.ts), and [command evidence](security/r7-finance-command-bindings-2026-10-02.md).
The planned October 3 correction is outside this audit boundary.

### A04 Financial closure and state models need complete enforcement

The pure [commission rules](../src/server/finance/commission-contract.ts) define financial closure.
The [deal transition SQL](../drizzle/0080_r2b_deal_commands.sql) does not enforce that predicate in its closing transaction.
The current deal model lacks several minimum PRD states, including explicit financial Closed.
Its transitions differ from the PRD and TypeScript rules.

Demo storage uses `requested`, `scheduled`, `completed`, `cancelled`, and `no_show`.
Coordination actions express more behavior, but the required minimum states need an explicit mapping or compatible expansion.
Similar checks remain necessary for document, finance, and later workflow state models.
Do not rename canonical requirements merely to match existing tests.

Required result: approve one transition specification and enforce it through application and direct SQL paths.
Financial closure must atomically reject every unresolved related commission.
Operational signing or win status must remain separate from approved financial closure.

### A05 Documents require operational composition

The September 30 claim that private bytes and actual scanning were absent is now outdated.
Current local adapters and joined tests establish real private Storage and ClamAV behavior for their stated scope.
They do not establish scheduled runtime, hosted scanner operation, credential rotation, retention, or complete downstream consumers.

Current access uses an opaque authenticated capability rather than the provider signed access required by FR-DOC-01.
Signing remains denied until a reviewed design preserves current authorization and expiry rules.
Parser dependency decisions remain pending. No requested parser package was installed at this boundary.

Required result: finish approved parsing and review, safe business attachments, authorized extracted-content search, retention, and durable processing operation.
Unsafe or uncertain files must remain unavailable across every consumer.
Complete real download opening evidence and production-equivalent safety checks.

### A06 Business email and background work remain unfinished

The application has communication interfaces and stored records, but no complete transactional or inbound business email flow.
Direct AgentMail synthetic tests passed four sends, four unchanged retries, four conflict cases, and two linked replies.
These direct API tests do not prove application delivery, ingestion, consent, or attachments.

The [task directory](../src/trigger/) contains health and identity administration entry points.
The scanner sweep has domain code but no scheduled task consumer at this boundary.
Other business reminders, RFP ingestion, renewals, and AI processing remain disconnected.

Required result: compose approved provider-neutral adapters, verified callbacks, durable association, replay handling, retry rules, and visible recovery.
Bind messages and attachments to the correct case and organization.
See [communication interfaces](../src/server/workflows/communication-contract.ts), [scanner sweep](../src/server/workflows/document-scan-sweep.ts), and [email evidence](security/agentmail-synthetic-role-test-2026-10-01.md).

### A07 Ordinary staff operation remains incomplete

The [root router](../src/server/trpc/root.ts) now registers fourteen domains, including replies, clarifications, demos, documents, proposals, and contracts.
It does not register full finance, onboarding, reporting, general CRM, or general administration workflows.
Many existing commands still have no production TypeScript consumer.
Specialized review screens do not supply complete daily staff queues.

Required result: connect customer, vendor, contact, relationship, deal, task, finance, onboarding, renewal, configuration, export, and audit workflows.
Every active case needs a visible owner, current status, next action, due date, and decision history.
Support reassignment, overdue work, recovery, and authorized historical views without developer assistance.

### A08 Catalog approval and real comparison evidence remain open

The latest real catalog record remains dated September 16.
It records eight active products, approved payroll facts, and three approved profiles.
Five profile approvals, other scope facts, real publication, and actual customer acceptance remain unresolved.
Those dated records do not establish the current hosted database state.

Required result: complete permitted-source records, fact and profile review, active rules, and an approved real comparison.
Verify unknown values, evidence access, freshness, masking, disclosure, saved selections, failures, keyboard use, and narrow screens.
Research does not replace approval. Do not bypass rejected catalog decisions.
See [profile approval evidence](security/phase1-profile-approval-2026-09-16.md).

### A09 AI and reporting remain separate foundations

The AI service accepts injected adapters and validates output.
Extraction calls that service without complete routing, durable provenance, measured cost, and review composition.
Knowledge search and missing-information assistance remain unfinished.
Pattern matching alone does not establish isolation from hostile document or message instructions.

Revenue, pipeline, vendor performance, customer journey, and work queues remain mainly pure projections.
The analytics event function has no production application callers at this boundary.
Consent-aware page views do not complete funnel or workflow measurement.

Required result: connect approved AI workflows with artifacts, exact run records, evaluation fixtures, review, failures, and cost limits.
Keep consequential decisions outside AI authority.
Build staff reports from authoritative records and capture safe real lifecycle events.
See [AI service](../src/server/ai/ai-service.ts), [extraction](../src/server/commands/vendor-extraction.ts), [reporting](../src/server/reporting/), and [analytics events](../src/lib/analytics/event-contract.ts).

### A10 Live release evidence remains blocked

All twelve categories in [the release manifest](../scripts/r9-release-evidence.json) remain false with pending references.
They cover CI, integration, browser journeys, accessibility, performance, availability, deletion, restoration, security, deployment, rollback, and public approval.
Local passing gates do not establish remote CI or production operation.
Operational evidence validators cannot establish measured compliance.

Required result: pass the relevant exact-candidate checks and obtain accepted evidence for every required release category.
Complete production-equivalent monitoring, alerts, deletion, backup restoration, rollback, and staff acceptance.
Production action, catalog publication, provider activation, and permission changes retain their separate approval requirements.

## Dated validation record

These results come from saved evidence. They were not rerun during this audit.

| Check | Latest recorded result | Date and scope |
|---|---|---|
| Complete unit suite | 418 files; 4,940 tests passed | October 2; outside sandbox after owned browser services stopped |
| Type checking | Passed | October 2 candidate after finance command checks |
| Full lint | Passed | October 2 candidate |
| Production build | Passed | October 2 candidate; local output only |
| Complete integration run | Failed; 110 files and 1,056 tests passed; two failed | Earlier 112-file run; no later full pass established |
| Integration inventory | 116 files passed inventory checks | October 2; does not establish execution |
| Reply, clarification, and demo genuine Auth | 27 passed | Isolated rerun; local synthetic workflow |
| Identity suite | 97 passed | October 1; original complete-run failure cause remains open |
| Proposal SQL and genuine Auth | Nine SQL and five Auth checks passed | October 1; structured quotes only |
| Contract SQL and genuine Auth | Thirteen SQL and five Auth checks passed | October 1; reported contract outcomes only |
| Current empty database | Eleven passed across 157 migrations | October 2; owned disposable database |
| Current restricted database | Ten passed | October 2; restricted-worker rehearsal |
| Document Auth and Storage | Eighteen passed | October 2; modeled scanner evidence in this suite |
| Joined scanner, review, and access | Thirteen passed | October 2; actual antivirus and approved bytes |
| Customer and vendor browser uploads | Both passed; private quarantine, revision two, scanning pending | October 2; genuine disposable Auth and Storage |
| Document browser download | Initiation and successful byte responses | Saved-file capture and file opening remain unverified |
| Finance calculation SQL | Eight new and five existing checks passed | October 1; synthetic source eligibility only |
| Invoice and payment command tests | Fifty passed | October 2; mocked authorization and RPC results |
| Legacy invoice and payment SQL | One check each passed | October 2; does not prove eligibility or original retry results |
| Dependency audit | Failed; one critical, twelve high, two moderate, one low | Independent October 3 repeated audit; includes inherited parent findings |
| Secret scans | 1,156 tracked and 375 untracked files passed | October 2; configured patterns and exclusions |
| R9 release categories | Twelve blocked | Current manifest inspection |

The [document record](security/r4-document-review-access.md) preserves browser, scanner, and current gate details.
The [finance command record](security/r7-finance-command-bindings-2026-10-02.md) preserves the latest command and gate results.
The [calculation record](security/r7-finance-calculation-2026-10-01.md) distinguishes arithmetic from contract eligibility.
Earlier worker startup failures remain recorded. A later passing full unit gate does not prove their exact cause.
Full browser network capture remains unavailable in the recorded rehearsals.
Real participants, hosted provider operation, normal migration application, and production acceptance remain unverified.

## Later local implementation evidence

The initial audit above precedes the following October 3 corrections.
These results do not change whole-requirement classifications or establish complete finance acceptance.

- [Finance payment and invoice correction](security/r7-payment-and-invoice-recovery-2026-10-03.md): 43 payment and 21 invoice SQL checks passed after separate review.
- [Signed finance command verification](security/r7-finance-auth-2026-10-03.md): 35 checks passed with genuine Auth sessions and request-scoped clients.
- Fifty existing invoice and payment command checks passed again with mocked authorization and RPC results.
- [Contract test budget correction](security/r6-contract-integration-recovery-2026-10-03.md): thirteen SQL checks passed without removing assertions or changing request limits.
- [The immutable integration baseline](security/r1-integration-gate-2026-10-03.md) retains the original contract timeout and remains incomplete.
- [Notification outbox verification](security/r4-rfp-notification-outbox-2026-10-03.md) records the new local queue, immutable history, and remaining database checks.
- [The disabled synthetic email adapter](security/agentmail-notification-adapter-2026-10-03.md) passed 50 mocked transport checks without sending email.
- [Current candidate checks](security/current-candidate-gates-2026-10-03.md) preserve the failed broad gates and their focused corrections.

The finance correction rejects unapproved and terminal event payments and preserves original retry results.
Signed-contract eligibility, independent financial approval, finance screens, reversal accounting, and closure remain open.
Current broader gates remain separate from these focused results.
Type checking and full lint passed before the latest notification integration test extension.
The production build compiled the application, then failed on types in that new test extension.
The test types need correction and new type, lint, and build checks.
The full unit suite passed 5,065 checks and failed one migration count assertion.
The corrected count then passed all 16 checks across four affected files.
Complete unit and build reruns remain required.
Notification browser behavior and the complete current integration gate remain unverified.

## Recommended completion order

The user requested complete software and synthetic rehearsal before real customer use.
The narrower manual MVP permission does not remove that requested sequence.

1. Keep this requirement baseline current and give each open item an acceptance test and dependency.
2. Resolve dependency and integration blockers without weakening their checks.
3. Complete documents, application email, durable jobs, and safe attachments.
4. Finish the complete evaluation, RFP, response, demo, proposal, and contract workflow.
5. Complete finance integrity, staff screens, onboarding, renewals, tasks, CRM, administration, reports, and required AI assistance.
6. Run a complete synthetic case through all three roles and independent reviewers.
7. Test failures, revocation, isolation, duplicates, unsafe files, provider outages, uncertain writes, recovery, and approved financial closure.
8. After approval, repeat critical journeys in protected staging and complete operational evidence.
9. Obtain production and participant approval, then run a controlled live pilot with approved data.
10. Expand access only after participant acceptance and complete release checks.

Use [the current implementation plan](../.codex/plans/build-complete-pilot-workflow.md) for execution dependencies and controlled approvals.
Use the [MVP checklist](../.codex/plans/release-mvp-launch-checklist.md) for the historical narrower milestone.
Its September 30 counts remain dated: fifteen Partial and five Open tasks, with none Ready or Released.
Those task counts are not a new October 3 acceptance assessment.

## Risks and recovery

The main risks are private data disclosure, unsafe documents, incorrect financial associations, lost history, and ambiguous retry results.
Keep unfinished finance and processing surfaces unavailable for real cases.
Use additive reviewed migrations and exact source bindings.
Preserve original documents, approvals, receipts, and business history.

Recovery must stop the affected entry points and workers, preserve records, and apply a reviewed forward correction.
Hosted restoration and rollback need production-equivalent rehearsal before deployment approval.
Do not restore weaker historical permissions or delete evidence to recover a failed workflow.
Do not alter commission amounts automatically when correcting historical arithmetic.

## Document checks and remaining limitations

Document checks found exactly 148 unique canonical identifiers, with no missing or extra rows.
The classification totals sum to 148.
All local matrix and report links have existing targets. Counts describe the initial audit before later evidence links were added.
The audit preserves the historical September 30 records.

This audit changes only its two new documents.
Current runtime acceptance, full integration success, dependency remediation, external configuration, and live launch remain separate work.
No completion percentage or release approval follows from this record.
