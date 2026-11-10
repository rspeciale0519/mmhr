# Phase 1 vendor fact review

Review date: September 15, 2026, America/New_York.
Web retrieval window: September 16, 2026, approximately 00:35–00:38 UTC.
Status as of November 8, 2026: Eight launch-candidate profiles and their basic payroll facts are approved locally. One fictional customer comparison is published locally. Four Gusto and Rippling scope and delivery records remain drafts. Production publication and launch checks remain open.

This packet supports MVP-01 and MVP-02 in the [launch checklist](../.codex/plans/release-mvp-launch-checklist.md).
Rob approved the eight-product scope and scoring policy in the [decision record](../.codex/plans/decision-phase1-catalog-and-scoring.md).
That approval does not approve these individual facts.
The [50-provider inventory](hris-payroll-provider-research-2026-09-14.md) remains the full candidate list.

## Current local catalog status — November 8, 2026

The 50-provider research inventory remains the candidate list. The approved launch subset contains eight products.
All eight local products and profiles are active. Each profile and its basic payroll fact has an approved local review.
GUSTO-02, GUSTO-03, RIPPLING-02, and RIPPLING-03 remain unreviewed local drafts.
The approved fictional customer comparison has eight options: three match and five need confirmation.
Its saved inputs contain no annual cost or setup estimate. Those values remain Unknown.
The comparison is local test evidence. It does not approve customer-specific offers or a production publication.

The sections below retain the status and source information recorded at each dated checkpoint.
Later checkpoints supersede earlier draft and publication status statements.

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
At the initial review date, no row below had a staff approval date. Later checkpoints record local reviews.

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

## Open review decisions at the initial checkpoint

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

## November 8 source recheck

