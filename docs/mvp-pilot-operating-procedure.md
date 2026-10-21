# MMHR manual pilot operating procedure

> **Delivery notice, October 7, 2026.** The product owner approved the [MVP complete UI/UX and backend roadmap, version 1.1](../.codex/plans/build-mvp-complete-ui-ux-roadmap-2026-10-06.md).
> It replaces the October 3 instruction to complete all mandatory software before live use.
> Launch Candidate A ships after roadmap phase P2. Launch Candidate B adds demos, proposals, and contract handoff after P3.
> Financial-record management and private document storage are outside the MVP.
> Where this document conflicts with the roadmap on launch scope or delivery order, follow the roadmap.
> Launch Candidate A uses this procedure for demos, proposals, selection, and contract handoff. Update it before staff acceptance.
> A full rewrite follows the launch.

Date: September 30, 2026.
Status: Draft for operating setup and staff rehearsal. Not approved for live use.
Accountable owner: Rob Speciale. Staff rehearsal: Rob and Jason.
Scope: The manual activities retained by [MVP-07](../.codex/plans/release-mvp-launch-checklist.md).

## Operating boundary

The software supports the customer intake, evaluation, disclosure, approval, and RFP portal path in the MVP.
Staff handle responses, demos, proposals, contract status, commissions, and onboarding during the pilot.
The customer and vendor negotiate legal terms directly.
This procedure does not complete the later v2 software requirements.

Use approved company accounts and access-controlled records.
Do not place customer data, agreements, contact details, or commission amounts in this repository.
Do not send messages, grant access, or approve vendor facts merely because this procedure describes those actions.
Apply the existing authority for each live action.

## Setup before the first case

The following setup items remain open.
Record each decision and its approval in the operational setup record.

| Item | Required decision or evidence |
|---|---|
| Case register | Approved private location, access list, backup method, and record owner |
| Evidence store | Approved private file location, access rules, retention, and version history |
| Customer contact | Approved company channel and consent record |
| Vendor contact | Verified representative, organization, approved channel, and portal account |
| Finance register | Restricted location, finance owner, agreement references, and reconciliation method |
| Escalation | Rob's approved contact route and a named backup during absence |
| Response expectations | Case-specific acknowledgement, response, review, and follow-up due dates |
| Recovery | Account support, unavailable portal, failed delivery, and incident procedures |

Do not start a live pilot case until these locations and responsibilities are confirmed.
Rehearse the procedure with a controlled test case first.

## Minimum case record

Create one case record for each customer purchase effort.
Use its stable identifier in all related operational records.

Record these fields:

- Customer workspace and purchase-effort identifier
- Named MMHR owner and backup
- Current status, next action, responsible person, and due date
- Customer requirements and submitted intake revision
- Published comparison version and selected candidate identifiers
- Customer discussion, disclosure, conflict explanation, and approval references
- RFP base version, recipient list, deadline, and delivery evidence
- Vendor response, clarification, demo, proposal, and source-version references
- Selection decision, risks, introduction date, and contract outcome
- Restricted finance reference and onboarding reference
- Dated activity history, exceptions, and unresolved issues

Keep financial details in the restricted finance record.
Link to that record only where the recipient has permission.
Append corrections with reasons. Preserve prior decisions and document versions.

## Daily case review

1. Review each active case for overdue work.
2. Confirm its owner, next action, and due date.
3. Record new messages and source documents.
4. Escalate missed commitments or unresolved access failures to Rob.
5. Record the new action and the customer's next update date.

Use the agreed case dates rather than an assumed universal response promise.
Any change to a deadline needs a reason and an updated recipient notice.

## RFP handoff

1. Confirm the customer discussion and provider disclosure records.
2. Confirm the approved RFP version and selected recipients.
3. Verify each recipient belongs to the intended vendor organization.
4. Deliver the approved version through the portal.
5. Send the authorized notice through the approved company channel.
6. Record the notice, portal version, response deadline, and acknowledgement due date.
7. Record the vendor acknowledgement.
8. Follow up when the agreed acknowledgement date passes.

Do not alter an approved base after delivery.
Record required changes as a new version or approved additive amendment.
Keep the recipient and approval history for each issued version.

## Vendor responses and clarification

1. Save each response in the approved private evidence store.
2. Record its vendor, RFP version, received date, and source reference.
3. Check the sender and intended customer case.
4. Record missing answers, caveats, dependencies, commitments, and clarification questions.
5. Assign each clarification a due date and owner.
6. Preserve each revised response as a separate version.
7. Obtain MMHR review before sharing consequential conclusions with the customer.

