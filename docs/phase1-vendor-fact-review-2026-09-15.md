# Phase 1 vendor fact review

Review date: September 15, 2026, America/New_York.
Web retrieval window: September 16, 2026, approximately 00:35–00:38 UTC.
Status: Eight payroll evidence drafts were entered locally on September 16. Individual reviews and publication remain open.

This packet supports MVP-01 and MVP-02 in the [launch checklist](../.codex/plans/release-mvp-launch-checklist.md).
Rob approved the eight-product scope and scoring policy in the [decision record](../.codex/plans/decision-phase1-catalog-and-scoring.md).
That approval does not approve these individual facts.
The [50-provider inventory](hris-payroll-provider-research-2026-09-14.md) remains the full candidate list.

## Record rules

Each row below identifies a product, a proposed fact, its source, and conditions that prevent an unsupported match.
The row IDs are document references, not application UUIDs.
Use one comparison option per underlying product. Plans and additional modules are conditions of that option.
Do not combine facts from a different product sold by the same provider.

Capture method: manual review of public official pages, with short original factual summaries and direct links.
This packet contains no copied images, testimonials, full pages, or vendor contact submissions.
Source type: `vendor_owned`. Proposed source owner: Rob.
Public accessibility does not establish a reuse license. Staff must record permitted use before publication.
Keep original summaries and their hashes as evidence artifacts; do not label a summary hash as a full-page hash.

Review capability and package facts within 90 days of their actual capture timestamp.
Review cost and setup facts within 30 days. An earlier source expiry takes priority.
These freshness periods are approved policy, not new decisions.
Do not replace the capture time with the approval time.
No row below has a staff approval date yet.

## Proposed product facts

