\# MatchMaker HR — Master Project Plan

\*v1.0 — July 2026\*



\## 1. Product definition



\*\*What it is:\*\* A buyer-side HRIS software broker — modeled on OutSail.co — that helps companies research, evaluate, and select the right HRIS, free of charge to buyers.



\*\*Business model:\*\* Commission from the winning vendor on a successful purchase. Same rate across vendors, disclosed to customers. Free to buyers with no passed-along costs.



\*\*Niche:\*\* HR/finance leaders at SMB-to-mid-market companies (\~50–5,000 employees) making a rare, high-stakes HRIS/payroll purchase without the time or market knowledge to run a rigorous selection.



\*\*Scope:\*\* HRIS only (a true HRIS includes payroll, benefits, time, performance, etc. as modules — these are scored as capabilities, not separate categories).



\*\*Strategic differentiator vs. OutSail:\*\* an automated monthly research pipeline that keeps vendor data, scores, and rankings continuously fresh — replacing OutSail's manually maintained dataset with an automated moat.



\*\*Brand:\*\* MatchMaker HR (working name).



\---



\## 2. Product surfaces



\### A. Marketing site (public)

\- \*\*Home\*\* — hero, vendor logo wall, broker-model advantage, product tour, stats, case studies, newsletter capture

\- \*\*Platform\*\* — the 6 app tools, FAQ

\- \*\*Broker Model\*\* — "How we're free": no fees, no upsells, no passed-along costs, no commitment; vendor-agnostic proof points

\- \*\*Services\*\* — 6-stage journey: requirements → shortlisting → evaluation tools → proposal analysis → implementation matching → optimization

\- \*\*Case Studies\*\* — index + detail template with hard-number outcomes

\- \*\*FAQ, About, Contact\*\*

\- \*\*Partner pages\*\* — Software Vendors, Brokers \& Consultants, PE/VC

\- \*\*Resources\*\* — Blog (CMS), annual HRIS Landscape Report (gated download), Requirements Builder teaser, HR Service Partner Finder

\- \*\*Transparency page\*\* — "How we make money": commission model + disclosure of the CBIZ Centrally HR reseller affiliation



\### B. App (authenticated — data gated behind required lead-capture sign-up, like OutSail)

\*\*Registration gate (lead capture):\*\* access to vendor data requires a completed sign-up form with mandatory fields — full name, company name, company email (validated; free domains like gmail/yahoo blocked), and direct company phone number. Same gate applies to secondary lead magnets (e.g., Landscape Report download). Consent language + privacy-policy disclosure on the form (TCPA-compliant for phone outreach). Captured leads flow into the database and surface in the SuperAdmin leads pipeline.

1\. \*\*Matching intake wizard\*\* — company size, industry, geography, modules needed, budget, current systems → generates match scores

2\. \*\*Workspace / Home\*\* — project hub: progress, tasks, activity feed

3\. \*\*Vendor Marketplace\*\* — 50+ HRIS profiles: match %, verified pricing estimates, pros/cons, module capability scores, deep-dive pages, shortlisting, PDF report export, demo requests

4\. \*\*Requirements Builder\*\* — \~200 common HRIS features, must-have / nice-to-have tagging

5\. \*\*Scorecards\*\* — weighted criteria, expert question bank, per-vendor team scoring, usable live during vendor demos

6\. \*\*Project Plans\*\* — go-live date → auto-generated milestone timeline + interactive checklist with guides per step

7\. \*\*Team\*\* — invites, roles (admin / contributor / viewer), permissions, activity tracking

8\. \*\*Advisor\*\* — assigned human advisor: chat, meeting booking, proposal-review requests, negotiation guidance



\### C. SuperAdmin dashboard (internal command center)

Protected app area with a `superadmin` role at the top of the permission hierarchy.

1\. \*\*Pipeline control\*\* — Firecrawl research job management: source registry (add/edit source URLs per vendor), cadence per source or globally (weekly / monthly / quarterly), manual run triggers, run status \& failure monitoring, extraction diff review, approve/reject data changes before publish

2\. \*\*Vendor data management\*\* — full CRUD on vendor profiles, pricing benchmarks, capability scores, manual overrides

3\. \*\*Scoring engine config\*\* — adjust weights/methodology, preview ranking impact before publishing

4\. \*\*User \& org management\*\* — all customer workspaces, roles, support impersonation

5\. \*\*Advisor operations\*\* — advisor assignment, client pipeline, proposal reviews, chat oversight

6\. \*\*Deals \& commissions\*\* — demo requests → deals → commission revenue tracking

7\. \*\*Leads \& analytics\*\* — captured lead records (name, company, work email, phone) with view/filter/export; visit tracking (sessions, referral sources, arrival times); most-visited pages; marketing-page → sign-up funnels (PostHog)

8\. \*\*Content \& site\*\* — case studies, blog, featured-placement settings, transparency disclosures

9\. \*\*System health\*\* — job queues, API usage/costs (Firecrawl + LLM), analytics



\---



\## 3. Automated research \& scoring pipeline (the moat)



\*\*Cadence:\*\* configurable per source or globally — weekly / monthly / quarterly — managed from the SuperAdmin dashboard; manual runs on demand.



\*\*Flow:\*\*

1\. \*\*Source registry\*\* — admin-managed list of specific websites per vendor (vendor sites, pricing pages, docs, licensed/API data). Avoid ToS-violating scraping of review platforms; prefer vendor-owned and licensed sources.

