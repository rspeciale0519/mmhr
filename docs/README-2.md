> **Superseded:** [README.md](./README.md) became the canonical project entry point on 2026-08-24. Keep this draft for history only.

# MMHR

MMHR is an internal software-selection, vendor-management, CRM, deal-flow, commission-tracking, and customer-success platform. It is built for MMHR's own operations and is not SaaS.

## End-to-End Workflow
1. Customer intake and initial evaluation
2. Blind/masked scorecard
3. Selection of up to five initial vendors
4. RFP questionnaire, including demo rounds/audiences
5. Mandatory MMHR review and customer clarification
6. Vendor RFP distribution
7. Structured or free-form vendor responses
8. AI-assisted extraction with human approval
9. Flexible comparison and shortlisting
10. One or more demo rounds
11. Proposal/pricing tracking and iterative evaluation
12. Final vendor selection
13. Direct customer/vendor contract negotiation
14. Commission invoicing and collection tracking
15. MMHR-supported onboarding
16. Long-term CRM, renewal, and repeat-deal management

## Core Modules
Customer Portal, Vendor Portal, Internal Admin Portal, Customer CRM, Vendor CRM, Deal Management, RFP Management, Vendor Response Management, Demo Management, Proposal/Pricing Management, Contract Handoff, Commission Management, Onboarding/Customer Success, Tasks/Reminders, Document Management, AI Assistance, KPI Reporting, Granular Permissions, and Audit Logging.

## Workflow Philosophy
The system does not force a fixed shortlist. Customers may keep any number of vendors active and narrow the field when appropriate.

MMHR remains the communication hub through evaluation. After final vendor selection, MMHR introduces the parties and steps out of direct legal/contract negotiations.

## Human-in-the-Loop
Human review remains at important trust/judgment points including RFP approval, consequential response interpretation, customer-facing comparisons, demo coordination, relationship management, and final handoff.

## AI
AI is an internal copilot for drafting, summarization, extraction, normalization, missing-information detection, comparison notes, follow-ups, CRM summaries, risk flags, and suggested next actions. AI does not independently select vendors.

## Roles and Permissions
Internal roles: Super Admin, Admin, Sales Rep/Staff.
External roles: Customer Organization Admin/User and Vendor Organization Admin/User.

Every significant feature, action, sensitive field, approval, export, and financial capability should be permission-aware.

## Commission Model
Each vendor can have its own commission structure. A commission event is triggered when a customer signs with that vendor and is tracked from earned to invoiced to paid. Later contracts create separate deal/commission events.

## Development Approach
This is the complete internal platform, not a stripped-down MVP. Development can be sequenced into logical modules, but the architecture supports the full system from the beginning.

## Documentation
- [PRD.md](./PRD.md): canonical product requirements
- [TECH_STACK.md](./TECH_STACK.md): canonical architecture and technology choices
