# R0 Roadmap and Public-Release Control

## Document Control

| Field | Value |
|---|---|
| Version | 0.4 |
| Date | 2026-08-27 |
| Status | Active policy quarantine; placeholders retained; exact claim review and production activation pending |
| Product owner | Rob Speciale |
| Parent roadmap | [roadmap-v2-implementation.md](./roadmap-v2-implementation.md) |
| Product authority | [docs/PRD.md](../../docs/PRD.md) |
| Architecture authority | [docs/TECH_STACK.md](../../docs/TECH_STACK.md) |
| Baseline branch | develop |

This record requires public access, indexing, and release to stay blocked while unapproved claims remain.

It does not authorize a branch, commit, dependency, cloud change, deployment, or release.

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

This source-family inventory defines the review scope.

It does not replace the exact claim-by-claim review register required for R0 closure.

| ID | Claim family and examples | Render sources | Required evidence and approval |
|---|---|---|---|
| CLM-01 | Automated or continuous vendor research, live checks, recheck times, and zero stale profiles | `src/designs/pulse/Body.tsx`; `src/designs/_content.ts`; `src/app/(marketing)/_site/data.ts`; platform and landscape-report routes | System evidence, operating record, MKT, DATA, and PO approval |
| CLM-02 | Catalog and requirements counts, including `52`, `+40`, and about `200` capabilities | `src/designs/_content.ts`; `src/designs/pulse/Body.tsx`; broker-model and platform routes | Approved catalog count, capture date, DATA and MKT approval |
| CLM-03 | Northwind, Vantage, and Copperline case studies and their `40%`, `75%`, nine-day, and `48h` outcomes | `src/designs/_content.ts`; `src/app/(marketing)/_site/data.ts`; case-study routes; gallery designs | Real client evidence, publication consent, source record, MKT and PO approval |
| CLM-04 | `74` NPS, `310` selections, hundreds of advisor projects, and other performance history | `src/designs/_content.ts`; shared marketing copy; gallery designs | Measured source, period, method, MKT and PO approval |
| CLM-05 | The same commission rate for every vendor and related neutrality statements | `src/designs/_content.ts`; shared footer and page parts; FAQ, blog, broker-model, contact, terms, transparency, and partner routes; gallery designs | Current commission schedule, exception review, FIN, MKT, and PO approval |
| CLM-06 | Buyer cost statements, including free, no fee, `$0`, no obligation, and nothing added to price | `src/designs/_content.ts`; shared footer and page parts; FAQ, broker-model, contact, services, terms, transparency, resource, and partner routes; gallery designs | Approved commercial policy, FIN, MKT, and PO approval |
| CLM-07 | CBIZ Centrally HR reseller affiliation, labeling, and equal-scoring statements | `src/designs/_content.ts`; FAQ, blog, contact, terms, and transparency routes; gallery designs | Current agreement, disclosure review, FIN, MKT, and PO approval |
| CLM-08 | Available marketplace, builder, scorecard, plan, collaboration, advisor, and self-service behavior | `src/designs/_content.ts`; FAQ, broker-model, platform, services, resources, and partner routes; gallery designs | End-to-end product evidence, release status, PO and MKT approval |
| CLM-09 | Verified pricing, market medians, comparable-company prices, savings, and scheduled refreshes | `src/designs/_content.ts`; `src/app/(marketing)/_site/data.ts`; about, blog, platform, services, FAQ, landscape-report, and partner routes; gallery designs | Licensed sources, method, freshness record, DATA, MKT, and PO approval |
| CLM-10 | No sponsored placement, no paid position, organic ordering, and neutral ranking | platform, broker-model, transparency, landscape-report, and software-vendor routes; gallery designs | Approved ranking policy, tests, MKT, DATA, SEC, and PO approval |
| CLM-11 | Privacy, retention, deletion, response-time, consent, and data-sharing statements | privacy, terms, transparency, FAQ, and resource routes | Implemented controls, legal review, SEC and PO approval |
| CLM-12 | Partner, referral, implementation, private-equity, and broker service statements | partner-finder, brokers-consultants, pe-vc, and software-vendor routes | Current operating policy, agreement evidence, OPS, FIN, MKT, and PO approval |
| CLM-13 | Active blog dates, weekly pricing updates, newsletters, reports, and gated downloads | `src/app/(marketing)/_site/data.ts`; blog, resources, landscape-report, and Pulse routes | Working content workflow, current content, consent evidence, MKT and PO approval |
| CLM-14 | Customer-size ranges, service coverage, timelines, and advisor availability | FAQ, services, contact, about, broker-model, and partner routes | Current service policy, capacity evidence, OPS, MKT, and PO approval |
| CLM-15 | Buyer-side brokerage and related positioning in global metadata and shared chrome | `src/app/layout.tsx`; `src/app/(marketing)/_site/Footer.tsx`; shared page metadata | Approved positioning and disclosure, MKT and PO approval |
| CLM-16 | Claims about buyer behavior, vendor incentives, selection failures, and process outcomes | about, blog, broker-model, services, requirements-builder, and partner routes | Approved editorial source or qualified opinion label, MKT and PO approval |
| CLM-17 | Design-specific vendor prices, fit scores, savings, timelines, testimonials, and operating figures | `src/designs/*/Design.tsx`; `src/designs/_content.ts`; `/designs`; `/designs/[slug]` | Treat as illustrative only or replace with approved evidence; MKT and PO approval |

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

## 4. Copy Review Record

Use one row for each reviewed claim or approved group.

| Claim ID | Evidence source | Capture date | Reviewer | Review date | Result |
|---|---|---|---|---|---|
| CLM-01 through CLM-17 | No approved evidence recorded | Not recorded | Not assigned | Not reviewed | Blocked |

## 5. R0 Exit Evidence

| Exit item | Status | Evidence |
|---|---|---|
| Product-owner roadmap approval | Complete | Parent roadmap approval record |
| Open product-decision ownership | Complete | PRD decision register and Section 1 |
| Named release owners | Complete | Section 1 assigns every owner role |
| Public claim-family and route inventory | Complete | Sections 3 and 4 |
| Exact claim-by-claim review register | Incomplete | Each statement needs its own source, decision, reviewer, and date |
| Written public-release block | Complete | Section 2 |
| Local technical public-release block | Complete | `src/lib/public-release.ts`, `src/middleware.ts`, and tests |
| Production gate activation | Incomplete | Separate production deployment approval and verification required |
| First module product approval | Complete | R1 plan approval record |
| Canonical-document authority check | Complete | README, PRD, TECH_STACK, roadmap, R0, and R1 records agree |

R0 remains open until the pending records, owners, and production controls are complete.

## 6. Approval Record

| Approval | Status | Record |
|---|---|---|
| Product-owner R0 control approval | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Placeholder retention decision | Approved | Rob Speciale, current Codex task, 2026-08-27 |
| Marketing claim-control review | Pending | Rob Speciale review required |
| Release-control review | Pending | Rob Speciale review required |
| Production quarantine activation | Not authorized | Separate production deployment approval required |
| Production release | Not authorized | Separate approval required after all exit rules pass |