Do not upload private material to an unapproved AI service.
Do not describe an unreviewed extraction as a confirmed vendor fact.
Keep failed ingestion or missing evidence visible in the case record.

## Demos and proposals

1. Record the demo round, audience, purpose, required topics, and participants.
2. Obtain acceptable customer times and time zones.
3. Coordinate the vendor through MMHR.
4. Record MMHR confirmation before describing the event as confirmed.
5. Record attendance, feedback, scores, commitments, evidence, and next actions.
6. Save each proposal with its received date and source version.
7. Record recurring, implementation, optional costs, terms, assumptions, and requested changes.
8. Review the comparison before sharing it with the customer.

Keep unconfirmed times separate from confirmed meetings.
Keep vendor commitments separate from customer assumptions.

## Selection and contract outcome

1. Record the selected vendor, reasons, approvals, and unresolved risks.
2. Record the formal customer-vendor introduction and date.
3. Ask the parties for status updates through the agreed channel.
4. Record Signed, Not Signed, Stalled, or Cancelled with supporting evidence.
5. Preserve the evaluation and earlier candidate history.

MMHR does not negotiate legal terms for either party.
A signed status requires evidence from an authorized party or an approved signed source.
Do not infer a signed contract from a verbal preference or completed introduction.

## Commission and financial closure

1. Confirm the signed contract and effective vendor agreement.
2. Check the contract reference for an existing commission record.
3. Record calculation inputs, currency, amount, agreement version, and reviewer.
4. Obtain the required calculation approval.
5. Record invoice readiness, owner, number, issue date, amount, and due date.
6. Record each payment, received date, amount, balance, and reconciliation evidence.
7. Record disputes, adjustments, overdue actions, and approved resolutions.
8. Close financially only after every related event reaches an approved terminal state.

The permitted terminal states are Paid, Voided, and Written Off.
Keep operational selection or win status separate from financial closure.
The current software does not enforce the complete signing-to-closure chain.
The restricted manual register must therefore carry this pilot control.
Do not place commissions in eligibility or fit scoring.

## Onboarding, failure, and later purchases

1. Record the onboarding owner, milestones, check-ins, risks, and completion criteria.
2. Set follow-up dates for the customer, vendor, product, and known risks.
3. Record issues and escalations with their next actions.
4. Preserve failed onboarding history.
5. Review authority before reactivating a prior candidate.
6. Create a separate purchase-effort record for a later signed contract.
7. Create its separate commission record under the applicable agreement.
8. Record renewal, replacement, or expansion dates and owners.

## Message templates

Replace bracketed fields with reviewed case information.
These templates are drafts. They are not sent by this document task.
Use only the minimum information the recipient needs.

**Vendor notice**

> MMHR has issued RFP [reference], version [version], to your organization.
> Review it through your authorized portal account.
> Confirm receipt by [date and time zone].
> Send your response through [approved channel] by [deadline and time zone].
> Send questions to [MMHR contact].

**Clarification request**

> For RFP [reference], version [version], please clarify [question].
> Include any package limits, dependencies, costs, and supporting source.
> Reply through [approved channel] by [date and time zone].

**Customer progress update**

> The current status for [case reference] is [status].
> The next action is [action].
> [Owner] will complete it by [date].
> The next planned update is [date].

**Contract handoff**

> MMHR has recorded your selected provider as [provider].
> [Customer contact] and [vendor contact] will manage contract terms directly.
> Please send contract status updates through [approved channel].

**Overdue follow-up**

> The agreed date for [action] was [date].
> Confirm the current status and a new expected completion date.
> Contact [MMHR owner] if you need a decision or clarification.

## Staff acceptance record

MVP-07 cannot become Ready from this draft alone.
Rob and Jason must rehearse the procedure through normal accounts and approved record locations.

| Acceptance check | Current result |
|---|---|
| Private record locations, contact channels, owners, and backup confirmed | Open |
| Correct vendor receives the approved RFP and acknowledges it | Open |
| Response, clarification, and revision remain traceable | Open |
| Demo and proposal retain evidence and next actions | Open |
| Selection and contract boundary remain clear | Open |
| Duplicate signing creates no duplicate commission record | Open |
| Partial payment and disputed balance prevent incorrect financial closure | Open |
| Failed onboarding preserves history and supports a reviewed next action | Open |
| Staff recover from missed deadlines, failed delivery, and unavailable access | Open |
| Defects, decisions, and final staff approval recorded | Open |

Record the date, participants, environment, case references, results, defects, and approval reference after rehearsal.
Do not enter personal or confidential case contents into this document.
