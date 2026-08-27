> **Superseded:** [PRD.md](./PRD.md) became the canonical product baseline on 2026-08-24. Keep this draft for history only.

# MMHR Product Requirements Document

## Purpose
MMHR is a complete internal platform for software selection, vendor management, CRM, deal flow, commission tracking, and customer success. It is for MMHR's own operations, not a SaaS product.

## Operating Principle
Automate administrative work while preserving human involvement at trust, judgment, approval, scheduling, relationship-building, and handoff points.

## Roles
Internal:
- Super Admin: unrestricted access.
- Admin: broad access controlled by Super Admin.
- Sales Rep / Staff: scoped operational and CRM access.

External:
- Customer Organization Admin
- Customer User
- Vendor Organization Admin
- Vendor User

## Permissions
Every significant feature must be permission-aware.
- Super Admin controls all permissions.
- Super Admin decides which controls Admins can view/change.
- Admin controls may be enabled, disabled, hidden, or read-only.
- Admins manage subordinate permissions only when explicitly authorized.
- Users below Admin cannot manage permissions.
- Support role defaults and per-user overrides.
- Cover features, actions, approvals, exports, financial data, and sensitive fields.
- Enforce permissions server-side and audit sensitive changes.

## Customer Journey

### 1. Customer Intake and CRM
Create an organization/profile with company information, contacts, decision makers, stakeholders, notes, current software, historical purchases, requirements, contract dates, renewal/replacement windows, and associated deals.

### 2. Initial Evaluation
Customer completes the initial discovery/evaluation process. The system creates a blind/masked scorecard during the appropriate early stage. Customer selects up to five initial vendors.

### 3. RFP Questionnaire
After selecting the initial vendors, the customer completes a questionnaire covering:
- Business and functional requirements
- Customizations
- Compliance requirements
- Implementation expectations
- Timeline and budget where appropriate
- Decision process and stakeholders
- Number of required demo rounds
- Intended audience for each demo
- Other evaluation requirements

The system generates a consolidated RFP draft.

### 4. Mandatory MMHR Review Gate
No RFP is sent automatically. MMHR reviews the draft, contacts the customer, clarifies requirements, confirms goals/compliance/customization/budget/timeline/decision process, builds the relationship, and finalizes the RFP.

Open design decision: identical RFP for all vendors versus vendor-specific versions.

### 5. Vendor Responses
Vendors can respond through an MMHR structured form or their normal free-form email/document process.

### 6. AI-Assisted Normalization
AI may extract:
- Supported/unsupported requirements
- Compliance statements
- Customization commitments
- Caveats/dependencies
- Implementation information
- Missing answers
- Draft comparison notes
- Suggested follow-ups

AI output is draft material. MMHR approves consequential customer-facing conclusions.

### 7. Flexible Comparison
Generate an updated masked comparison/scorecard with approved reasons for fit and limitations.

Do not force a five-to-three-to-two-to-one funnel. The customer may keep any number active, narrow the field at any time, or select one immediately.

Suggested states: Active, Paused, Eliminated, Selected, Contract Negotiation, Won, Lost, Onboarding, Closed.

### 8. Demo Management
Demo requirements and number of rounds are captured in the RFP questionnaire. Examples include end-user and executive/C-suite demos.

MMHR brokers scheduling. Customer supplies acceptable times; MMHR coordinates vendors; the system records and communicates confirmed schedules.

Track demo round, participants, audience, proposed/confirmed times, virtual/in-person format, location/link, notes, feedback, requested changes, commitments, and next steps.

Vendor identities may be revealed at the demo stage.

### 9. Proposals and Pricing
After demos, vendors may revise solutions and pricing.

Track pricing versions, functionality, customizations, compliance commitments, implementation/recurring costs, terms/assumptions, requested changes, responses, and proposal documents.

The evaluation remains iterative. Until final selection, communications generally flow through MMHR.

