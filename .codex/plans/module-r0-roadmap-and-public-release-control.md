# R0 Roadmap and Public-Release Control

## Document Control

| Field | Value |
|---|---|
| Version | 0.6 |
| Date | 2026-08-31 |
| Status | Documentation audit recorded; policy quarantine active; claim approval and production activation pending |
| Product owner | Rob Speciale |
| Parent roadmap | [roadmap-v2-implementation.md](./roadmap-v2-implementation.md) |
| Product authority | [docs/PRD.md](../../docs/PRD.md) |
| Architecture authority | [docs/TECH_STACK.md](../../docs/TECH_STACK.md) |
| Baseline branch | develop |

This record requires public access, indexing, and release to stay blocked while unapproved claims remain.

It does not authorize a branch, commit, dependency, cloud change, deployment, or release.

This document closes the R0 recordkeeping gaps. It does not approve a public
claim, activate production access, or replace a required release decision.

Control records are complete for owners, decisions, exact claim inventory, route
coverage, the release block, recovery, and linked status. Claim evidence,
statement approval, deployment aliases, live verification, and production
approval remain open.

## 1. Owner and Decision Register

| Code | Accountable role | Named owner | Status |
|---|---|---|---|
| PO | Product owner | Rob Speciale | Assigned |
| SEC | Security owner | Rob Speciale | Assigned |
| ENG | Engineering owner | Rob Speciale | Assigned |
| OPS | MMHR operations owner | Rob Speciale (temporary) | Assigned |
| FIN | Finance owner | Rob Speciale | Assigned |
| MKT | Marketing and content owner | Rob Speciale | Assigned |
| DATA | Vendor-data owner | Rob Speciale | Assigned |
| REL | Production release owner | Rob Speciale | Assigned |

Do not infer a named owner from another role.

