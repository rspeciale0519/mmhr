# MMHR Product Requirements Document

> **Delivery notice, October 7, 2026.** The product owner approved the [MVP complete UI/UX and backend roadmap, version 1.1](../.codex/plans/build-mvp-complete-ui-ux-roadmap-2026-10-06.md).
> It replaces the October 3 instruction to complete all mandatory software before live use.
> Launch Candidate A ships after roadmap phase P2. Launch Candidate B adds demos, proposals, and contract handoff after P3.
> Financial-record management and private document storage are outside the MVP.
> Where this document conflicts with the roadmap on launch scope or delivery order, follow the roadmap.
> Product behavior requirements remain in force. The financial completeness measure applies when the finance module returns.
> A full rewrite follows the launch.

## Document Control

| Field | Value |
|---|---|
| Version | 2.6 |
| Date | 2026-10-03 |
| Status | Canonical product baseline |
| Product owner | Rob Speciale |
| Architecture authority | [TECH_STACK.md](./TECH_STACK.md) |
| R0 release authority | [R0 public-release control](../.codex/plans/module-r0-roadmap-and-public-release-control.md) |
| Supporting research | [outsail-competitive-operating-model.md](./outsail-competitive-operating-model.md) |
| Supersedes | Prior PRD v1 content and [PRD-2.md](./PRD-2.md) |

All requirements in this document are mandatory unless they are marked Deferred or Open.
The MVP milestone controls delivery timing. Later mandatory features remain commitments for the complete v2 product.

The [October 3 code audit](code-audit-2026-10-03.md) records implementation evidence and gaps for all 148 requirements.
Its status does not change mandatory behavior or approve a release.

Technical providers and model selections belong in TECH_STACK.md. Product behavior must not depend on one AI provider or model.

## 1. Product Definition

MMHR is a private operating platform for HR software selection, vendor management, CRM, deal flow, commissions, and customer success.

MMHR staff use the platform with registered customers and invited vendor users. MMHR does not sell the platform as a general SaaS product.

### Approved Customer Journey

