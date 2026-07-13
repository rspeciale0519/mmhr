\# MatchMaker HR — Product Requirements Document (PRD)



| | |

|---|---|

| \*\*Version\*\* | 1.0 |

| \*\*Date\*\* | July 2026 |

| \*\*Status\*\* | Draft for review |

| \*\*Primary source\*\* | `MatchMaker HR — Master Plan.md` |

| \*\*Design reference\*\* | `Homepage.dc.html` (approved direction: "Bold Sage") |



\---



\## 1. Overview



\### 1.1 Product summary

MatchMaker HR is a buyer-side HRIS software brokerage platform. It helps companies research, evaluate, and select the right HRIS at no cost to the buyer. Revenue comes from vendor commissions paid when a customer completes a purchase — the same rate from every vendor, disclosed to every customer.



\### 1.2 Problem statement

HR and finance leaders at SMB-to-mid-market companies (\~50–5,000 employees) face a rare, high-stakes HRIS/payroll purchase every 5–10 years. They lack the time, market knowledge, and tooling to run a rigorous vendor selection, and the traditional vendor-driven sales process works against them.



\### 1.3 Solution

A free, gated platform combining:

1\. A continuously refreshed \*\*HRIS vendor marketplace\*\* (50+ vendors) with pricing, pros/cons, and personalized match scores

2\. A \*\*structured evaluation toolkit\*\* (requirements, scorecards, project plans, team collaboration)

3\. A \*\*human advisor layer\*\* (proposal review, price benchmarking, negotiation guidance)

4\. An \*\*automated research pipeline\*\* that keeps all vendor data fresh — the core moat vs. incumbents whose datasets are manually maintained



\### 1.4 Scope

\- \*\*In scope:\*\* HRIS category only. A true HRIS includes payroll, benefits, time \& attendance, performance, etc. — these are treated as \*module capabilities\* scored within each vendor profile, not separate categories.

\- \*\*Out of scope (v1):\*\* non-HRIS software categories, public/ungated vendor rankings, mobile native apps, self-serve vendor portals.



\### 1.5 Goals \& success metrics

| Goal | Metric | Target (12 mo post-launch) |

|---|---|---|

| Lead generation | Qualified leads captured (complete contact records) | Primary KPI — baseline in Q1, grow QoQ |

| Buyer engagement | Sign-up → shortlist creation rate | ≥ 40% |

| Deal flow | Demo requests per month; deals closed | Growth QoQ |

| Data freshness | % vendor profiles verified within cadence window | ≥ 95% |

| Trust | NPS | ≥ 70 |

| Traffic insight | Visit + page analytics operational | Day 1 |



\---



\## 2. Users \& roles



| Role | Description | Access |

|---|---|---|

| \*\*Visitor\*\* | Anonymous marketing-site visitor | Public pages only; tracked via analytics |

| \*\*Lead / Buyer user\*\* | Registered user (completed lead-capture form) | Full app: marketplace, tools, advisor |

| \*\*Org Admin\*\* | Buyer user managing their workspace | + invite team, assign roles, manage project |

| \*\*Contributor\*\* | Invited teammate | Scoped: score, comment, view (per permissions) |

| \*\*Viewer\*\* | Invited stakeholder | Read-only |

| \*\*Advisor\*\* (internal) | MatchMaker HR expert staff | Advisor console: assigned clients, chat, reviews |

| \*\*SuperAdmin\*\* (internal) | Top of permission hierarchy | Everything, incl. pipeline, data, deals, impersonation |



\---



\## 3. Functional requirements



\### 3.1 Marketing site (public)



\*\*FR-M1 — Pages.\*\* Home, Platform, Broker Model, Services, Case Studies (index + detail), FAQ, About, Contact, Partner pages (Software Vendors; Brokers \& Consultants; PE/VC), Resources (Blog, HRIS Landscape Report, Requirements Builder teaser, HR Service Partner Finder), and a \*\*Transparency page\*\* ("How we make money") disclosing the commission model and the CBIZ Centrally HR reseller affiliation.