The product owner owns the current open product decisions in
[docs/PRD.md](../../docs/PRD.md#11-open-product-decisions).

| Decision | Named owner | Required before |
|---|---|---|
| Common RFP plus vendor amendments | Rob Speciale | R4 implementation |
| Exact identity-unmasking rule | Rob Speciale | R3 implementation |
| Customer-visible scoring method | Rob Speciale | R3 release |
| Public vendor-ranking scope | Rob Speciale | Public-ranking work |
| Impersonation support | Rob Speciale, with security approval | R8 implementation |
| Category expansion | Rob Speciale | New-category work |
| Sponsored placement | Rob Speciale | Sponsored-placement work |

## 2. Active Public-Release Block

Public application and API routes must remain unavailable in production.

Search indexing must remain disabled.

The policy block started on 2026-08-27 and stays active until all exit rules pass.

The fail-closed code is implemented and verified locally.

It is not active on the current production deployment.

Repository controls:

- `src/middleware.ts` returns `503` in production by default.
- `PUBLIC_RELEASE_ENABLED=1` is the runtime release switch.
- `PUBLIC_RELEASE_APPROVAL_ID` must match a versioned ID committed in reviewed code.
- Blocked responses use `no-store` and `X-Robots-Tag` crawler controls.
- `/robots.txt` returns `Disallow: /` while the block is active.
- `src/app/layout.tsx` keeps site-wide `noindex` and `nofollow` metadata.
- Static build assets can load, but they do not expose an application page.

The current production site remains accessible with `noindex` metadata.

A separate approved production deployment must activate the fail-closed gate.

Do not set either release value until all exit rules pass.

Neither value replaces the required Git, deployment, or production approval.

### Exit Rules

1. Remove each unsupported claim or attach approved evidence.
2. Record the source, capture date, reviewer, and review date for each approved claim.
3. Pass the R2A copy, consent, privacy, accessibility, metadata, and lead-routing checks.
4. Replace the temporary crawler block with approved release metadata and robots behavior.
5. Commit a versioned release approval ID with the approved metadata change.
6. Test the locked and unlocked production states.
7. Protect or retire old deployment URLs and verify every public alias.
8. Receive product, marketing, security, and release-owner approval.
9. Receive separate production deployment approval.

### Recovery

Set `PUBLIC_RELEASE_ENABLED` to `0` or remove either release value.

Deploy the quarantined build or roll back to a verified quarantined deployment.

Verify the primary domain, every alias, and every retained deployment URL.

Keep the site-wide crawler block active.

Remove or correct the unsafe claim through a reviewed forward change.

Do not delete review history.

## 3. Public-Claim Source Inventory

All rows are blocked. No row has approved business evidence yet.

The product owner decided on 2026-08-27 to retain these statements as placeholders for now.

Do not treat them as approved claims. Keep public release blocked until the required review is complete.

This source-family inventory defines the review scope. Section 4 records the
exact statement text and stable source identifier for each review item.

| ID | Claim family and examples | Render sources | Accountable owner(s) | Required evidence and approval |
|---|---|---|---|---|
| CLM-01 | Automated or continuous vendor research, live checks, recheck times, and zero stale profiles | `src/designs/pulse/Body.tsx`; `src/designs/_content.ts`; `src/app/(marketing)/_site/data.ts`; platform and landscape-report routes | ENG, OPS, DATA, MKT, PO | System evidence, operating record, MKT, DATA, and PO approval |
| CLM-02 | Catalog and requirements counts, including `52`, `+40`, and about `200` capabilities | `src/designs/_content.ts`; `src/designs/pulse/Body.tsx`; broker-model and platform routes | DATA, MKT, PO | Approved catalog count, capture date, DATA and MKT approval |
| CLM-03 | Northwind, Vantage, and Copperline case studies and their `40%`, `75%`, nine-day, and `48h` outcomes | `src/designs/_content.ts`; `src/app/(marketing)/_site/data.ts`; case-study routes; gallery designs | MKT, PO | Real client evidence, publication consent, source record, MKT and PO approval |
| CLM-04 | `74` NPS, `310` selections, hundreds of advisor projects, and other performance history | `src/designs/_content.ts`; shared marketing copy; gallery designs | DATA, MKT, PO | Measured source, period, method, MKT and PO approval |
| CLM-05 | The same commission rate for every vendor and related neutrality statements | `src/designs/_content.ts`; shared footer and page parts; FAQ, blog, broker-model, contact, terms, transparency, and partner routes; gallery designs | FIN, MKT, PO | Current commission schedule, exception review, FIN, MKT, and PO approval |
| CLM-06 | Buyer cost statements, including free, no fee, `$0`, no obligation, and nothing added to price | `src/designs/_content.ts`; shared footer and page parts; FAQ, broker-model, contact, services, terms, transparency, resource, and partner routes; gallery designs | FIN, MKT, PO | Approved commercial policy, FIN, MKT, and PO approval |
| CLM-07 | CBIZ Centrally HR reseller affiliation, labeling, and equal-scoring statements | `src/designs/_content.ts`; FAQ, blog, contact, terms, and transparency routes; gallery designs | FIN, MKT, PO | Current agreement, disclosure review, FIN, MKT, and PO approval |
| CLM-08 | Available marketplace, builder, scorecard, plan, collaboration, advisor, and self-service behavior | `src/designs/_content.ts`; FAQ, broker-model, platform, services, resources, and partner routes; gallery designs | ENG, MKT, PO | End-to-end product evidence, release status, PO and MKT approval |
| CLM-09 | Verified pricing, market medians, comparable-company prices, savings, and scheduled refreshes | `src/designs/_content.ts`; `src/app/(marketing)/_site/data.ts`; about, blog, platform, services, FAQ, landscape-report, and partner routes; gallery designs | DATA, MKT, PO | Licensed sources, method, freshness record, DATA, MKT, and PO approval |
| CLM-10 | No sponsored placement, no paid position, organic ordering, and neutral ranking | platform, broker-model, transparency, landscape-report, and software-vendor routes; gallery designs | SEC, DATA, MKT, PO | Approved ranking policy, tests, MKT, DATA, SEC, and PO approval |
| CLM-11 | Privacy, retention, deletion, response-time, consent, and data-sharing statements | privacy, terms, transparency, FAQ, and resource routes | SEC, PO | Implemented controls, legal review, SEC and PO approval |
| CLM-12 | Partner, referral, implementation, private-equity, and broker service statements | partner-finder, brokers-consultants, pe-vc, and software-vendor routes | OPS, FIN, MKT, PO | Current operating policy, agreement evidence, OPS, FIN, MKT, and PO approval |
| CLM-13 | Active blog dates, weekly pricing updates, newsletters, reports, and gated downloads | `src/app/(marketing)/_site/data.ts`; blog, resources, landscape-report, and Pulse routes | ENG, MKT, PO | Working content workflow, current content, consent evidence, MKT and PO approval |
| CLM-14 | Customer-size ranges, service coverage, timelines, and advisor availability | FAQ, services, contact, about, broker-model, and partner routes | OPS, MKT, PO | Current service policy, capacity evidence, OPS, MKT, and PO approval |
| CLM-15 | Buyer-side brokerage and related positioning in global metadata and shared chrome | `src/app/layout.tsx`; `src/app/(marketing)/_site/Footer.tsx`; shared page metadata | MKT, PO | Approved positioning and disclosure, MKT and PO approval |
| CLM-16 | Claims about buyer behavior, vendor incentives, selection failures, and process outcomes | about, blog, broker-model, services, requirements-builder, and partner routes | MKT, PO | Approved editorial source or qualified opinion label, MKT and PO approval |
| CLM-17 | Design-specific vendor prices, fit scores, savings, timelines, testimonials, and operating figures | `src/designs/*/Design.tsx`; `src/designs/_content.ts`; `/designs`; `/designs/[slug]` | MKT, PO | Treat as illustrative only or replace with approved evidence; MKT and PO approval |

### Route Coverage

| Public surface | Inventory coverage |
|---|---|
| `/` | CLM-01 through CLM-10 and CLM-15 |
| `/about` | CLM-09, CLM-14, CLM-15, and CLM-16 |
| `/blog` and `/blog/[slug]` | CLM-05, CLM-09, CLM-13, and CLM-16 |
| `/broker-model` | CLM-02, CLM-05 through CLM-10, CLM-15, and CLM-16 |
| `/case-studies` and `/case-studies/[slug]` | CLM-03 |
| `/contact` | CLM-05 through CLM-07 and CLM-14 |
| `/faq` | CLM-05 through CLM-09, CLM-11, and CLM-14 |
| `/platform` | CLM-01, CLM-02, CLM-08 through CLM-10, and CLM-15 |
| `/services` | CLM-06, CLM-08, CLM-09, CLM-14, and CLM-16 |
| `/terms`, `/privacy`, and `/transparency` | CLM-05 through CLM-07, CLM-09 through CLM-11, and CLM-15 |
| `/resources` and child routes | CLM-01, CLM-06, CLM-08 through CLM-13, and CLM-16 |
| `/partners` child routes | CLM-05 through CLM-12, CLM-14, and CLM-15 |
| `/designs` and `/designs/[slug]` | CLM-01 through CLM-10, CLM-15, and CLM-17 |

## 4. Exact Public-Claim Review Register

This register was captured from the current public route sources and retained
design gallery on 2026-08-31. Repeated renderings use one source identifier.

Every row is blocked. No row has approved evidence, reviewer, or publication
approval. A source path does not prove that the statement is true.

| Claim ID | Exact public statement | Stable source identifier | Evidence source | Capture date | Reviewer | Review date | Decision |
|---|---|---|---|---|---|---|---|
| CLM-01.1 | “kept current by an automated research pipeline rather than a stale spreadsheet.” | `src/designs/_content.ts:ADVANTAGES[0].body` | Not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-01.2 | “Pricing is re-checked on a schedule by an automated pipeline.” | `src/app/(marketing)/(site)/platform/page.tsx:CAPABILITIES[1].p` | Not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-01.3 | “An automated research pipeline re-checks vendor pricing on a schedule rather than when someone remembers to.” | `src/app/(marketing)/_site/data.ts:FAQS[3].a` | Not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-02.1 | “52 HRIS profiles with verified pricing, module-level capability scores, and honest pros and cons.” | `src/designs/_content.ts:TOOLS[0].blurb` | Not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-02.2 | “Tag ~200 HRIS features as must-have, nice-to-have, or irrelevant.” | `src/designs/_content.ts:TOOLS[1].blurb` | Not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-02.3 | “52 systems, profiled the same way” and “+ 36 more” | `src/app/(marketing)/(site)/platform/page.tsx:CAPABILITIES[0].h; platform vendor wall` | Not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-02.4 | “+ 40 more” systems in the retained design gallery | `src/designs/pulse/Body.tsx:vendor wall` and repeated gallery vendor walls | Not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-03.1 | “40%” and “off annual payroll fees” for Northwind | `src/app/(marketing)/_site/data.ts:CASE_STUDIES[0]` | Client evidence and publication consent not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-03.2 | “75%” and “less evaluation time” for Vantage, including “three vendors in nine days” | `src/app/(marketing)/_site/data.ts:CASE_STUDIES[1]` | Client evidence and publication consent not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-03.3 | “3” and “best-fit vendors in 48h” for Copperline | `src/app/(marketing)/_site/data.ts:CASE_STUDIES[2]` | Client evidence and publication consent not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-04.1 | “74” and “Net promoter score” | `src/designs/_content.ts:STATS[1]` | Measurement source and period not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-04.2 | “310” and “Selections guided” | `src/designs/_content.ts:STATS[2]` | Measurement source and period not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-04.3 | “A dedicated expert who has run hundreds of these.” | `src/designs/_content.ts:TOOLS[5].blurb` | Operating record not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-05.1 | “Whichever system you pick, we're paid the identical commission. Steering you cannot make us more money.” | `src/designs/_content.ts:TRUST[0].body` | Current commission schedule and exception review not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-05.2 | “Our commission is the identical rate regardless of which system you choose” | `src/app/(marketing)/(site)/transparency/page.tsx:commission-rate section` | Current commission schedule and exception review not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-06.1 | “Not a fee, not a subscription, and not passed along in the price the vendor quotes you.” | `src/designs/_content.ts:TRUST[1].body` | Approved commercial policy not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-06.2 | “You pay nothing — not a fee, not a subscription, and nothing added to the price the vendor quotes you.” | `src/app/(marketing)/(site)/transparency/page.tsx:who-pays-us section` | Approved commercial policy not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-06.3 | “Free to you, always. The vendor pays our commission — the same rate whichever system you choose.” | `src/app/(marketing)/_site/PageParts.tsx:CTA.default body` | Approved commercial policy not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-07.1 | “We resell one system, CBIZ Centrally HR.” | `src/designs/_content.ts:TRUST[2].body` | Current agreement and disclosure review not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-07.2 | “We are a reseller of CBIZ Centrally HR.” | `src/app/(marketing)/(site)/transparency/page.tsx:reseller section` | Current agreement and disclosure review not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-07.3 | “It is labelled wherever it appears and ranks on the same data as everything else.” | `src/designs/_content.ts:TRUST[2].body` | Disclosure and ranking evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-08.1 | “The marketplace, requirements builder, scorecards, project plans, team collaboration and advisor access that run an HRIS evaluation end to end.” | `src/app/(marketing)/(site)/platform/page.tsx:metadata.description` | End-to-end product evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-08.2 | “The platform replaces both with shared requirements, verified pricing, and scorecards your whole team works from.” | `src/app/(marketing)/(site)/platform/page.tsx:PageHero.lede` | End-to-end product evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-09.1 | “Send us the quote. We benchmark it against what comparable companies paid.” | `src/app/(marketing)/(site)/broker-model/page.tsx:STEPS[3].p` | Licensed benchmark source and method not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-09.2 | “Every figure carries the date it was last verified.” | `src/app/(marketing)/(site)/resources/hris-landscape-report/page.tsx:method section` | Source registry and freshness record not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-10.1 | “No sponsored placements and no vendor-written blurbs.” | `src/app/(marketing)/(site)/platform/page.tsx:CAPABILITIES[0].p` | Ranking policy and test evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-10.2 | “Placement cannot be bought.” | `src/app/(marketing)/(site)/partners/software-vendors/page.tsx:arrangement list` | Ranking policy and test evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-11.1 | “We do not sell your contact details, and we do not pass them to vendors as leads.” | `src/app/(marketing)/(site)/privacy/page.tsx:who-we-share-it-with section` | Implemented privacy controls and legal review not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-11.2 | “Delete your account and we remove it inside 30 days, except where we are required to retain records.” | `src/app/(marketing)/(site)/privacy/page.tsx:how-long-we-keep-it section` | Retention and deletion evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-12.1 | “We take no commission on implementation work.” | `src/app/(marketing)/(site)/resources/partner-finder/page.tsx:how-partners-are-listed section` | Operating policy and agreement evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-12.2 | “Your client pays nothing, and you keep the relationship you already have with them.” | `src/app/(marketing)/(site)/partners/brokers-consultants/page.tsx:WAYS[0].p` | Current referral policy not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-13.1 | “What moved in vendor pricing this week, in one email. No account required.” | `src/app/(marketing)/(site)/resources/page.tsx:CTA` | Content workflow and consent evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-14.1 | “Most of the companies we guide are between 100 and 5,000 employees.” | `src/app/(marketing)/_site/data.ts:FAQS[7].a` | Service policy and capacity evidence not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-15.1 | “MatchMaker HR — buyer-side HRIS brokerage.” | `src/app/layout.tsx:metadata.description` | Approved positioning and disclosure not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-16.1 | “Every bad selection we have seen started with a demo instead of a requirement.” | `src/app/(marketing)/(site)/about/page.tsx:BELIEFS[1].p` | Approved editorial source not recorded | 2026-08-31 | Not assigned | Not reviewed | Blocked |
| CLM-17.1 | “Company names and figures on these pages are illustrative placeholders while the site is in build, not client claims.” | `src/app/(marketing)/designs/page.tsx:placeholder notice` | No production claim evidence; illustrative status is documented | 2026-08-31 | Not assigned | Not reviewed | Blocked |

The inventory is complete as a control record. Replace each blocked decision
with approved evidence, reviewer, review date, and approval reference before
the statement can appear in an approved public release.

## 5. Control Status and Verification Links

| Control | Current status | Canonical evidence | Owner |
|---|---|---|---|
| Owner and decision register | Complete | Section 1 and `docs/PRD.md#11-open-product-decisions` | PO |
| Exact public-claim inventory and route coverage | Complete as inventory; all decisions blocked | Sections 3 and 4 | MKT, DATA, PO |
| Local fail-closed release gate | Verified locally; not active in current production | `src/lib/public-release.ts`, `src/middleware.ts`, and release tests | ENG, SEC |
| Search crawler block | Active in code; live production state not verified | `src/app/layout.tsx`, `/robots.txt`, and release tests | ENG, MKT |
| Production deployment and old aliases | Open; no current verification recorded | Exit rule 7 and the approved deployment record | REL, ENG |
| Public release | Blocked | Section 2 and the PRD release policy | REL, SEC, PO |

The linked status is authoritative: this record is complete as a control
record, while the release remains blocked until every open control passes.

## 6. R0 Exit Evidence

| Exit item | Status | Evidence |
|---|---|---|
| Product-owner roadmap approval | Complete | Parent roadmap approval record |
| Open product-decision ownership | Complete | PRD decision register and Section 1 |
| Named release owners | Complete | Section 1 assigns every owner role |
| Public claim-family and route inventory with accountable owners | Complete | Sections 3 and 4 |
| Exact claim-by-claim review register | Complete as a blocked register | Section 4 records each statement, source, reviewer, date, and decision |
| Written public-release block | Complete | Section 2 |
| Local technical public-release block | Complete | `src/lib/public-release.ts`, `src/middleware.ts`, and tests |
| Production gate activation | Incomplete | Separate production deployment approval and verification required |
| First module product approval | Complete | R1 plan approval record |
| Canonical-document authority check | Complete | README, PRD, TECH_STACK, roadmap, R0, and R1 records agree |

The R0 control record is complete as a documentation and control record.
Public release remains blocked until the claim, deployment, live-verification,
and approval exit items pass.

## 7. Approval Record

| Approval | Status | Record |
|---|---|---|
| Product-owner R0 control approval | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Placeholder retention decision | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Marketing claim-control review | Pending | Rob Speciale review required |
| Release-control review | Pending | Rob Speciale review required |
| Production quarantine activation | Not authorized | Separate production deployment approval required |
| Production release | Not authorized | Separate approval required after all exit rules pass |
