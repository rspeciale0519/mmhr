# Phase 1 catalog and scoring decision

Date: 2026-09-15.
Status: Catalog scope and scoring policy approved by Rob on September 15, 2026. Individual fact reviews remain required.
Authority: [Phase 1](../../docs/phased-mvp-development.md#phase-1-vendor-catalog-and-comparison), [MVP-01](release-mvp-launch-checklist.md#ordered-launch-checklist).
Research input: [50-provider inventory](../../docs/hris-payroll-provider-research-2026-09-14.md).

## Decision requested

Approve the eight product candidates below and the scoring policy in this document.
This approves the proposed launch scope and methodology.
Each published fact still needs its source, review, package scope, and expiry record.
It does not approve unknown capabilities, unsupported estimates, vendor invitations, or production changes.

## Proposed first catalog

Start with eight distinct products offering HR and US payroll.
This is a practical review workload, not a market ranking.
Retain all 50 research entries for later additions.
Vendor size, commission, and commercial relationships did not determine this list.

The product scope includes the named HR product and its US payroll module.
It does not imply that payroll or other modules are included in a base subscription.
Country, state, worker, and package restrictions must match the customer case before a requirement receives match credit.

| Catalog key | Product | Proposed scope | Capabilities supported by research | Required confirmation |
|---|---|---|---|---|
| adp_workforce_now | ADP Workforce Now | HR plus US payroll | HR records, payroll, time, benefits, recruiting, performance | Exact modules and payroll service scope; exclude Lyric facts |
| ukg_ready | UKG Ready | Core HR and payroll; higher modules identified separately | HR, payroll, time, benefits; recruiting and performance depend on plan | Core versus Start/Plus/Advanced; selected additional modules |
| paylocity | Paylocity HR and Payroll | HR plus US payroll | HR records, payroll, time, benefits, recruiting, performance | Module schedule; global payroll is a separate country-specific decision |
| paycom | Paycom | HR plus US payroll | HR records, payroll, time, benefits, recruiting, performance | Module scope and payroll exception handling |
| isolved_people_cloud | isolved People Cloud | HR plus US payroll | HR, payroll, time, benefits, recruiting, performance | Direct or service-partner delivery; contracted modules |
| rippling_hris | Rippling HRIS | HRIS plus US payroll | Employee records, payroll; time, benefits, and talent modules | Refresh direct product evidence and confirm purchased modules |
| gusto | Gusto | US payroll with HR records | Payroll, onboarding, documents; time, benefits, recruiting, performance offerings | Exact plan and paid additions; contractor payments are not global employee payroll |
| bamboohr | BambooHR | HR platform plus US Payroll | HR records, US payroll; time, benefits, recruiting, performance offerings | Payroll purchase and HR/talent plan; overseas connectors are separate |

These are product-level research summaries, not blanket assertions that every named feature is included.
The first review can approve evidenced HR and US payroll capabilities for the specified modules.
Other capabilities remain conditional or unknown until package-level evidence supports them.
Customer comparisons must preserve those distinctions.

## Source register for initial review

Proposed source owner: Rob. Review can be performed by authorized MMHR staff.
Capture method: manual review and attributed factual summaries from public official pages.
Capture only permitted material; preserve source references and a hash of the retained evidence artifact.
Do not copy entire websites or assume that a public page grants unrestricted reuse rights.

| Product | Official evidence | Review state |
|---|---|---|
| ADP | [Workforce Now capabilities](https://www.adp.com/what-we-offer/products/adp-workforce-now/capabilities.aspx) | Page retrieved 2026-09-15 |
| UKG | [Ready plans](https://www.ukg.com/products/ukg-ready/plans) | Page retrieved 2026-09-15 |
| Paylocity | [HR](https://www.paylocity.com/products/hr/human-resources-software/), [payroll](https://www.paylocity.com/products/hr/payroll/) | HR indexed official evidence and payroll page reviewed 2026-09-15 |
| Paycom | [HR](https://www.paycom.com/software/hr-management/), [payroll](https://www.paycom.com/software/payroll/) | HR research dated 2026-09-14; payroll page retrieved 2026-09-15 |
| isolved | [People Cloud](https://www.isolvedhcm.com/what-we-offer) | Page retrieved 2026-09-15 |
| Rippling | [HRIS](https://www.rippling.com/products/hr/hris), [payroll](https://www.rippling.com/products/payroll), [pricing](https://www.rippling.com/pricing) | Native browser reviewed all three pages on 2026-09-15; see the [source review](../../docs/rippling-source-review-2026-09-15.md). Fact approval remains pending. |
| Gusto | [HR](https://gusto.com/product/hr), [payroll](https://gusto.com/product/payroll) | Pages retrieved 2026-09-15 |
| BambooHR | [platform](https://www.bamboohr.com/platform/), [US payroll](https://www.bamboohr.com/platform/payroll/) | Platform research dated 2026-09-14; payroll page retrieved 2026-09-15 |

A retrieval date is not an MMHR approval date.
Record approval separately and keep the original capture time.
Rippling stays in the proposed list; do not publish unsupported facts merely to reach eight options.
Resolve its evidence gap before claiming the eight-product catalog is complete.

### Rippling source follow-up, September 15

The web retrieval tool returns HTTP 403 for the HRIS and payroll pages.
Indexed official [pricing information](https://www.rippling.com/pricing) states that payroll and other products require the core platform.
It lists separate payroll, time, benefits, and learning products.
This supports treating module purchase as a condition, rather than assuming base-plan inclusion.
The retrieved index reports a crawl two months earlier; it does not establish today's entitlement or price.
Keep annual cost unknown until an approved quote identifies the required modules, employee basis, currency, and exclusions.
This follow-up supplies provisional source evidence only. Catalog and fact approval remain pending.

The native browser subsequently loaded the current HRIS, payroll, and pricing pages normally.
The [dated source review](../../docs/rippling-source-review-2026-09-15.md) records supported capabilities and open package conditions.
Expanded pricing FAQs confirm the required platform and separate product purchases.
This resolves the direct-page access gap. Pricing amounts, setup duration, and fact approval remain open.

## Fact and estimate rules

Use six coverage labels: Native, Add-on, Partner, Limited, Not supported, and Unknown.
Native means the feature is supplied by the named product or included module.
Add-on means separate purchase is required.
Partner means another provider supplies the capability.
Limited means a documented restriction affects coverage.
Not supported requires affirmative evidence; an omitted feature is Unknown.

Store capability and requirement satisfaction separately.
A paid addition can satisfy a requirement when the reviewed configuration includes it.
A partner service can satisfy a requirement only when the customer accepts that delivery method.
A limited feature earns credit only when its limitation does not conflict with the recorded requirement.
Unresolved package or country conditions remain unknown.

Keep the original evidence, source URL, product, country, plan, captured value, review, and expiry in the staff record.
Expose masked evidence details without branded text or vendor URLs before disclosure.
Keep publication facts and rules immutable once published.
Corrections require reviewed new evidence and a new publication.

Proposed freshness: 90 days for capability and country evidence.
Use 30 days for prices and setup estimates, or the source's earlier expiry.
Expiry runs from capture time, not a later approval date.
Review material product changes immediately.
Expired facts cannot supply current match credit or a current estimate.
Retain historical publications and explain when a current comparison requires refresh.

Do not insert sample prices or rollout dates.
An annual estimate requires currency, employee-count basis, modules, recurring charges, and exclusions.
Show one-time setup charges separately from annual recurring cost.
A setup estimate requires a time unit, scope, source date, and assumptions.
Use Unknown until an approved source supports a usable estimate.

## Recommended scoring policy

Use deterministic, versioned requirement matching.
Retain the saved requirement weights from 1 through 100.
Do not replace existing customer weights or introduce hidden commercial multipliers.
Staff review the submitted requirements, their importance, and their weights before publication.

For each requirement, award full weight only when approved evidence establishes a match.
Award no verified-fit credit for a confirmed mismatch or an unknown result.
Keep unknown and confirmed mismatch visibly different.
Do not award arbitrary half-credit for conditional features.
Condition handling follows the fact rules above.

Verified fit = 100 × matched requirement weight / total requirement weight.
Evidence coverage = 100 × requirement weight with a known match or mismatch / total requirement weight.
Store rounded basis points and display percentages consistently.
Evidence coverage is data completeness, not a probability of success.
Missing information remains in the fit denominator, so thin evidence cannot inflate fit.

Eligibility has three states:
- Meets required capabilities: every required capability has an approved match.
- Required capability does not match: at least one required capability has an approved mismatch.
- Needs confirmation: a required capability is unknown and none has a confirmed mismatch.

With no usable evidence, show Needs confirmation, 0% verified fit, and 0% evidence coverage.
A known required mismatch takes precedence over unknown requirements.
If there are no required capabilities, show eligible only when at least one relevant fact is known.
All published options remain visible in every eligibility state.

This improves the current implementation, which can classify missing required evidence as ineligible.
Keep old publications unchanged.
Introduce the approved behavior through a new rules format and matching database/application tests.
Do not silently change version 1 results.

Keep stable publication option order.
Option numbers identify records; they do not imply rank.
Do not reorder options by vendor name, commission, payment status, or a commercial relationship.
Any future score sorting requires its own explicit design decision.
Keep one option per underlying product unless a material distinction is approved and disclosed.

## Worked examples

These examples use fictional options and saved weights.
They do not describe any real provider.
Requirements: US payroll is required at weight 5; time tracking is required at weight 3; recruiting is optional at weight 2.
Total weight is 10.

| Example | Payroll | Time tracking | Recruiting | Verified fit | Evidence coverage | Eligibility |
|---|---|---|---|---|---|---|
| A | Match | Match | Match | 100% | 100% | Meets required capabilities |
| B | Match | Unknown | Match | 70% | 70% | Needs confirmation |
| C | Match | Confirmed mismatch | Match | 70% | 100% | Required capability does not match |
| D | Match | Match | Unknown | 80% | 80% | Meets required capabilities |
| E | Unknown | Unknown | Unknown | 0% | 0% | Needs confirmation |
| F | Match | Match through an approved paid addition | Unknown | 80% | 80% | Meets required capabilities |

If F's paid addition is not confirmed in the configuration, time tracking becomes Unknown.
F then has 50% verified fit, 50% evidence coverage, and Needs confirmation.
Changing commissions produces no change in any result.

## Approval record

| Decision | State | Evidence |
|---|---|---|
| Eight-product initial catalog scope | Approved | Rob: "Both are approved", after the catalog/scoring and local test access explanation, September 15, 2026 |
| Coverage, freshness, and estimate policy | Approved | Same explicit user approval |
| Versioned scoring policy and examples | Approved | Same explicit user approval |
| Individual real vendor fact records | Pending | Source and package reviews required before publication |

Approval of this proposal does not close MVP-01 alone.
The approved records must exist in the application with the required evidence.
MVP-02 and MVP-03 also need implementation and verification.