\*\*FR-M2 — Homepage sections\*\* (per approved design `Homepage.dc.html`): nav; hero with headline + inline lead-capture form; vendor logo wall; six-tool platform tour; broker-model explainer; stats bar (companies served, NPS, HRIS profiled, annual purchases); case-study cards; FAQ teaser; newsletter block; footer.



\*\*FR-M3 — Newsletter.\*\* Email capture wired to newsletter provider; present on homepage and key pages.



\*\*FR-M4 — CMS-driven content.\*\* Blog posts, case studies, and vendor marketing copy editable by non-developers.



\*\*FR-M5 — SEO.\*\* SSR/static rendering, canonical tags, OG metadata, sitemap.



\### 3.2 Registration gate \& lead capture



\*\*FR-L1 — Mandatory fields.\*\* Access to any vendor data requires: full name, company name, company email, direct company phone number.



\*\*FR-L2 — Work-email validation.\*\* Reject free/personal domains (gmail, yahoo, etc.) with inline guidance.



\*\*FR-L3 — Gated lead magnets.\*\* The same gate applies to the HRIS Landscape Report download and any future gated assets.



\*\*FR-L4 — Consent \& compliance.\*\* Sign-up form includes consent checkbox and links to privacy policy; phone outreach must be TCPA-compliant; cookie-consent banner governs analytics (GDPR/CCPA).



\*\*FR-L5 — Lead routing.\*\* Every captured lead is stored in the `leads` table and surfaces in the SuperAdmin Leads \& Analytics module in near-real-time.



\### 3.3 App — buyer workspace (authenticated)



\*\*FR-A1 — Matching intake wizard.\*\* Multi-step: company size, industry, geography, modules needed, budget, current systems. Output: personalized match scores across the vendor catalog. Progress is saved; wizard is re-editable.



\*\*FR-A2 — Workspace / Home.\*\* Project hub showing selection progress, open tasks, upcoming milestones, and team activity feed.



\*\*FR-A3 — Vendor Marketplace.\*\*

\- Browse/filter/sort 50+ HRIS vendor profiles

\- Each profile: match %, verified pricing estimates, pros/cons, module capability scores, service model, geography, company facts, "last verified" date

\- Shortlisting (add/remove, shared with team)

\- PDF report export of comparisons/shortlists

\- Demo request per vendor (creates a demo\_request record → deal pipeline)



\*\*FR-A4 — Requirements Builder.\*\* Library of \~200 common HRIS features; user tags each as must-have / nice-to-have / not needed; requirements feed match scoring; exportable.



\*\*FR-A5 — Scorecards.\*\* Build from criteria library or custom; weighted scoring; expert question bank per criterion; per-vendor scoring by multiple team members; live use during vendor demos; aggregate + individual views; real-time updates.



\*\*FR-A6 — Project Plans.\*\* User sets go-live date → system generates phased milestone timeline with tasks/checklists and step-by-step guides; tasks can be checked off, assigned, and re-dated.



\*\*FR-A7 — Team collaboration.\*\* Invite by email; roles: admin / contributor / viewer; permission enforcement across all tools; activity tracking.



\*\*FR-A8 — Advisor.\*\* Each org is assigned an advisor. Users can: chat (threaded, near-real-time), book meetings (scheduling embed), and request proposal reviews (upload proposal → advisor analysis with cost benchmarks and negotiation talking points).



\### 3.4 Recommendation engine \& featured placement



\*\*FR-R1 — Match scoring.\*\* Match % per vendor per org computed from intake profile + tagged requirements against vendor capability data. Methodology is documented and published.



\*\*FR-R2 — Featured placement (CBIZ Centrally HR).\*\* CBIZ Centrally HR (white-labeled UKG Ready) appears in \*\*every\*\* recommendation list as a clearly labeled \*\*"Featured — our solution"\*\* placement. It uses identical data quality and scoring as all vendors; only the placement is guaranteed, and it is honestly labeled.



\*\*FR-R3 — De-duplication.\*\* A given organic results list shows either UKG Ready \*\*or\*\* CBIZ Centrally HR (not both). The affiliation is disclosed on the Centrally HR profile and the Transparency page.