| Record | Product and source | Fact supported by the source | Conditions and remaining limits |
|---|---|---|---|
| ADP-01 | ADP Workforce Now: [package comparison](https://www.adp.com/what-we-offer/products/adp-workforce-now/compare-options.aspx) | Select includes payroll, tax services, HR records, and employee self-service. Plus adds benefits administration. Premium adds time and attendance. | Confirm the selected US package. Do not assign Premium time features to Select. Do not include Lyric or RUN facts. Worker exceptions remain subject to review. |
| UKG-01 | UKG Ready: [plans](https://www.ukg.com/products/ukg-ready/plans) | Core includes HR, payroll services, time, basic scheduling, and benefits. Plus adds three selected capabilities. Advanced adds six. | Record the actual selected capabilities; a choice list does not include every item. Start has selected capabilities and a stated audience below 200 employees. Keep UKG Pro separate. |
| PAYLOCITY-01 | Paylocity Payroll: [payroll](https://www.paylocity.com/products/hr/payroll/) | The payroll product provides processing, review tools, payroll audits, and tax support. Time & Labor can supply hours and labor allocations. | Confirm the payroll contract and any Time & Labor purchase. A connection does not establish included time software. Global payroll is a separate scope. Exact package entitlement remains unknown. |
| PAYCOM-01 | Paycom: [payroll](https://www.paycom.com/software/payroll/) | The payroll product starts scheduled processing and guides employees to resolve errors before submission. Approved time and expense updates can feed payroll. | Confirm the contracted modules and US worker scope. Do not claim every named payment service is included. Global HCM does not establish global payroll. Exact package entitlement remains unknown. |
| ISOLVED-01 | isolved People Cloud: [platform](https://www.isolvedhcm.com/what-we-offer) | The platform combines employee records, payroll, self-service, benefits, time, and talent functions. | Confirm the module schedule and delivery provider. Keep a service partner distinct from the underlying software. Do not create duplicate product options for each reseller. Exact package entitlement remains unknown. |
| RIPPLING-01 | Rippling HRIS with US Payroll: [dated source review](rippling-source-review-2026-09-15.md) | HRIS stores employee records. Payroll uses HR changes and benefit deductions. The pricing page requires the core platform with separately purchased products. | Require the platform and US Payroll product. HRIS alone does not establish payroll inclusion. Keep global payroll, PEO, and EOR separate. Use the actual earlier capture timestamps. |
| GUSTO-01 | Gusto: [plans](https://gusto.com/product/pricing), [payroll](https://gusto.com/product/payroll) | Simple offers single-state payroll. Plus offers multi-state payroll and time tracking. Simple can add paid time tracking. | General availability in 50 states does not make Simple a multi-state plan. Contractor Only does not establish employee payroll. Record the selected plan and additional purchases. |
| BAMBOO-01 | BambooHR: [plans](https://www.bamboohr.com/pricing/), [payroll](https://www.bamboohr.com/platform/payroll/) | Core includes employee records. Payroll is a paid addition for US employees. The payroll product supports deposits and US tax filing. | Require an HR plan plus Payroll. Overseas partner integrations and EOR are separate delivery methods. Pro performance features must not be assigned to Core. |

All eight remain catalog candidates. An unresolved entitlement produces Unknown for that requirement, not an assumed match.
Product availability and customer package suitability are separate facts.
No source in this packet establishes unrestricted payroll support for every employer or worker.

## Delivery labels

The matrix distinguishes native software, paid additions, partner services, limited support, confirmed absence, and unknown information.
Use `native` when the reviewed configuration includes the capability in the named product.
Use `add_on` when the reviewed capability requires a separate product or purchase.
Use `partner` only when evidence establishes another provider's service.
Use `limited` for a documented restriction that the label must explain.
Use `not_supported` only with evidence of absence. Silence in a source means `unknown`.

Proposed examples for review:

| Configuration | Payroll delivery | Other specific distinction |
|---|---|---|
| Workforce Now Select | Native, subject to confirmed US scope | Time and attendance cannot inherit Premium entitlement |
| UKG Ready Core | Native, subject to confirmed US scope | Plus or Advanced selections need their own module evidence |
| Rippling HRIS plus US Payroll | Paid addition | Required platform must also be included |
| Gusto Simple | Native within single-state scope | Time tracking is a paid addition |
| Gusto Plus | Native within reviewed US scope | Time tracking is included in the cited plan |
| BambooHR HR plan plus Payroll | Paid addition | Overseas payroll routes require separate partner evidence |
| Paylocity, Paycom, isolved | Unknown until configuration review | Product availability alone does not settle the purchase arrangement |

These labels are proposed facts. They are not approved `comparison_feature_coverage` records yet.

## Cost and setup review

Customer annual cost remains Unknown until the saved employee count, selected package, and exclusions support a complete estimate.
One-time charges and setup duration remain Unknown for all eight products in this packet.
No marketing claim about fast implementation establishes a customer-specific setup duration.

Gusto's [pricing page](https://gusto.com/product/pricing) lists Simple at USD49 monthly plus USD6 per person monthly.
It lists Plus at USD80 monthly plus USD12 per person monthly.
For an illustrative fixed 25-person Plus subscription, recurring subscription cost is `12 × (80 + 12 × 25) = USD4,560`.
This is a draft arithmetic example, not a quote or approved customer estimate.
It excludes optional services, insurance premiums, payroll funds, taxes, and any separately charged work.
Do not assume unknown one-time charges are zero.
No discount or temporary promotion is included.

BambooHR's [pricing page](https://www.bamboohr.com/pricing/) lists HR plan prices, but its Payroll addition needs separate pricing.
Do not show an HR-only amount as the total HR-and-payroll cost.
The other reviewed sources do not support a complete numerical annual estimate here.

## Application entry and review

1. Resolve the actual vendor organization, profile, and product IDs.
2. Confirm staff access through the normal permission controls.
3. Save each supported fact as a draft through the existing evidence command.
4. Record source permission, citation, capture time, artifact hash, and expiry.
5. Save reviewed package conditions in `comparison_fact_scopes`.
6. Save supported delivery labels in `comparison_feature_coverage`.
7. Obtain a recorded staff decision for each evidence version.
8. Prepare and review the complete comparison before publishing it.

Use typed saved requirement answers for conditions. Missing answers must remain Unknown.
Do not invent a saved package answer, contract, worker type, or country.
Do not set empty conditions to avoid an unresolved package review.
On September 16, the user approved eight local catalog workspaces and scoped access for the existing fictional staff accounts.
The setup completed locally. See [local catalog setup](security/phase1-local-catalog-setup.md).
This approval does not approve individual facts or grant access to external vendor systems.

For BambooHR payroll, a proposed scope can require country `US`, worker type `employee`, and a confirmed Payroll addition.
The actual requirement keys must match saved customer requirements before entry.
Store country and module evidence separately when different sources or expiry periods apply.

## Open review decisions

| Decision | State |
|---|---|
| Eight-product launch scope and scoring policy | Approved; see the existing decision record |
| Exact fact rows and delivery classifications above | Pending staff review |
| Permitted source use and source ownership | Must be recorded before publication |
| Customer-specific package, worker, and regional conditions | Confirm per comparison; missing answers remain Unknown |
| Local catalog application IDs and staff access | Created under September 16 approval; all eight products remain drafts |
| Numerical customer estimates | No approved estimate created |

This packet makes the next review specific. It does not close MVP-01 or MVP-02.

## September 16 application checkpoint

The native staff browser saved one `input_payroll` draft for each of the eight products.
Each draft records a direct official source, original summary, package restrictions, capture date, and expiry.
The application generated the summary hash and assigned the saving staff identity as source owner.
All eight sources use manual capture and a 90-day review interval.
Rippling retains the earlier September 15 source-review time recorded in project memory.
Other records use the documented September 16 UTC retrieval window.
These timestamps describe the source reviews, not the later application-entry time.

A read-only database check confirmed eight products, one fact and evidence version per product, recorded owners, and zero reviews.
All eight products remain drafts. No numerical estimate or customer publication was created.
Package conditions and delivery classifications still need structured records and individual evidence review.
The existing test intake does not contain the required package and regional answers; do not invent those answers.

The local staff session used the previously approved synthetic MFA repair.
It replaced only recognized generated factors on the existing fictional staff account and verified the new factor immediately.
It did not change a password, create an account, send email, or change staff permissions.

### Follow-up: September 16, 01:29 local time

All eight products are now active. Each has an individually approved payroll-availability fact.
BambooHR also has an approved paid-addition delivery classification.
Read-only verification confirms nine evidence versions and nine review records, with source owners and 90-day intervals.
This replaces the earlier draft-only checkpoint above.

All eight vendor profiles still lack catalog approval dates and identities.
The native staff comparison preview excluded those profiles as required by the existing gate.
No real catalog comparison was published. Profile review, structured package scope, and remaining delivery classifications remain open.
See the [catalog controls evidence](security/phase1-catalog-controls-2026-09-16.md).

## September 16 UKG delivery review

The current [UKG Ready plans page](https://www.ukg.com/products/ukg-ready/plans) confirms payroll within Core.
Plus and Advanced retain Core and add selected capabilities.
This supports Native delivery for the reviewed Core configuration.
It does not confirm customer scope, purchase, price, or setup duration.

The native staff form saved UKG-02 as `comparison_feature_coverage`, with `input_payroll: native`.
Capture: September 16, 06:22 UTC. Expiry: December 15, 06:22 UTC. Review interval: 90 days.
The saved page confirmed the source owner, original summary, source link, and draft status.
Automatic approval review rejected the evidence approval for missing specific authorization.
No approval success was observed. A specific UKG-02 question is pending.
The five-profile approval question also remains pending. No rejected action was bypassed.