### 10. Vendor Selection and Contract Handoff
When a customer selects a vendor, MMHR introduces the parties. Customer and vendor negotiate legal/contract terms directly. MMHR steps out of negotiation while tracking status.

### 11. Commission Workflow
Each vendor may have a different commission structure. A commission event is created when a customer signs a contract with that vendor.

Track contract status, follow-up reminders, signed date, commission calculation, invoice task/date, expected payment terms/date, payment status, and payment date.

A deal is not financially closed until commission status is resolved.

If the customer later signs with another vendor, that is a separate deal and commission event.

### 12. Onboarding and Customer Success
After signature, MMHR supports onboarding with configurable check-ins, tasks, milestones, issues/escalations, and completion status.

If onboarding fails, preserve history and allow a prior alternative vendor to be reactivated. A new signed contract creates a new deal/commission event.

## Purpose-Built CRM

### Customer CRM
Organizations, contacts, roles, decision makers, relationship history, notes, interactions, purchases, deals, contracts, renewals/replacements, onboarding history, needs, and preferences.

### Vendor CRM
Organization, products, contacts, partner contacts, relationship notes, RFP/demo/deal history, win/loss history, commission structures/agreements, payment terms, outstanding commissions, and performance metrics.

### Deal Records
Deals are first-class objects linked to customer and vendor. Track product, owner, source, stage, dates, RFPs, demos, proposals, pricing, selection, contract, value where known, commissions, onboarding, renewals, notes, and activity history.

## Internal Work Management
Tasks, due dates, reminders, follow-up queues, deal-stage alerts, contract check-ins, commission reminders, onboarding check-ins, renewal/replacement reminders, escalations, notes, and reassignment.

## AI Strategy
AI is an internal copilot, not the final decision maker. Use it for RFP drafting, summarization, extraction, normalization, missing-information detection, comparison drafts, follow-ups, CRM summaries, risk flags, suggested next actions, and internal knowledge search.

## Communications
Use Resend initially behind an abstraction layer. Associate communications with customers, vendors, deals, RFPs, demos, contracts, commissions, and onboarding records.

## Document Management
Secure storage/versioning for RFPs, responses, proposals, pricing, agreements, commission agreements, contract-related documents, and onboarding documents. Include metadata, access controls, audit history, and search.

## KPIs
Revenue/commission: signed deals, contract value where known, commission earned/invoiced/collected/outstanding/overdue.

Pipeline: deals by stage/vendor/customer/rep, conversion rates, time in stage, intake-to-signature time.

Vendor performance: response rate/time, qualification/demo/win rates, deal value, commission generated, payment timeliness, onboarding outcomes.

Customer journey: active evaluations, vendors evaluated, demo rounds, time to decision, repeat purchases, onboarding completion, upcoming renewals/replacements.

Operations: open/overdue tasks, RFPs awaiting approval, responses awaiting review, demos awaiting scheduling, contracts awaiting follow-up, commissions awaiting invoice/payment, onboarding issues.

## Security and Audit
Granular authorization, organization isolation, audit logs, secure authentication/sessions, secure file storage, encryption, backup/recovery, sensitive-field controls, export controls, activity history, error monitoring, and appropriate privacy/legal notices.

## Super Admin Configuration
Configure users, roles, permissions, vendor/customer records, stages, questionnaires, scorecards, RFP/email templates, reminders, commission structures, reporting, AI settings/approvals, document categories, and system settings.

## Product Principles
1. Full internal platform, not SaaS.
2. Flexible workflow, not rigid funnel.
3. Human-in-the-loop at trust and judgment points.
4. AI handles administrative workload, not final decisions.
5. Every deal remains historically traceable.
6. Every significant feature is permission-aware.
7. Relationships are first-class data.
8. Commissions are tracked from signature through collection.
9. Accommodate vendor processes when necessary.
10. Maintain a white-glove customer experience.