\*\*FR-R4 — Organic integrity.\*\* Organic rankings are never manipulated; Centrally HR / UKG Ready earn organic placement on merit like every other vendor.



\### 3.5 Automated research \& scoring pipeline



\*\*FR-P1 — Source registry.\*\* SuperAdmin-managed list of source URLs per vendor (vendor sites, pricing pages, docs, licensed/API data). Review-platform scraping that violates ToS is prohibited; prefer vendor-owned and licensed sources.



\*\*FR-P2 — Scheduling.\*\* Cadence configurable per source or globally: weekly / monthly / quarterly. Manual on-demand runs supported.



\*\*FR-P3 — Crawl \& extract.\*\* Firecrawl (or equivalent) fetches pages; an LLM structured-output step converts unstructured content into validated JSON fields: pricing, module capabilities, service model, geography, company facts, pros/cons.



\*\*FR-P4 — Validate \& diff.\*\* Schema validation, anomaly detection, change-detection vs. prior snapshot. Suspicious or high-impact changes enter a human review queue; nothing publishes without approval rules being satisfied.



\*\*FR-P5 — Versioning \& traceability.\*\* Every snapshot versioned; every published score traceable to source data + capture date.



\*\*FR-P6 — Publish.\*\* Approved data goes live in the Marketplace with "last verified" dates.



\### 3.6 SuperAdmin dashboard (internal)



\*\*FR-S1 — Pipeline control.\*\* Source registry CRUD; cadence config; manual run triggers; run status \& failure monitoring; extraction diff review; approve/reject queue.



\*\*FR-S2 — Vendor data management.\*\* Full CRUD on vendor profiles, pricing benchmarks, capability scores; manual overrides with audit trail.



\*\*FR-S3 — Scoring engine config.\*\* Adjust weights/methodology; preview ranking impact before publishing.



\*\*FR-S4 — User \& org management.\*\* All customer workspaces, role management, support impersonation (audited).



\*\*FR-S5 — Advisor operations.\*\* Advisor assignment, client pipeline view, proposal review queue, chat oversight.



\*\*FR-S6 — Deals \& commissions.\*\* Track demo requests → deals → closed-won → commission revenue.



\*\*FR-S7 — Leads \& analytics.\*\* Lead records (name, company, work email, phone) with view/filter/export; visit tracking (sessions, referral sources, arrival times); most-visited pages; marketing-page → sign-up funnels.



\*\*FR-S8 — Content \& site.\*\* Case studies, blog, featured-placement settings, transparency disclosures.



\*\*FR-S9 — System health.\*\* Job queues, API usage \& costs (Firecrawl + LLM), error rates.



\*\*FR-S10 — Audit log.\*\* All SuperAdmin mutations logged (who, what, when, before/after).



\### 3.7 Analytics \& tracking



\*\*FR-T1 — Visit tracking.\*\* Arrival time, session, referral source, device — for all visitors (subject to consent).



\*\*FR-T2 — Page analytics.\*\* Most-visited pages; content performance.



\*\*FR-T3 — Funnels.\*\* Marketing page → sign-up form → completed lead → activated workspace.



\*\*FR-T4 — Product analytics.\*\* Tool usage within the app (marketplace views, shortlists, scorecards completed, demo requests).



\---



\## 4. Non-functional requirements



| Area | Requirement |

|---|---|

| Performance | Marketing pages LCP < 2.5s; app interactions < 200ms perceived |

| Availability | 99.9% for app \& marketing site |

| Security | Role-based access enforced server-side (RLS); encrypted at rest \& in transit; least-privilege for internal roles |

| Privacy | GDPR/CCPA-aligned; privacy policy discloses lead-data collection \& use; data deletion on request |

| Compliance | TCPA-compliant phone outreach; cookie consent; commission disclosure to every customer |

| Data integrity | All published vendor data versioned \& traceable; freshness SLA ≥ 95% within cadence window |

| Scalability | 50+ vendors, hundreds of sources, thousands of orgs without re-architecture |

| Accessibility | WCAG 2.1 AA for marketing site and core app flows |



\---



\## 5. Technical architecture



\### 5.1 Stack

| Layer | Choice |

|---|---|