The current official [ADP Workforce Now comparison](https://www.adp.com/what-we-offer/products/adp-workforce-now/compare-options) lists payroll processing in Select, Plus, and Premium.
Plus includes Select, and Premium includes Plus. Benefits administration and time tracking remain plan-specific.

The current official [UKG Ready plans page](https://www.ukg.com/products/ukg-ready/plans) lists payroll in Core.
Plus and Advanced include Core and add selected capabilities. UKG-02 remains a local draft until staff review.

This source recheck does not change the saved evidence capture or expiry dates.
It does not establish customer eligibility, a purchase, a price, or a setup duration.

## November 8 local approvals

The owner approved the five remaining local profile reviews and the UKG-02 evidence review.
The staff interface saved profile approvals for Paycom, Paylocity, isolved, Rippling, and Gusto.
It also saved UKG-02 as approved, with its original September 16 capture and December 15 expiry.
A read-only database check confirms all eight initial profiles approved and both UKG evidence records reviewed.
The UKG delivery label applies to the proposed Core configuration. It does not establish customer fit or price.
At this checkpoint, other scopes, delivery classifications, publication, and customer selection checks remained open.

## November 8 UKG-03 scope draft and comparison preview

UKG-03 is a local draft for proposed UKG Ready Core payroll.
It requires saved US country, employee worker type, and a single-state or multiple-state answer.
The [UKG Ready plan page](https://www.ukg.com/products/ukg-ready/plans) lists payroll in Core.
[UKG payroll guidance](https://www.ukg.com/blog/smb-leaders/how-run-payroll-without-hr-team-small-business-guide) describes multi-state support and says to check applicable jurisdictions and service terms.
Staff must confirm the specific states, tax accounts, and service terms before an offer.
The draft was captured November 8 at 18:50 UTC and expires February 6, 2027 at 18:50 UTC.
It remains unapproved. The customer has not selected a plan or purchased a product.

The native staff interface prepared an unpublished comparison for the existing fictional intake.
It shows nine options: the eight approved real profiles and one existing synthetic product.
Two show confirmed fit, including the synthetic option. All prices and setup estimates are unknown.
UKG delivery appears Native but its scope remains unconfirmed while UKG-03 is a draft.
The preview cannot stand as a real catalog publication while the synthetic product remains eligible.
The existing collector includes all active products with approved active profiles and evidence.
The staff interface exposes product activation but no retirement control. Preserve historical records when resolving this.

## November 8 approved ADP and UKG scopes

The owner approved UKG-03 and ADP-02 for local testing. Both require saved US, employee, and single-state or multiple-state answers.
The owner also approved ADP-03, which records Native payroll delivery in the proposed Workforce Now Select configuration.
The staff interface saved all three decisions. A read-only database check confirms each record is published and approved.
The November 8 capture and February 6, 2027 expiry remain unchanged. Each source has a 90-day review interval.
The earlier UKG-03 draft status above is historical.

An updated unpublished preview of the fictional intake shows nine options and four confirmed matches.
Two matches show Native, one shows Add-on, and one is the existing synthetic product.
Five other options need confirmation. All cost and setup values remain unknown.
The visible matrix contains no vendor-name text, links, or images. Browser warning and error logs were empty.
The one-versus-many state response does not identify actual states. Staff must verify jurisdictions and service terms before an offer.
The synthetic product must be excluded from real-only publication without losing historical selections.

## November 8 Gusto Plus review drafts

GUSTO-02 and GUSTO-03 are saved local drafts. Their review is pending.
The [official plan page](https://gusto.com/product/pricing) lists multi-state payroll in Plus and single-state payroll in Simple.
GUSTO-02 limits the proposed Plus scope to saved US employee payroll and a single-state or multiple-state answer.
GUSTO-03 describes payroll delivery in Plus as Native. The selected plan, jurisdictions, and terms still need confirmation before an offer.
Both sources were captured at 18:57 UTC on November 8 and expire at 18:57 UTC on February 6, 2027.
The records do not establish customer purchase, total cost, implementation duration, or international employee payroll.

The existing product update command supports a reversible retired state with audit and revision checks.
The staff interface does not expose retirement. Retiring the synthetic product would remove it from new comparisons while retaining history.
Do not bypass the staff platform permission check or modify records directly to obtain a real-only preview.

## November 8 real-only preview and Rippling drafts

The owner approved retirement of the local Synthetic payroll 1 product.
The staff-scoped audited product command changed its status from active to retired.
The audit record shows the change. Seven existing comparison entries and one saved choice remain.
A new unpublished preview contains exactly the eight approved real products.
Three match the fictional saved requirement; five need more evidence. Prices and setup remain unknown.
The matrix contained no vendor names, links, or images. Browser warning and error logs were empty.
Retirement is reversible through the audited product command. No previous publication was deleted.

RIPPLING-02 and RIPPLING-03 are unapproved local drafts. Review is pending.
The proposed configuration combines the core platform with the separately purchased US Payroll product.
Scope requires US employee payroll, one or multiple states, and willingness to consider a paid addition.
The [Rippling payroll review](https://www.rippling.com/blog/rippling-payroll-review) describes Payroll as an add-on.
[Multi-state guidance](https://www.rippling.com/blog/hr-operators-guide-to-running-hr-across-multiple-states) describes US multi-state support.
Staff must confirm the actual states and terms before an offer. Willingness is not proof of purchase.
Both drafts were captured November 8 at 19:04 UTC and expire February 6, 2027 at 19:04 UTC.

## November 8 remaining provider source review

These are research findings, not approved comparison facts.

| Provider | Official source finding | Open scope |
|---|---|---|
| Paylocity | Its [multi-state payroll page](https://www.paylocity.com/who-we-serve/multi-state-payroll/) describes processing employees in multiple states. | Confirm the proposed payroll product, commercial configuration, states, and terms. Do not infer time-product inclusion. |
| Paycom | Its [enterprise product page](https://www.paycom.com/who-we-help/enterprise-business/) describes multi-state and multi-entity payroll. | The page targets enterprise customers. Confirm the applicable product and terms before applying the statement to another configuration. |
| isolved | Its [payroll page](https://www.isolvedhcm.com/roles/payroll) describes People Cloud payroll and multi-state tax filing. | Confirm whether the proposed service is direct or partner-delivered, which products are required, and the applicable states and terms. |

No source above establishes a complete customer price or setup estimate.
A provider's general availability does not prove every proposed configuration or jurisdiction.

## November 8 historical customer check

After the synthetic product was retired, the fictional customer could still see one saved choice from comparison version 1.
The page could not load the current version 2 comparison. Its stored input digest no longer matches the current catalog inputs.
The read function rejects a stale comparison. The evidence does not establish which individual catalog change caused the mismatch.
The old choice remains stored and visible. A new reviewed publication is still needed for current options.
This check does not prove a new customer selection or complete Phase 1.

## November 8 estimate-scope check

No published annual cost or setup fact exists for the eight real products.
The matrix continues to show those amounts as Unknown.

The current estimate record includes an employee-count basis and shows that count to the customer.
The current publication-details function does not compare that basis with a saved customer answer.
A read-only synthetic calculation returned a 25-person estimate for both a 10-person and a 250-person input.
No synthetic estimate was saved or approved during this check.

Do not approve a customer-specific amount as a general vendor fact until its scope is resolved.
Keep numerical estimates Unknown where the customer count, plan, or other conditions cannot be verified.
A fix needs a controlled customer count and plan scope, plus matching and mismatch tests.

## November 8 estimate data-flow follow-up

Company context accepts customer-defined labels and answers. It does not define a standard employee-count field.
The publication snapshot retains that context and saved requirements. The detail function receives the requirements, but not the company context.
The detail function validates an estimate and its stated employee basis. It does not establish that the basis matches the customer.
The current integration test checks that the labeled estimate is returned. It does not test a match or mismatch with customer count.

A customer-specific estimate needs a controlled, validated count and plan scope in the saved publication inputs.
Do not guess a count from free-form labels. Treat missing, invalid, or unmatched scope as Unknown.
The read path calculates details from the saved snapshot. Review historical publication behavior before changing that calculation.
Test matching, mismatch, absent input, stale data, and historical reads before using numerical estimates.
This is a data-flow finding, not a change to the approved scoring policy or a claim that the existing labeled estimate is an actual quote.

## November 8 local customer comparison and selections

The owner approved publication for the fictional local customer. The staff interface published comparison version 7 with eight real catalog options.
Three options match the saved payroll requirement. Five need confirmation. Cost and setup remain Unknown.
The same synthetic customer account belongs to the test organization. No real account or provider was contacted.

The native customer page displayed all eight masked options. The comparison contained no provider names, links, or images.
Five choices were selected, reviewed, and saved. The page disabled the remaining choices at the limit.
After refresh, the same five choices remained and the page showed five of five used.
A read-only local database check confirmed version 7, eight options, one selection batch, and five saved items.
A separate authenticated local server request attempted a sixth choice. The server returned `42501` with `Initial candidate limit reached`; the saved count remained five.

Browser warning and error logs were empty. The app server recorded successful responses for customer page loads and the selection request.
The native browser did not expose complete network response inspection, so identity masking in all returned network data remains unverified.
Gusto and Rippling draft review decisions remain pending. Later evidence changes may require a fresh comparison.

## November 8 customer phone view and returned data

At a 320-pixel viewport, the customer page width was 305 pixels with no page-level horizontal overflow.
The comparison viewport was 263 pixels wide with 1,264 pixels of scrollable content. Requirement labels remained sticky.
Keyboard focus reached Option 8. Enter opened its evidence and Space closed it. The browser viewport was restored.
An authenticated synthetic customer read the current local publication directly through the normal customer RPC.
The full response contained eight options. It contained no listed provider names, provider or product IDs, URLs, images, or checked private evidence fields.
This is evidence for that local customer response. It is not a complete capture of every browser network request or hosted deployment.

## November 8 customer selection retry

The same fictional customer repeated the exact saved selection request with its original retry key.
The local server returned the original selection as `replayed` and did not create another batch.
A changed selection with the same key was rejected as `22023` `Invalid security command input`.
A read-only check still found one selection batch, five items, and five initial candidates.
The first diagnostic expected the wrong rejection code, `42501`, and failed its assertion. The corrected check used the command's documented `22023` behavior and passed.

## November 8 direct customer product read

The authenticated fictional customer attempted to read the eight masked products directly from the local product table.
The request returned `42501` and no product records. The customer had not received provider disclosure.
This check supports masking for this path. It does not establish complete authorization, RLS coverage, or hosted isolation.

## November 8 native loading and empty states

A synthetic customer created a local fictional intake with one fictional requirement. No provider was contacted.
Before submission, its comparison page said to submit the saved intake first. The loading message was visible during navigation.
After submission, the page said MMHR must publish an approved comparison before choices are available.
No choice control appeared. The empty saved-choice count remained zero. Browser warning and error logs were empty.
The app server returned 200 for the local draft, requirement, submission, and comparison requests.

## November 8 native stale comparison retry

The older fictional intake still showed an unavailable-comparison message and a Reload comparison link.
After retry, it still needed a fresh publication. Its earlier saved choice remained visible and still counted as one of five.
Browser warning and error logs were empty. The test tab was returned to the current fictional comparison.
This checks the displayed error and retry behavior. It does not show recovery without a new reviewed publication.

## November 8 additional official source review

These findings are research only. They are not approved catalog facts or published claims.
Sources were checked November 8, 2026. Review them again within 90 days, by February 6, 2027.

| Provider | Source and finding | Limits before catalog approval |
|---|---|---|
| Paycom | Its [small-business payroll article](https://www.paycom.com/resources/blog/best-payroll-software-for-small-businesses-in-2026/) describes its HR and payroll software for small businesses. It claims direct tax filing in all 50 states. Its [midmarket article](https://www.paycom.com/resources/blog/best-payroll-for-midmarket-businesses/) also describes multistate payroll. | These are provider claims. Confirm the offered configuration, the employer's actual states, service terms, eligibility, price, and setup time. The sources do not establish an offer for the fictional 25-person customer. |
| Paylocity | Its [multistate payroll page](https://www.paylocity.com/who-we-serve/multi-state-payroll/) describes processing employees across states in one payroll run. Its [pricing page](https://www.paylocity.com/pricing/) describes configurable pricing. | Confirm the exact package, payroll inclusion, jurisdictions, and service terms. No customer-specific cost or implementation time is established. |
| isolved | Its [payroll page](https://www.isolvedhcm.com/roles/payroll) describes payroll and multistate tax filing in People Cloud. Its [support page](https://www.isolvedhcm.com/contact) states that some customers contract through a network partner that administers the account. | Identify the contracting and service provider for each offer. Do not assume direct service or a partner arrangement for every customer. Confirm the package, states, cost, and setup time. |

Do not substitute a provider's marketing comparison for independent confirmation of another vendor's features.

## November 10: review packet for three payroll products

These are research notes for the approved eight-product launch subset.
They are not catalog records, approvals, quotes, or a published comparison.
The other 42 providers remain candidates in the 50-provider inventory.
The public vendor-owned pages below were checked on November 10, 2026, around 20:58–20:59 UTC.
Use them as review links. Public access does not establish permission to reuse page content.
Staff must record permitted use, source ownership, capture time, and a review decision before publication.
The approved capability-fact review period is 90 days. The next review is due no later than February 8, 2027.
An earlier source expiry takes priority. Do not substitute this research date for an existing evidence record's capture date.

| Review item | Provider's statement, summarized | Candidate use and limits |
|---|---|---|
| PAYLOCITY-02 | Paylocity says its payroll service can process employees in several states within one payroll run. [Source](https://www.paylocity.com/who-we-serve/multi-state-payroll/) | Review a proposed US employee payroll scope for the Paylocity Payroll product. Confirm the offered configuration, payroll entitlement, actual states, and terms. The page does not establish that Time & Labor is included. Delivery classification and customer price remain Unknown until reviewed. |
| PAYCOM-02 | Paycom says it offers direct payroll tax filing in all 50 states for small businesses. [Source](https://www.paycom.com/resources/blog/best-payroll-software-for-small-businesses-in-2026/) | Review the proposed Paycom payroll scope and the separate [multistate evidence](https://www.paycom.com/who-we-help/enterprise-business/). The enterprise page does not by itself establish terms for a small employer. Confirm the offered configuration, employee eligibility, actual states, and terms. Do not infer a complete price or implementation time. |
| ISOLVED-02 | isolved says People Cloud supports payroll tax filing across multiple states. [Source](https://www.isolvedhcm.com/roles/payroll) | Review the proposed People Cloud payroll scope. Confirm the offered modules, the actual states, and the service agreement. The page does not identify the provider that would administer a particular customer's account. |
| ISOLVED-03 | isolved says some customers contract with a network partner that administers their account and provides direct support. [Source](https://www.isolvedhcm.com/contact) | Record the actual contracting and service provider for the proposed offer. Do not label every isolved option direct or partner-delivered. If the offer or the customer's partner preference is unknown, keep the affected result Unknown. |

These review labels are document references only. They have not been created in the local catalog.
Do not use an empty scope to turn an unverified package, jurisdiction, worker type, or partner condition into a match.
Do not treat a provider's statement about another vendor as evidence for that other vendor.
No source above establishes a complete customer-specific annual cost or setup estimate.

The following SHA-256 values cover only the exact original summary sentences in the table, encoded as UTF-8 without a trailing newline.
They are not hashes of the vendor pages or evidence of a reuse license.

| Review item | Original-summary SHA-256 |
|---|---|
| PAYLOCITY-02 | `9c30dba42107789db7745e078ec39be787ab2100fbf9bd41b31a6f1b6f28ff37` |
| PAYCOM-02 | `08a7d70a98de2611a662863dd6897fde23582f9904cfad9a4508049763efa46d` |
| ISOLVED-02 | `3d92bb53c3cb814556e8d29b872d75107659587426c2f3768ea4bb0939d4d255` |
| ISOLVED-03 | `6e5ba4beda66469183dc3a44cdf6696f60c9305b457658b55b5f2bbf2c32a6d9` |