The owner confirmed this journey in the September 7 checkpoint and approved implementation on September 8.
See [checkpoint clarification](./CHECKPOINT-2026-09-07.md#product-clarification) and the
[registration policy](../.codex/plans/module-r1-secure-platform-base.md).

Customers create free accounts and enter software needs. Verified customers receive a new private workspace without administration rights or staff approval.
The initial scorecard shows all vendor options from approved data with provider names masked. The customer selects up to five RFP contenders.
The customer then uses a representative call or a form to prepare the RFP. MMHR discusses required capabilities and customization requests.
Provider names become visible after that discussion and before approved RFP submission. MMHR records the disclosure decision.
MMHR sends the approved RFP to selected providers. Customers compare responses, select a provider and sign a direct contract with that provider.
Customers never pay MMHR. Providers pay MMHR a commission or referral fee; this does not imply identical rates.

This journey sets delivery priority. All other mandatory requirements remain in scope.

The initial category scope is HR and workforce software. Category expansion requires a separate product decision.

### MVP Launch Milestone

The October 3 execution instruction requires complete mandatory software and synthetic customer, staff, and vendor testing before real customer use.
Follow the [current execution plan](../.codex/plans/build-complete-pilot-workflow.md#full-software-completion-before-live-use) for this completion sequence.
The earlier MVP definition below remains a historical milestone. It does not authorize an earlier live launch under the current instruction.

The first launch supports registration, saved intake, staff review, the Comparison matrix, initial selections, provider disclosure, and approved RFP portal delivery.
MMHR staff prepare the RFP after the customer discussion.
Responses, demos, proposals, contracts, commissions, and onboarding use the documented manual pilot process.
Customer RFP editing and automated RFP email remain later software delivery.

The [MVP launch checklist](../.codex/plans/release-mvp-launch-checklist.md) is the authoritative task sequence and completion record for this milestone.
It maps the launch work to existing requirements and preserves later v2 delivery.
The user authorized this documentation alignment on September 14, 2026.

The MVP may launch before all R5–R8 software features are complete.
All required R9 evidence categories and R0 exit rules still apply before production release.
Requirements outside the MVP remain incomplete until their own implementation and acceptance checks pass.
Every exposed operation retains its applicable authorization, audit, consent, data, and ranking controls.

The pilot must support an accountable operating process from registration through the agreed manual handoff.
Each active case needs an owner, current status, next action, due date, and decision history.
Manual records must identify the case and its evidence location without exposing private data through unapproved tools.
Manual handling does not satisfy the corresponding v2 software requirement.
MVP-07 defines the operating procedure; MVP-18 verifies staff can use it.

Completion requires a usable entry point, enforced permissions, a stored result, failure handling, and dated acceptance evidence.
A schema, pure function, isolated command, or passing fixture does not complete a user workflow.

### Operating Principle

Automate administrative work while preserving human control at trust, judgment, approval, scheduling, relationship, and handoff points.

### Product Principles

1. Preserve a white-glove customer experience.
2. Keep evaluation flexible instead of forcing a fixed funnel.
3. Keep relationships and deals as first-class data.
4. Preserve complete decision, communication, commercial, and approval history.
5. Enforce every protected action on the server.
6. Keep commission values outside recommendation calculations.
7. Treat consequential AI output as draft material until a person approves it.
8. Keep AI providers and models interchangeable behind an internal service interface.
9. Support vendor processes when a safe structured workflow is not practical.
10. Build the complete platform through controlled, production-safe phases.

## 2. Goals and Success Measures

| Goal | Measure | Target |
|---|---|---|
| Trustworthy RFP control | RFPs sent without required MMHR approval | 0 |
| Financial completeness | Eligible signed contracts with one linked commission event | 100% |
| Recommendation integrity | Comparisons using approved, versioned vendor data | 100% |
| AI oversight | Consequential customer-facing AI outputs with recorded approval | 100% |
| Audit coverage | Sensitive permission, approval, export, financial, and ranking changes with audit records | 100% |
| Vendor-data freshness | Published vendor records inside their configured freshness window | At least 95% |
| Customer trust | Net Promoter Score | At least 70 |
| Workflow adoption | Completed intakes reaching an initial candidate set | At least 40% |
| Operational visibility | Required marketing, product, workflow, and financial analytics | Full software reporting at v2 launch; traceable staff records and required release monitoring at the earlier MVP |

The product owner can change business targets through a versioned PRD update.

## 3. Scope

### 3.1 In Scope

- Public marketing, content, SEO, consent, lead capture, and gated resources
- Internal administration and CRM
- Customer and vendor portals
- Customer, vendor, contact, relationship, product, and deal records
- Discovery, requirements, matching, masked scorecards, and comparison
- RFP creation, review, distribution, response, and clarification
- Demo, proposal, pricing, selection, and contract-handoff workflows
- Commission calculation, invoicing, collection, dispute, and closure tracking
- Onboarding, customer success, renewals, and repeat deals
- Tasks, reminders, communications, documents, search, analytics, and reporting
- Versioned vendor evidence and provider-neutral AI assistance
- Granular permissions, organization isolation, audit, and operational monitoring

The existing public marketing routes and design gallery remain in scope.

### 3.2 Out of Scope

- A general-purpose SaaS product for other brokerage operators
- Autonomous vendor selection
- Autonomous consequential customer communications
- Direct MMHR participation in legal contract negotiation
- Contract execution, payment processing, or general accounting
- Native mobile applications
- Localization
- Public unmasked vendor rankings without separate approval
- Unlicensed sources or collection that violates source terms
- Sponsored organic ranking

## 4. Roles and Authorization

### Roles

- Visitor: public marketing access only.
- Super Admin: full application control within audited product workflows.
- Admin: delegated internal administration and operational control.
- Sales Rep or Staff: scoped CRM and workflow access.
- Customer Organization Admin: customer-organization membership and workspace control within granted permissions.
- Customer User: scoped customer workspace access.
- Vendor Organization Admin: vendor-organization membership and response control within granted permissions.
- Vendor User: scoped vendor portal access.

Super Admin access does not grant direct database credentials or unrestricted service credentials.

### Identity and Permission Requirements

**FR-IAM-01 — Identity.** The system must authenticate internal and external users through the configured identity service.

**FR-IAM-02 — Organization isolation.** The system must prevent access across customer and vendor organizations unless an audited internal permission permits it.

**FR-IAM-03 — Server enforcement.** The server must authorize every protected read, write, action, approval, export, and sensitive field.

**FR-IAM-04 — Permission structure.** The system must support role defaults, feature permissions, action permissions, field permissions, and per-user overrides.

**FR-IAM-05 — Delegation.** Super Admin must control which permissions each Admin can view, grant, revoke, or delegate.

**FR-IAM-06 — External administration.** Organization Admins can manage their organization members only within platform-defined boundaries.

**FR-IAM-07 — Presentation.** Hidden, disabled, or read-only controls must never replace server authorization.

**FR-IAM-08 — Impersonation (Deferred).** If approved, impersonation must be scoped, time-limited, visible, and fully audited.

**FR-IAM-09 — Audit.** The system must record sensitive permission changes with actor, time, reason, and before-and-after values.

**FR-IAM-10 — Customer portal scope.** Customer users can access only approved records for their organization and granted deals.

They can change only shared intake, requirements, availability, feedback, tasks, and documents allowed by their permissions.

**FR-IAM-11 — Vendor portal scope.** Vendor users can access issued requests, their responses, scheduled events, proposals, and shared communications for their organization.

They cannot access competitors, internal notes, customer-private records, or commission data without an explicit permission.

**FR-IAM-12 — Sharing control.** Authorized MMHR users must grant and revoke portal access with an audit record.

## 5. Functional Requirements

### 5.1 Public Marketing and Lead Capture

**FR-MKT-01 — Public pages.** Maintain pages for home, platform, broker model, services, case studies, FAQ, company information, and contact.

Also maintain partner, resource, transparency, privacy, and terms pages.

**FR-MKT-02 — Homepage.** Pulse must remain the selected homepage direction until the product owner approves a replacement.

**FR-MKT-03 — Published claims.** Public claims, figures, evidence, and case studies must be approved and traceable. Placeholder claims must not ship.

**FR-MKT-04 — Managed content.** Authorized staff must be able to manage designated marketing content without changing application code.

**FR-MKT-05 — Discoverability.** Public pages must provide server rendering, canonical metadata, social metadata, sitemap coverage, and accessible semantic structure.

**FR-MKT-06 — Lead fields.** Public customer registration must collect full name, company, work email, and direct company phone.

Registration is free. Verified customers receive an isolated private workspace without administration rights, under the approved R1 initialization policy.

**FR-MKT-07 — Email validation.** Public registration must reject known personal email domains. Authorized staff can record a reviewed exception.

**FR-MKT-08 — Gated resources.** Gated resources must use the same identity, consent, and lead-routing rules.

**FR-MKT-09 — Consent.** Outreach and analytics must honor recorded consent and applicable privacy requirements.

**FR-MKT-10 — Lead routing.** Each completed lead must enter the internal CRM with source, consent, owner, and follow-up status.

**FR-MKT-11 — Newsletter.** Approved public pages must support consent-aware newsletter registration through the internal newsletter service.

### 5.2 Customer and Vendor CRM

**FR-CRM-01 — Customer records.** Store customer organizations, contacts, roles, stakeholders, current software, purchase history, requirements, contract dates, renewal windows, and related deals.

**FR-CRM-02 — Vendor records.** Store vendor organizations, products, contacts, relationships, response history, deal history, commissions, payment terms, and performance measures.

**FR-CRM-03 — Relationships.** Store relationship roles, decision influence, interaction history, preferences, and ownership.

**FR-CRM-04 — Deals.** Treat each customer purchase effort as a first-class deal linked to customer, products, candidates, owner, stages, evidence, commissions, and onboarding.

**FR-CRM-05 — Activity history.** Preserve notes, tasks, communications, documents, approvals, changes, and state transitions without destructive overwrites.

**FR-CRM-06 — Search.** Authorized users must search and filter customer, vendor, contact, deal, document, and activity records.

**FR-CRM-07 — Exports.** Sensitive exports require explicit permission and an audit record.

**FR-CRM-08 — Duplicate control.** The system must detect likely duplicate organizations, contacts, products, and deals without merging records automatically.

**FR-CRM-09 — Renewals.** Track renewal and replacement windows with owners, reminders, and linked follow-on deals.

### 5.3 Intake, Matching, and Evaluation

**FR-INT-01 — Intake.** Capture company context, current systems, requirements, compliance needs, customizations, budget, timeline, stakeholders, and decision process.

**FR-INT-02 — Saved progress.** Customers and authorized staff can save, resume, and revise intake information with change history.

**FR-INT-03 — Initial evaluation.** The system must create an initial masked assessment using approved inputs and vendor data.

**FR-INT-04 — Initial candidates.** The customer can select up to five initial RFP contenders from the masked scorecard.

This cap applies to selections. It must not restrict the number of displayed vendor options from approved data.

After MMHR review, authorized staff or a permitted Customer Organization Admin can add candidates without a fixed funnel limit.

**FR-EVL-01 — Candidate lifecycle.** Track each candidate independently from the deal stage.

**FR-EVL-02 — Flexible comparison.** Customers can keep any number of current candidates active, pause them, eliminate them, or select one.

**FR-EVL-03 — Scorecards.** Support weighted criteria, questions, multiple scorers, comments, evidence, and aggregate and individual views.

**FR-EVL-04 — Requirements.** Support structured and custom requirements with importance, ownership, evidence, and vendor response links.

**FR-EVL-05 — Workspace.** Show current stage, candidates, open tasks, approvals, upcoming events, and recent activity.

**FR-EVL-06 — Collaboration.** Support invitations, scoped roles, assignments, comments, and customer team activity.

**FR-EVL-07 — MMHR collaboration.** Support secure customer communication, meeting coordination, review requests, and assigned MMHR ownership.

**FR-EVL-08 — Reactivation.** Authorized users can reactivate a paused or eliminated candidate without deleting prior history.

**FR-EVL-09 — Comparison exports.** Authorized users can export approved comparisons and scorecards without exposing hidden or internal data.

**FR-EVL-10 — Live scorecards.** Approved demo workflows can support concurrent score entry with conflict handling and complete history.

#### Approved MVP Comparison Design

**Decision: Comparison matrix.** Rob Speciale approved this design on September 14, 2026, and requested its inclusion in the documentation.
It is the selected primary UI for the MVP vendor software comparison.
This records design approval. The application now contains a partial implementation.
Approved real data publication and complete browser acceptance remain open in the [code audit](code-audit-2026-10-03.md).

- Show vendors in columns and comparison criteria in rows. Keep requirement labels visible during horizontal scrolling.
- Show overall fit, estimated annual cost, required features met, individual feature coverage, evidence coverage, setup estimates, and evidence details.
- Keep fit scores separate from evidence coverage. Use approved scoring rules and data; the preview does not define production scoring weights.
- Label cost and setup estimates. Show unknown, limited, missing, and add-on coverage explicitly. Do not invent values when approved data is unavailable.
- Show all published vendor options. Allow up to five initial selections, retain selection state, and show the current count.
- Keep provider names masked until the required MMHR discussion and recorded disclosure. Preserve the workflow rules in FR-MAT-08.
- Use the Pulse visual direction, with teal accents, clear typography, readable values, and visible selected columns.
- Support keyboard use and narrow screens. Contain horizontal scrolling within the matrix without widening the page.

The reference is the Comparison matrix tab in the September 13 five-design preview.
Its vendor identities, prices, scores, and evidence are fictional sample data.
See the [preview record](../mmhrbrain/journal/2026-09-13.md) for the artifact location and browser checks.
The other four designs remain alternatives. They are not required MVP views.

### 5.4 Recommendation Integrity

**FR-MAT-01 — Eligibility.** Candidate eligibility must use approved requirements, vendor data, and configured business rules.

**FR-MAT-02 — Scoring.** Eligibility and scoring must use versioned, deterministic rules.

AI can draft explanations, but it cannot calculate or change eligibility or scores.

**FR-MAT-03 — Explanation.** Each recommendation must show approved fit reasons, limitations, confidence, and evidence freshness.

**FR-MAT-04 — Commercial independence.** Commission rates, payout values, and payment status must not affect organic eligibility or scores.

**FR-MAT-05 — Conflicts.** Disclose material commercial relationships and other recommendation conflicts to affected customers.

**FR-MAT-06 — Configuration control.** Authorized users must preview, approve, and audit scoring changes before they affect active comparisons.

**FR-MAT-07 — Duplicate products.** Avoid showing duplicate representations of the same underlying product unless the distinction is material and disclosed.

**FR-MAT-08 — Masking.** The product must record when identities are masked, who can unmask them, and why disclosure occurred.

Provider names remain masked until the required MMHR discussion. Record authorized disclosure after that discussion and before RFP submission.

### 5.5 Vendor Knowledge and Evidence

**FR-VND-01 — Source registry.** Record permitted sources, owners, capture methods, cadence, licensing notes, and review requirements.

**FR-VND-02 — Acquisition.** Support manual and automated acquisition through replaceable provider adapters.

**FR-VND-03 — Extraction.** AI-assisted extraction must use the internal AI service and a versioned structured schema.

**FR-VND-04 — Validation.** Validate extracted data, detect material changes, and send low-confidence or high-impact changes to review.

**FR-VND-05 — Approval.** Customer-visible vendor facts require the configured approval state.

**FR-VND-06 — Versioning.** Preserve source artifacts, extracted values, capture dates, reviewer decisions, and published versions.

**FR-VND-07 — Freshness.** Show freshness and confidence for customer-visible vendor facts.

**FR-VND-08 — Overrides.** Manual overrides require a source, reason, author, time, and expiration or review date.

### 5.6 RFP and Vendor Responses

**FR-RFP-01 — Questionnaire.** Capture functional needs, compliance, customizations, implementation, budget, timeline, stakeholders, demo rounds, and demo audiences.

**FR-RFP-02 — Draft.** Generate a consolidated, versioned RFP draft from approved intake data.

**FR-RFP-03 — Mandatory review.** No RFP can leave the server before recorded MMHR approval.

Separate staff approval is configurable and is off for the current two-person MMHR team.
When off, an authorized MMHR staff member can approve their own draft.
When on, a different authorized MMHR staff member must approve the draft.
Customer-created drafts still require MMHR approval.
See [RFP approval setting](./security/r4-approval-policy.md).

**FR-RFP-04 — Clarification.** Track customer questions, answers, changes, decisions, and approval after MMHR review.

**FR-RFP-05 — Versions (Decided).** Preserve one common RFP base for every vendor.

MMHR supports additive, vendor-specific amendments after product-owner approval. Each amendment is immutable content with its own version, vendor scope, and approval evidence. An amendment cannot replace or mutate the common base.

**FR-RFP-06 — Distribution.** Record recipients, version, delivery state, deadlines, reminders, and acknowledgements.

**FR-RSP-01 — Response methods.** Accept structured portal forms, email, and uploaded documents.

**FR-RSP-02 — Ingestion.** Associate inbound messages, attachments, forms, and provider identifiers with the correct RFP and vendor.

**FR-RSP-03 — Normalization.** Extract supported requirements, unsupported requirements, caveats, dependencies, commitments, implementation details, missing answers, and proposed follow-ups.

**FR-RSP-04 — Human review.** Consequential customer-facing conclusions require recorded MMHR approval.

**FR-RSP-05 — Clarification.** Track clarification requests, responses, deadlines, and resulting revisions.

**FR-RSP-06 — Failure.** Failed extraction or ingestion must remain visible and must never create approved data automatically.

### 5.7 Demos, Proposals, and Contract Handoff

**FR-DMO-01 — Demo plan.** Record each demo round, audience, purpose, participants, format, and required topics.

**FR-DMO-02 — Scheduling.** Customers provide acceptable times, and MMHR brokers vendor coordination.

Only MMHR confirmation creates a confirmed schedule. Track time zones, locations, conflicts, reminders, and changes.

**FR-DMO-03 — Outcomes.** Record attendance, feedback, scores, commitments, requested changes, evidence, and next actions.

**FR-PRP-01 — Proposal versions.** Preserve each proposal and pricing version with source documents and received dates.

**FR-PRP-02 — Pricing.** Track implementation costs, recurring costs, optional costs, terms, assumptions, discounts, and customer-requested changes.

**FR-PRP-03 — Comparison.** Customer-visible proposal comparisons require approved data and source links.

**FR-CTR-01 — Selection.** Record the selected vendor, decision reasons, approvals, and remaining risks.

**FR-CTR-02 — Introduction.** Record the formal customer and vendor introduction and contract-handoff date.

**FR-CTR-03 — Negotiation boundary.** The customer and vendor negotiate legal terms directly. MMHR tracks status without acting as legal negotiator.

**FR-CTR-04 — Outcome.** Record signed, not-signed, stalled, or cancelled outcomes without deleting evaluation history.

### 5.8 Commissions and Financial Closure

**FR-FIN-01 — Structures.** Support vendor-specific commission structures with effective dates, calculation rules, terms, and source agreements.

**FR-FIN-02 — Events.** A contract is eligible when it is signed under an effective vendor commission agreement.

Create one idempotent commission event for each eligible contract.

**FR-FIN-03 — Calculation.** Store calculation inputs, result, currency, reviewer, and approval state.

**FR-FIN-04 — Invoice workflow.** Track invoice owner, readiness, issue date, number, amount, due date, and supporting documents.

**FR-FIN-05 — Collection.** Track expected payments, partial payments, received dates, balances, and reconciliation.

**FR-FIN-06 — Exceptions.** Track overdue, disputed, adjusted, voided, and written-off states with approval, reason codes, and history.

**FR-FIN-07 — Closure.** Paid, Voided, and Written Off are the approved terminal commission states.

A deal cannot close financially until every related commission event reaches one of these states with approval.

**FR-FIN-08 — Separation.** A later signed contract creates a separate deal and commission event.

### 5.9 Onboarding and Customer Success

**FR-CSM-01 — Onboarding.** Track plans, milestones, owners, check-ins, issues, escalations, and completion.

**FR-CSM-02 — Configurable follow-up.** Support vendor, customer, product, and risk-specific check-in schedules.

**FR-CSM-03 — Failure.** Preserve failed onboarding history and allow authorized reactivation of a prior candidate in the existing deal.

A later signed contract must create a new deal and commission event.

**FR-CSM-04 — Renewals.** Track renewal, replacement, and expansion opportunities with reminders and linked deals.

**FR-CSM-05 — Outcomes.** Record customer and vendor outcomes for reporting and future evaluation.

### 5.10 Work, Communications, and Documents

**FR-WRK-01 — Tasks.** Support owners, assignees, due dates, priorities, blockers, reminders, escalation, and reassignment.

**FR-WRK-02 — Queues.** Provide role-based queues for approvals, follow-ups, overdue work, scheduling, commissions, and onboarding risks.

**FR-WRK-03 — Project plans.** Generate editable milestones and tasks from the target go-live date and approved workflow template.

**FR-CMN-01 — Associations.** Associate communications with customers, vendors, contacts, deals, RFPs, demos, proposals, contracts, commissions, and onboarding.

**FR-CMN-02 — Delivery.** Track provider message identifiers, recipients, delivery state, failures, retries, and opt-out or consent state.

**FR-CMN-03 — Provider independence.** Business workflows must use an internal communication interface instead of provider-specific calls.

**FR-CMN-04 — Evaluation routing.** Evaluation communications normally route through MMHR until final selection.

After contract handoff, direct customer and vendor negotiation communications stay outside MMHR unless the parties share status updates.

**FR-DOC-01 — Secure storage.** Store files privately with authorization, signed access, metadata, and retention rules.

**FR-DOC-02 — Versions.** Preserve document versions and links to business records.

**FR-DOC-03 — Safety.** Validate file type and size, scan or quarantine unsafe files, and block downstream use until safe.

**FR-DOC-04 — Processing.** Track uploaded, validating, processing, ready, quarantined, failed, and superseded states.

**FR-DOC-05 — Search.** Search authorized document metadata and approved extracted content.

### 5.11 AI Assistance

**FR-AI-01 — Service boundary.** All AI use must pass through an internal AI service with replaceable provider and model adapters.

**FR-AI-02 — Approved uses.** AI can draft, summarize, extract, normalize, find missing information, suggest follow-ups, identify risks, and support internal knowledge search.

**FR-AI-03 — Prohibited decisions.** AI must not select a vendor, approve an RFP, publish consequential conclusions, change permissions, or close financial records autonomously.

**FR-AI-04 — Structured validation.** Structured outputs must pass versioned schema validation before workflow use.

**FR-AI-05 — Provenance.** Each run must record configuration identifiers, template version, input artifacts, output artifact, validation, timing, cost, and approval result.

**FR-AI-06 — Human review.** Rejected or unreviewed consequential output must not become customer-visible.

**FR-AI-07 — Safe failure.** Provider, timeout, validation, and policy failures must enter visible failure states without bypassing review.

**FR-AI-08 — Untrusted content.** Treat vendor messages and documents as untrusted data. Their instructions must not control system behavior.

**FR-AI-09 — Interchangeability.** Changing a provider or model must not require domain-schema or workflow changes.

**FR-AI-10 — Evaluation.** Provider or model changes require the configured fixture evaluation and approval before production use.

### 5.12 Administration, Reporting, and Analytics

**FR-ADM-01 — Configuration.** Configure users, permissions, stages, questionnaires, scorecards, templates, reminders, commissions, AI review rules, document categories, and system settings.

**FR-ADM-02 — Operations.** Manage customer, vendor, product, relationship, deal, response, and onboarding records.

**FR-ADM-03 — Approval queues.** Provide queues for RFPs, vendor facts, response conclusions, scoring changes, financial changes, and AI output.

**FR-ADM-04 — Audit viewer.** Search authorized audit events by actor, entity, action, and date.

**FR-RPT-01 — Revenue.** Report signed deals, contract value when known, and commission earned, invoiced, collected, outstanding, overdue, and disputed.

**FR-RPT-02 — Pipeline.** Report deals by stage, customer, vendor, owner, conversion, and time in stage.

**FR-RPT-03 — Vendor performance.** Report response, qualification, demo, win, payment, and onboarding outcomes.

**FR-RPT-04 — Customer journey.** Report active evaluations, candidates, demo rounds, time to decision, repeat purchases, onboarding, and renewals.

**FR-RPT-05 — Operations.** Report open and overdue tasks, pending approvals, scheduling work, contract follow-up, commissions, and onboarding issues.

**FR-ANL-01 — Consent-aware marketing.** Collect public analytics only after the required consent.

**FR-ANL-02 — Funnels.** Measure marketing, lead, intake, evaluation, and activation funnels.

**FR-ANL-03 — Product use.** Measure workflow use without exposing sensitive content.

**FR-ANL-04 — System health.** Measure application errors, job outcomes, communication delivery, AI runs, and provider cost.

## 6. State Models

State transitions must record the actor, time, reason, previous state, and new state.

| Entity | Minimum states |
|---|---|
| Deal | Intake, RFP, Evaluation, Demo, Proposal, Selection, Contracting, Stalled, Won, Lost, Cancelled, Onboarding, Closed |
| Vendor candidate | Active, Paused, Eliminated, Selected |
| RFP | Draft, Internal Review, Customer Clarification, Approved, Issued, Response Open, Closed, Superseded, Cancelled |
| Vendor response | Requested, Received, Processing, Review Required, Approved, Clarification Required, Superseded, Failed |
| Demo | Proposed, Coordinating, Confirmed, Completed, Cancelled, Reschedule Required |
| Proposal | Received, Under Review, Revision Requested, Approved for Comparison, Superseded, Withdrawn |
| Contract handoff | Introduction Pending, Introduced, Negotiating, Stalled, Signed, Not Signed, Cancelled |
| Commission event | Earned, Calculation Review, Ready to Invoice, Invoiced, Partially Paid, Paid, Overdue, Disputed, Adjusted, Voided, Written Off |
| Onboarding | Planned, Active, At Risk, Completed, Failed, Cancelled |
| Document | Uploaded, Validating, Processing, Ready, Quarantined, Failed, Superseded |
| AI run | Queued, Running, Validating, Review Required, Approved, Rejected, Failed |
| Task | Open, In Progress, Blocked, Completed, Cancelled |

Authorized workflows can skip, reverse, or reopen non-terminal business states. The system must preserve every transition.

## 7. Non-Functional Requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-PERF-01 | Public performance | Largest Contentful Paint at or below 2.5 seconds at the 75th percentile |
| NFR-PERF-02 | Interaction performance | Interaction to Next Paint at or below 200 milliseconds at the 75th percentile for critical workflows |
| NFR-AVL-01 | Availability | 99.9% monthly production availability, excluding documented maintenance |
| NFR-AUTH-01 | Authorization | Every protected operation uses server-side authorization |
| NFR-ISO-01 | Isolation | The organization-role integration matrix permits zero unauthorized cross-organization access |
| NFR-ACC-01 | Accessibility | WCAG 2.1 AA for public pages and critical workflows |
| NFR-DATA-01 | Traceability | Every customer-visible vendor fact links to versioned evidence and capture time |
| NFR-DATA-02 | Freshness | At least 95% of published vendor records stay inside configured freshness windows |
| NFR-AUD-01 | Audit | Sensitive permissions, approvals, exports, financial changes, and ranking changes have complete audit records |
| NFR-PRV-01 | Consent | Consent-required analytics stay disabled until consent |
| NFR-PRV-02 | Deletion | Complete approved deletion requests within 30 days, subject to legal retention |
| NFR-REC-01 | Recovery | Production recovery point is within 24 hours and recovery time is within eight hours |
| NFR-REC-02 | Recovery tests | Complete and record a restore test at least quarterly |
| NFR-AI-01 | AI safety | Every consequential customer-facing AI output has recorded approval |
| NFR-DOC-01 | File safety | Validate every upload and quarantine failed or unsafe files before use |
| NFR-OBS-01 | Observability | Record application, job, communication, AI, and security failures with actionable context |

AI extraction quality targets require a versioned fixture baseline. The team must not invent quality percentages before that baseline exists.

## 8. Global Acceptance Rules

Each requirement must have successful-path, permission-denial, invalid-input, boundary, state-transition, audit, and relevant organization-isolation tests.

Critical acceptance rules are:

1. An unapproved RFP cannot leave the server.
2. A commission-rate change cannot alter an organic recommendation score.
3. A rejected or unreviewed AI result cannot become customer-visible.
4. A vendor-data override records its source, reason, author, and review date.
5. An eliminated vendor can reactivate without history loss.
6. A signed contract creates the required commission event.
7. A deal cannot close financially while commission status remains unresolved.
8. A protected request from another organization receives no protected data.
9. An unsafe document cannot enter extraction or customer workflows.
10. A provider failure cannot bypass validation, authorization, or approval.

## 9. Trust and Compliance Controls

- Publish or disclose the applicable recommendation methodology to affected customers.
- Keep payout amounts outside organic eligibility and scoring.
- Disclose variable commissions and material commercial conflicts.
- Show approved recommendation reasons, limitations, confidence, and evidence freshness.
- Version scoring configurations and manual overrides.
- Preview ranking changes before publication.
- Use permitted sources only.
- Preserve commercial and approval history.
- Let customers correct material intake data.
- Audit sensitive exports and impersonation.
- Apply privacy, consent, and outreach rules.
- Do not publish placeholder claims or copied evidence.
- Keep sponsored content outside organic ordering.

## 10. Delivery and Release Policy

Build the product in controlled, independently testable modules. Do not use throwaway architecture or remove agreed capabilities to label a partial build complete.

Before a module starts, its detailed plan must identify requirement IDs, state transitions, data changes, permissions, acceptance tests, risks, and recovery.

Database and authorization changes require local integration evidence. Production changes require explicit approval.

Production publication and search indexing remain blocked while the
[R0 public-release control](../.codex/plans/module-r0-roadmap-and-public-release-control.md#2-active-public-release-block) is active.

The [R0 record](../.codex/plans/module-r0-roadmap-and-public-release-control.md#4-exact-public-claim-review-register) contains the exact public-claim inventory and required evidence,
reviewer, date, and approval fields. Every claim remains blocked until its row
has approved evidence and publication approval.

The [approved v2 roadmap](../.codex/plans/roadmap-v2-implementation.md) replaces legacy sequencing.
Its earlier MVP milestone follows the [MVP launch checklist](../.codex/plans/release-mvp-launch-checklist.md).
The checklist does not waive module review, release evidence, or production approval.

## 11. Open Product Decisions

| Decision | Owner | Required before |
|---|---|---|
| Broader customer-visible or public scoring methodology beyond the approved MVP policy | Rob Speciale | Release beyond the approved MVP recommendation scope |
| Customer password-recovery method; self-service is a recommendation | Rob Speciale | MVP-04 account-support decision |
| Confirmation-email replacement method; resend UI is a recommendation | Rob Speciale | MVP-04 account-support decision |
| Public vendor-ranking scope | Rob Speciale | Public ranking work |
| Support impersonation | Rob Speciale, product and security owner | Administration implementation |
| Category expansion beyond HR software | Rob Speciale | New-category work |
| Sponsored-placement policy | Rob Speciale | Any sponsored placement |

The current default is no sponsored placement.

The [September 15 MVP catalog and scoring policy](../.codex/plans/decision-phase1-catalog-and-scoring.md) is approved for its stated scope.
Individual facts, active configuration, real publication, and customer verification remain separate completion checks.
That approval does not authorize broader public ranking or new scoring methods.

Resolved decisions remain requirements: FR-RFP-05 defines the common base and additive vendor amendments.
FR-MAT-08 defines discussion followed by recorded disclosure before RFP submission.
FR-RFP-03 records optional separate staff approval. The approved matrix appears in Section 5.3.
The [MVP decision table](../.codex/plans/release-mvp-launch-checklist.md#product-decisions-still-open) separates account-support recommendations from approved scope.

## 12. Legacy Requirement Compatibility

Existing code and tests can still cite the former identifiers until their owning modules change.

| Former identifiers | Canonical group |
|---|---|
| FR-M1 | FR-MKT-01 |
| FR-M2 | FR-MKT-02 and FR-MKT-03 |
| FR-M3 | FR-MKT-11 |
| FR-M4 | FR-MKT-04 |
| FR-M5 | FR-MKT-05 |
| FR-L1 through FR-L5 | FR-MKT-06 through FR-MKT-10 |
| FR-A1 through FR-A2 | FR-INT and FR-EVL-05 |
| FR-A3 | FR-EVL-01, FR-EVL-02, and FR-EVL-09; broad self-service marketplace browsing is superseded |
| FR-A4 through FR-A5 | FR-EVL-03, FR-EVL-04, and FR-EVL-10 |
| FR-A6 through FR-A8 | FR-WRK-03, FR-EVL-06, FR-EVL-07, FR-DMO, and FR-PRP groups |
| FR-R1 through FR-R4 | FR-MAT group |
| FR-P1 through FR-P6 | FR-VND group |
| FR-S1 through FR-S10 | FR-ADM and FR-RPT groups |
| FR-T1 through FR-T4 | FR-ANL group |

The v1 equal-commission claim, guaranteed vendor placement, named AI choices, vendor-portal exclusion, and obsolete design reference are superseded.

Pulse is the current selected visual direction.