| Framework | Next.js 15 (React + TypeScript) — one codebase for marketing + app |

| UI | Tailwind CSS + shadcn/ui |

| State/data | TanStack Query + Zustand |

| API | Next.js API routes / tRPC |

| Database | PostgreSQL (Supabase) + Drizzle or Prisma |

| Auth \& orgs | Supabase Auth (or Clerk for team-invite UX) |

| Background jobs | Trigger.dev or Inngest |

| Crawling | Firecrawl |

| Extraction | LLM (Claude API) structured output |

| CMS | Sanity or Payload |

| Email | Resend (transactional) + Beehiiv (newsletter) |

| PDF export | react-pdf or Puppeteer service |

| Advisor chat | Postgres threads + Supabase Realtime |

| Scheduling | Cal.com embed |

| Hosting | Vercel + Supabase cloud |

| Analytics | PostHog |



\### 5.2 Core data model (tables)

orgs, users, roles/permissions (incl. `superadmin`), vendors, vendor\_snapshots (versioned), vendor\_pricing, features, capability\_scores, sources, source\_schedules, ingestion\_runs, review\_queue, scoring\_configs, requirements, projects, shortlists, scorecards, criteria, scores, tasks/milestones, advisor\_threads, demo\_requests, deals, leads, audit\_log.



\### 5.3 Design direction

Approved homepage direction "Bold Sage": near-white soft-gray canvas (#F7F7F5), bold forest-green accent, warm soft card shadows, Bricolage Grotesque display + Manrope body. All subsequent screens extend this system. Reference: `Homepage.dc.html`.



\---



\## 6. Release plan



| Phase | Contents | Est. duration |

|---|---|---|

| 0 — Design | Hi-fi screens: marketing pages → 8 app screens → SuperAdmin key views | In progress |

| 1 — Marketing site | Public pages + CMS + newsletter + analytics + lead gate | 2–3 wks |

| 2 — App core | Auth/orgs, intake wizard, marketplace, vendor profiles, shortlists | 4–6 wks |

| 3 — Evaluation suite | Requirements builder, scorecards, project plans, team roles | 4 wks |

| 4 — Advisor layer | Chat, booking, proposal reviews, PDF reports, transparency page | 3–4 wks |

| 5 — Data pipeline | Source registry, Firecrawl + LLM extraction, review queue, scoring engine, scheduler | 4–6 wks (parallel with 2) |

| 6 — SuperAdmin | Pipeline control, vendor CRUD, scoring config, users, advisor ops, deals, content, health | 4 wks (pipeline views alongside 5) |



\*\*Parallel data track (launch-critical):\*\* seed 50+ vendor profiles; author \& publish scoring methodology; populate pricing benchmarks.



\---



\## 7. Trust \& compliance guardrails



1\. Commission rates disclosed to each customer.

2\. CBIZ Centrally HR featured placement always labeled; reseller affiliation disclosed on profile + Transparency page.

3\. Scoring methodology published.

4\. Source data licensed or vendor-owned; no ToS-violating scraping.

5\. "Last verified" freshness dates on all vendor data.

6\. Privacy policy discloses lead-data collection \& use; consent checkbox at sign-up; TCPA-compliant outreach; cookie-consent banner.

7\. Organic rankings never manipulated.



\---



\## 8. Open questions



1\. Final brand name — "MatchMaker HR" is a working name; alternatives (e.g., Peoplestack, Clearpick HR) proposed earlier.

2\. Commission disclosure UX — where/how in-app (onboarding step vs. persistent footer link vs. both)?

3\. Newsletter provider final choice (Beehiiv assumed).

4\. Advisor chat: build (Supabase Realtime) vs. buy (Intercom) at launch?

5\. Initial source registry: which licensed/vendor-owned sources per vendor for the seed crawl?

6\. Pricing-estimate confidence labeling (ranges vs. point estimates; "verified" criteria definition).



\---



\## 9. Out of scope (v1)



\- Public/SEO vendor ranking pages (all data stays behind the lead gate)

\- Non-HRIS software categories

\- Vendor self-service portal

\- Native mobile apps

\- Multi-language/localization