2\. \*\*Crawl/extract\*\* — Firecrawl (or similar) fetches pages → LLM-assisted extraction converts unstructured content into structured fields: pricing, modules/capabilities, service model, geography, company facts, pros/cons.

3\. \*\*Validate \& diff\*\* — schema validation, anomaly detection, change-detection vs. prior snapshot; suspicious changes queue for human review in the SuperAdmin dashboard.

4\. \*\*Version \& store\*\* — every snapshot versioned in Postgres; scores always traceable to source data + date.

5\. \*\*Score \& rank\*\* — transparent methodology normalizes data into module-level scores and overall rankings; match % computed per user from their intake profile + requirements.

6\. \*\*Publish\*\* — approved data goes live in the Marketplace; "last verified" dates shown on profiles.



\*\*Recommendation rules:\*\*

\- \*\*CBIZ Centrally HR (white-labeled UKG Ready) appears in every recommendation list as a clearly labeled "Featured — our solution" placement.\*\* Identical data quality and scoring as all vendors; the placement itself is honest and disclosed.

\- \*\*De-duplication:\*\* a given results list shows either UKG Ready or CBIZ Centrally HR organically (not both), with the affiliation disclosed on the Centrally HR profile and the Transparency page.

\- Organic rankings are never manipulated; Centrally HR/UKG Ready earn organic placement on merit like everyone else.



\---



\## 4. Software stack



| Layer | Choice | Why |

|---|---|---|

| Framework | Next.js 15 (React + TypeScript) | One codebase for SEO-strong marketing site + dynamic app |

| UI | Tailwind CSS + shadcn/ui | Fast, consistent, themeable to the design system |

| Data fetching / state | TanStack Query + Zustand | Standard, lightweight |

| API | Next.js API routes / tRPC | No separate backend needed at this scale |

| Database | PostgreSQL (Supabase) + Drizzle or Prisma | DB + auth + RLS + storage in one; RLS maps to org/role model |

| Auth \& orgs | Supabase Auth (or Clerk for polished team invites) | Multi-stakeholder workspaces |

| Background jobs | Trigger.dev or Inngest | Monthly pipeline runs, report generation, email |

| Crawling | Firecrawl | Managed crawl + markdown extraction |

| Extraction | LLM (Claude API) structured-output step | Unstructured page → validated JSON fields |

| CMS | Sanity or Payload | Blog, case studies; non-dev editing of vendor copy |

| Email | Resend (transactional) + Beehiiv (newsletter) | Matches the OutSail newsletter playbook |

| PDF export | react-pdf or Puppeteer service | Marketplace vendor reports |

| Advisor chat | Postgres threads + Supabase Realtime | Simple first; Intercom later if needed |

| Scheduling | Cal.com embed | Advisor meetings |

| Hosting | Vercel + Supabase cloud | Cheap until scale |

| Analytics | PostHog | Visit tracking, page popularity, sign-up funnels, product analytics (+ cookie-consent banner for GDPR/CCPA) |



\*\*Core tables:\*\* orgs, users, roles/permissions (incl. `superadmin`), vendors, vendor\_snapshots (versioned), vendor\_pricing, features, capability\_scores, sources, source\_schedules, ingestion\_runs, review\_queue, scoring\_configs, requirements, projects, shortlists, scorecards, criteria, scores, tasks/milestones, advisor\_threads, demo\_requests, deals, leads, audit\_log.



\---



\## 5. Build phases



\- \*\*Phase 0 — Design (this project):\*\* high-fidelity screens in the attached design system. Marketing home + key pages; then the 8 app screens; then SuperAdmin key views.

\- \*\*Phase 1 — Marketing site\*\* + CMS + newsletter (\~2–3 wks dev)

\- \*\*Phase 2 — App core:\*\* auth/orgs, intake wizard, marketplace + vendor profiles + shortlists (\~4–6 wks)

\- \*\*Phase 3 — Evaluation suite:\*\* requirements builder, scorecards, project plans, team roles (\~4 wks)

\- \*\*Phase 4 — Advisor layer + PDF reports + transparency page (\~3–4 wks)

\- \*\*Phase 5 — Data pipeline:\*\* source registry, Firecrawl + LLM extraction, validation queue, scoring engine, weekly/monthly/quarterly scheduler (\~4–6 wks; can start in parallel with Phase 2)

\- \*\*Phase 6 — SuperAdmin dashboard:\*\* pipeline control, vendor data CRUD, scoring config, user/org management, advisor ops, deals \& commissions, content, system health (\~4 wks; pipeline-control views built alongside Phase 5); ongoing data operations



\*\*Launch-critical data work (parallel track):\*\* seed the 50+ HRIS vendor profiles, define the scoring methodology doc (published for trust), and populate pricing benchmarks.



\---



\## 6. Trust \& compliance guardrails



\- Commission rates disclosed to each customer (OutSail parity)

\- CBIZ Centrally HR featured placement always labeled; reseller affiliation disclosed

\- Scoring methodology published

\- Source data licensed or vendor-owned; no ToS-violating scraping

\- "Last verified" freshness dates on all vendor data

\- Privacy policy discloses lead-data collection \& use; consent checkbox on sign-up; TCPA-compliant phone outreach; cookie-consent banner for analytics



