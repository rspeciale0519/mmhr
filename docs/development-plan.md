# MatchMaker HR — Full Development Plan

> **Status:** Awaiting authorization to build. No code exists yet.
> **Sources:** `docs/PRD.md` v1.0, `docs/master-plan.md` v1.0 (both July 2026).
> **Supersessions (owner-directed, 2026-07-12):** (1) All references in the PRD/Master Plan
> to a prebuilt design (`Homepage.dc.html`, the "Bold Sage" direction, PRD §5.3, FR-M2's
> "per approved design") are void — the visual design will be created **fresh** during
> Phase 0 via the frontend-design and shadcn skills, gated on owner approval.
> (2) The PRD §6 duration estimates are void — this plan tracks sequencing, dependencies,
> and exit criteria only, not calendar time.
> **Companion:** `docs/ROADMAP.md` (phase/task checklist, kept current per work session).

---

## 1. Executive summary

MatchMaker HR is a buyer-side HRIS brokerage: a public marketing site that gates a
free buyer workspace (marketplace of 50+ vendor profiles, matching wizard, requirements
builder, scorecards, project plans, team collaboration, human advisor), an automated
Firecrawl + LLM research pipeline that keeps vendor data fresh (the moat), and a
SuperAdmin console operating all of it. Revenue is vendor commission; trust guardrails
(disclosure, labeled featured placement, published methodology) are product requirements,
not afterthoughts.

The build is organized into **8 phases (0–7)**, each a vertical slice ending in working,
testable, deployable software with explicit exit criteria. Two tracks run alongside the
phase sequence: the research pipeline (parallel with the evaluation/advisor phases) and
vendor-data seeding (continuous). Each phase gets its own detailed implementation plan
authored at phase start and approved before code.

---

## 2. Current state & pre-flight

| Item | State |
|---|---|
| Repo | `docs/` only — no code, **not yet a git repository** |
| PRD / Master Plan | Complete v1.0 drafts, mutually consistent (subject to the supersessions above) |
| Visual design | None — created fresh in Phase 0 (frontend-design + shadcn skills), owner-approved before codifying |
| Vendor seed data (50+ profiles) | Not started — the effort's long pole; research/authoring work, not code (see §8 Risks) |

**Pre-flight actions upon authorization (before any feature code):**
1. `git init` with `main` + `develop` branches (Rule 8 workflow requires `develop`);
   add the existing remote `git@github.com:rspeciale0519/mmhr.git` (owner-created,
   private) and push both branches.
2. ~~Ratify D1–D7 + D14~~ — **done 2026-07-12** (see §3).
3. Provision the ratified third-party accounts (all free tiers at this stage) and wire
   credentials into local/staging env.

---

## 3. Decision log

> **D1–D7 and D14 were RATIFIED by the owner on 2026-07-12** (stack + service matrix,
> after live pricing verification). D8–D13 remain open with recommendations, each due
> at its listed phase.

### 3.1 Stack choices (RATIFIED 2026-07-12)

| # | Choice | Recommendation | Rationale |
|---|---|---|---|
| D1 | Next.js version | **Latest stable (16.x)** App Router | PRD says "15" (written pre-16); 16 is current — Cache Components/PPR help marketing LCP < 2.5s target. One codebase for marketing + app + admin via route groups. |
| D2 | ORM: Drizzle vs Prisma | **Drizzle** | SQL-first fits heavy RLS usage; lighter cold starts on Vercel; first-class Supabase support; migrations stay readable SQL. |
| D3 | Auth: Supabase Auth vs Clerk | **Supabase Auth** | RLS-native (JWT claims map directly to policies — the whole permission model rides on RLS); no per-MAU cost. We must build custom role logic (org roles + advisor + superadmin + audited impersonation) either way, so Clerk's invite polish buys little. |
| D4 | Jobs: Trigger.dev vs Inngest | **Trigger.dev (v4)** | Pipeline runs are long-lived (crawl → LLM extract → validate per vendor); Trigger.dev runs long tasks natively without serverless timeout gymnastics, has cron scheduling, per-run observability, and cost visibility for FR-S9. |
| D5 | CMS: Sanity vs Payload | **Payload 3 (embedded)** | Installs inside the same Next.js app and same Postgres — no second SaaS, no per-seat fees, content queryable alongside app data; admin UI is adequate for non-dev editing (FR-M4). |
| D6 | PDF export | **@react-pdf/renderer first** | Serverless-friendly, no headless-browser infra. Escalate to a Puppeteer service only if report fidelity demands it (revisit in Phase 4). |
| D7 | API layer | **tRPC for app/admin, route handlers for public/webhooks** | End-to-end types across ~30+ authenticated procedures; plain route handlers for lead capture, newsletter, Trigger.dev webhooks. |

### 3.2 PRD open questions (§8) — recommendations

| # | Question | Recommendation | Decide by |
|---|---|---|---|
| D8 | Final brand name | Keep "MatchMaker HR" as build codename; isolate all brand strings/logos behind a single config module + CMS so a rename is a config change, not a refactor. Run domain checks when candidates are shortlisted. | Before Phase 1 launch (marketing copy freeze) |
| D9 | Commission disclosure UX | **Both**: one-time onboarding acknowledgment step (records consent timestamp) **and** persistent footer link to Transparency page. Cheap, maximizes trust KPI (NPS ≥ 70). | Phase 2 |
| D10 | Newsletter provider | **Beehiiv** (PRD assumption stands — see §3.3) via API from the newsletter form. | Phase 1 |
| D11 | Advisor chat build vs buy | **Build** on Postgres threads + Supabase Realtime (PRD lean). Schema is ~3 tables; keeps chat data in-house for advisor ops oversight (FR-S5); $0 vs Intercom's per-seat pricing. Revisit only if advisor headcount scales past the console. | Phase 4 |
| D12 | Initial source registry | Operational task, not code: compile per-vendor list of vendor-owned URLs (pricing, product, docs pages) + any licensed feeds during the data-seed track; registry schema supports it from Phase 5 day 1. | Start of Phase 5 |
| D13 | Pricing confidence labeling | **Ranges + confidence tier** (`verified` = from vendor-owned source within cadence window; `estimated` = modeled/benchmarked; `stale` = outside window). Drives the "last verified" UI and the ≥95% freshness SLA measurement. | Phase 2 (schema), Phase 5 (automation) |

### 3.3 Service decision matrix (D14 — RATIFIED 2026-07-12)

Selection principle: **best tool for the use-case at the lowest cost, free preferred**,
as long as it does the job. **All free-tier figures below were verified against the
live official pricing pages on 2026-07-12** (three parallel research passes; Claude API
pricing from the current API reference). Re-check only if ratification is delayed
significantly.

| Need | Candidates | Verified free-tier / cost reality (2026-07-12) | Recommendation |
|---|---|---|---|
| Hosting/CDN | Vercel · Cloudflare Workers · Netlify | Vercel Hobby **prohibits commercial use** (confirmed in live docs) — fine for the whole build/staging period; Pro $20/user/mo at launch (includes $20/mo usage credit; set a spend cap — usage overages default to a $200 notification threshold). | **Vercel** — best Next.js DX; free until launch, Pro at go-live with a low spend cap configured day 1. Cloudflare is the fallback if launch cost ever outweighs DX. |
| Database + Auth + Storage + Realtime | Supabase · Neon+Clerk+Pusher combo | Supabase free: 500 MB DB, 1 GB storage, 50k MAU, 200 Realtime connections, 2 active projects, **pauses after 1 wk inactivity** — fine for staging; local stack $0 for the entire build. Pro $25/mo at launch (8 GB disk, 100k MAU, 250 GB egress, daily backups, no pausing). | **Supabase** — one service covers four needs (DB, auth, file storage for proposal uploads, Realtime for chat/live scorecards). Develop 100% locally; pay only at launch. |
| Background jobs/cron | Trigger.dev · Inngest · self-managed (pg-boss/pg_cron) | Trigger.dev: **DEV-environment runs are uncharged** + $5/mo free usage credits, 20 concurrent runs; first paid tier $10/mo. Inngest free (50k executions) **hard-pauses when exhausted**; first paid tier $99/mo — 10× Trigger.dev's. | **Trigger.dev** — $0 through the build, gentle $10/mo ramp if production volume outgrows free credits; pg-boss+pg_cron remains the $0 fallback. |
| Crawling | Firecrawl managed · Firecrawl self-hosted (AGPL) · custom Playwright/Crawlee | Managed free tier is now **1,000 credits/mo recurring** (~1 credit/page) — covers dev AND likely a quarterly production cadence (50 vendors × ~20 pages ≈ 1,000 credits/quarter); Hobby $16–19/mo (5k credits), Standard $83–99/mo (100k). Self-hosted is $0 but **lacks Fire-engine** (cloud-only anti-bot/stealth layer) and the agent/browser endpoints — crawls of bot-protected vendor sites may fail. | **Managed free tier through Phase 5 dev and initial quarterly cadence; Phase 5-exit checkpoint** decides among free/Hobby/self-hosted using real per-run data. Tripwire for self-hosting: failures on Cloudflare-guarded vendor pages = Fire-engine absence. |
| LLM extraction | Claude API (Haiku 4.5 ↔ Sonnet 5) | Usage-based: Haiku 4.5 $1/$5 per MTok (supports strict structured outputs — fits the Zod pipeline); Sonnet 5 $3/$15 ($2/$10 intro through 2026-08). | **Haiku 4.5 for routine extraction; escalate to Sonnet 5 only on low-confidence/complex pages.** Per-run budget caps + cost telemetry (FR-S9) from day 1. Costs start only when the pipeline goes live. |
| CMS | Payload 3 (self-hosted) · Sanity | Payload: **MIT license confirmed** — self-hosted in our Next.js app + Postgres, $0 forever incl. admin UI. Watch item: Payload was **acquired by Figma**; its managed cloud is closed to new signups (irrelevant to self-hosting, but monitor project health). Sanity free: 20 seats/10k documents — viable fallback. | **Payload** (= D5). $0 permanently; Sanity is the documented fallback if the Figma acquisition ever degrades Payload maintenance. |
| Transactional email | Resend · Amazon SES · Brevo | Resend free: 3,000/mo with a **100/day hard cap**, 1 domain; Pro $20/mo (50k). SES near-free but DX-poor. | **Resend free tier** — the 100/day cap comfortably covers invites/notifications pre-scale; Pro or SES when volume demands. |
| Newsletter | Beehiiv · Listmonk (self-hosted) · Mailchimp | Beehiiv free ("Launch"): 2,500 subscribers, unlimited sends, **API access incl. programmatic subscribe** (Send API excluded — we don't need it); no automations/webhooks on free; Scale $43/mo (annual) at >2.5k subs or when automations needed. | **Beehiiv** (= D10). Free well past launch; the newsletter form posts via the subscriptions API. |
| Meeting scheduling | Cal.com (hosted) · Calendly | Cal.com free individual plan: unlimited event types, **commercial embedding allowed** (Cal branding on booking page); Teams $12/user/mo. **Self-hosting is no longer viable**: Cal.com went closed-source (Apr 2026); the MIT community fork (Cal.diy) is stripped of team features and flagged non-production. | **Cal.com hosted free plan** embed. Self-host path is off the table — if hosted pricing ever turns hostile, Calendly is the comparison point. |
| Advisor chat | Build (Supabase Realtime) · Intercom | Build = $0 on infra we already run; Intercom is expensive per seat. | **Build** (= D11). |
| Analytics | PostHog · Umami (self-hosted) · Plausible | PostHog free (monthly, no card): **1M events + 5k session replays + 1M flag requests + error tracking included**; funnels are part of core product analytics. Usage-based beyond that. | **PostHog** free tier — covers FR-T1–T4 including funnels at $0 well past launch. |
| PDF export | @react-pdf/renderer · Puppeteer service | Library is free; Puppeteer needs hosted infra. | **@react-pdf/renderer** (= D6). |
| Error monitoring | Sentry · GlitchTip (self-hosted) | Sentry Developer (free forever): 5k errors/mo, **1 user**, 30-day retention; Team $26/mo (annual rate — confirm monthly rate at checkout) when a second teammate needs access. | **Sentry** free tier. |
| Uptime monitoring | UptimeRobot · Better Stack | UptimeRobot free: **50 monitors @ 5-min interval**; Better Stack free: 10 monitors @ 30s + free status page. | **UptimeRobot** free (monitor count wins); add Better Stack free later if a public status page is wanted. |

**Cost picture as verified:** **$0 for the entire build period** (local Supabase, Vercel
Hobby, Trigger.dev DEV runs uncharged, all other free tiers confirmed). At commercial
launch: **~$45/mo baseline** (Vercel Pro $20 + Supabase Pro $25) **plus usage-based
pipeline costs** — Claude API (Haiku-first keeps this small) and Firecrawl $0–19/mo at
quarterly-to-light cadence (Standard $83–99/mo only if a mostly-weekly cadence proves
necessary; the Phase 5 checkpoint decides). Everything else stays $0 past launch.

---

## 4. Architecture

### 4.1 Application structure (single Next.js codebase)

```
src/
  app/
    (marketing)/        # public: home, platform, broker-model, services, case-studies,
                        # faq, about, contact, partners/*, resources/*, transparency,
                        # legal (privacy, terms)  — SSG/ISR, SEO (FR-M5)
    (auth)/             # sign-up (lead gate), sign-in, invite acceptance
    (app)/              # buyer workspace: wizard, home, marketplace, vendors/[slug],
                        # requirements, scorecards, project-plan, team, advisor
    (admin)/            # SuperAdmin console (FR-S1..S10) + advisor console
    api/                # route handlers: leads, newsletter, webhooks, pdf, trigger.dev
  server/               # tRPC routers, services (scoring, matching, pipeline), db (drizzle)
  components/           # shadcn/ui + the Phase-0 design system
  lib/                  # shared utils, brand config (D8), analytics client
  trigger/              # Trigger.dev tasks: crawl, extract, validate, publish, digests
```

- **Rendering:** marketing = static/ISR (LCP < 2.5s); app/admin = dynamic with TanStack Query; Zustand only for local UI state (wizard steps, scorecard live-entry).
- **Realtime:** Supabase Realtime channels for advisor chat and live scorecard sessions (FR-A5 "live use during demos", FR-A8).
- **Files:** proposal uploads (FR-A8) in **Supabase Storage**, private bucket, RLS-scoped signed URLs.
- **Analytics:** PostHog (consent-gated via cookie banner) — pageviews, funnels (FR-T3), product events (FR-T4); server-side capture for lead events so the funnel survives ad-blockers.

### 4.2 Design system (created fresh in Phase 0)

All layout/UI design flows through two skills, in this order:
1. **frontend-design skill** — establishes the aesthetic direction (typography, color,
   spatial system, motion) as explorable samples; **owner approval gates codification**.
2. **shadcn skill** — implements the approved direction as a themed shadcn/ui + Tailwind
   component system that every subsequent screen extends.

Every UI-building phase (1, 2, 3, 4, 6) re-invokes both skills for its new screens so the
system stays intentional rather than default-flavored. No prebuilt design artifacts are
referenced anywhere.

### 4.3 Permission model (server-enforced, RLS-first)

- **Principals:** anonymous visitor → lead/buyer user → org roles (`admin` | `contributor` | `viewer`) → internal roles (`advisor`, `superadmin`).
- **Enforcement:** Postgres RLS on every org-scoped table keyed by `org_id` + membership role; internal roles via JWT claim checked in policies. tRPC middleware mirrors the same checks for defense in depth.
- **Impersonation (FR-S4):** superadmin mints a scoped, time-boxed impersonation session; every request during it writes to `audit_log`. Never a raw password/session takeover.
- **Audit (FR-S10):** trigger-based audit rows (who/what/when/before/after) on all admin-mutable tables.

### 4.4 Data model (~28 tables, grouped)

| Group | Tables (key fields) |
|---|---|
| Identity & orgs | `orgs`, `users`, `org_members` (org_id, user_id, role), `invitations` (email, role, token, expires) |
| Leads & compliance | `leads` (name, company, work_email, phone, consent_at, source, status), `audit_log` |
| Vendor catalog | `vendors` (slug, name, is_featured_affiliate, dedupe_group), `vendor_snapshots` (versioned JSON, source_run_id, captured_at, published_at), `vendor_pricing` (range_low/high, confidence: verified/estimated/stale, verified_at), `features` (~200-item library, module, category), `capability_scores` (vendor_id, feature/module, score, snapshot_id) |
| Pipeline | `sources` (vendor_id, url, type, license_note), `source_schedules` (cadence: weekly/monthly/quarterly, next_run_at), `ingestion_runs` (status, cost_cents, error), `extraction_diffs` / `review_queue` (field, old, new, severity, decision, decided_by), `scoring_configs` (versioned weights, published_at) |
| Buyer tools | `projects` (org_id, go_live_date), `intake_profiles` (size, industry, geo, modules, budget, current_systems), `requirements` (org_id, feature_id, tag: must/nice/no), `shortlists` + `shortlist_items`, `scorecards`, `criteria` (weight, question_bank ref), `scores` (scorecard_id, vendor_id, criterion_id, user_id, value, comment), `milestones`, `tasks` (assignee, due, done) |
| Advisor & revenue | `advisor_assignments` (org_id, advisor_user_id), `advisor_threads` + `thread_messages`, `proposal_reviews` (upload ref, status, analysis), `demo_requests` (org_id, vendor_id, status), `deals` (demo_request_id, stage, closed_at, commission_cents) |
| Content | Payload collections (blog, case studies, vendor marketing copy, FAQ, transparency copy) in the same Postgres |

**Versioning invariant (FR-P5):** published vendor-facing numbers always reference a
`vendor_snapshots` row → `ingestion_runs` row → `sources` row, so every score is traceable
to source + capture date. Manual admin overrides create a snapshot with `source = manual`
and an audit entry.

### 4.5 Match scoring & recommendation rules (FR-R1..R4)

- **Match %** = weighted fit of org's `intake_profiles` + `requirements` tags against
  `capability_scores`, geography/size fit, and budget vs `vendor_pricing` — weights from the
  active `scoring_configs` version. Deterministic and unit-tested; methodology doc generated
  from the same config that computes it ("published methodology" is literally true).
- **Featured slot:** CBIZ Centrally HR injected at the presentation layer as a labeled
  "Featured — our solution" card — never merged into the organic ranking sort.
- **De-dupe:** `vendors.dedupe_group` links UKG Ready ↔ Centrally HR; organic list shows
  exactly one per group. Affiliation disclosure rendered on profile + Transparency page.
- **Integrity test:** an automated test asserts organic ordering is a pure function of
  scoring config + data, with no vendor-specific branches.

### 4.6 Research pipeline (FR-P1..P6, the moat)

```
source_schedules (cron) ─► Trigger.dev run per source
   1. Firecrawl fetch (vendor-owned/licensed URLs only — ToS guard is a registry rule)
   2. Claude structured-output extraction → Zod-validated JSON (pricing, capabilities,
      service model, geography, facts, pros/cons)
   3. Validate: schema + anomaly rules (e.g., price swing > X%, capability drops)
   4. Diff vs last published snapshot → auto-approve trivial / queue significant changes
   5. Human review in SuperAdmin queue → approve publishes new snapshot + recomputes scores
   6. Publish → "last verified" date updates; freshness SLA metric recalculated
Cost telemetry (Firecrawl + LLM per run) recorded on ingestion_runs → FR-S9 dashboard.
```

---

## 5. Engineering standards (all phases)

- **Git:** `develop` default branch; one Rule-6 plan file + `feature/*` branch per phase via
  `/git-workflow-planning:start`; checkpoint commits per sub-phase; PRs into `develop`; `main`
  reserved for production releases. Vercel preview per PR.
- **UI:** every screen built through the frontend-design + shadcn skill workflow (§4.2);
  no unthemed defaults ship.
- **TDD** (superpowers protocol): failing test → minimal code → pass → commit. Test pyramid:
  Vitest unit (scoring engine, validators, lead-gate rules), integration tests against local
  Supabase (RLS policies get their own test suite — every table × role matrix), e2e via
  chrome-devtools MCP for the critical funnels (visitor → lead → workspace; wizard →
  match list; scorecard live session).
- **CI gates:** type-check, lint, unit + integration tests on every PR; Lighthouse budget check
  on marketing routes (LCP < 2.5s); dependency audit.
- **Local-first dev:** local Supabase stack ($0 until launch); seed scripts make every phase
  demoable with realistic fixture vendors.
- **Files ≤ ~450 LOC**, follow shadcn/Next conventions, no dead flags.
- **Accessibility:** WCAG 2.1 AA checked per screen as built (axe in CI + manual keyboard pass),
  not deferred to the end.
- **Compliance-as-code:** consent checkbox blocks submission until checked and stores
  `consent_at`; cookie banner gates PostHog init; free-email-domain blocklist versioned in repo.

---

## 6. Phase plan

Phases are ordered by dependency, not calendar. A phase starts when its predecessor's exit
criteria pass (or, where noted, when a specific dependency is stable). Each phase begins
with its own detailed TDD implementation plan for approval.

### Phase 0 — Foundations & design system
**Scope:** git init (`main`/`develop`); Next.js 16 + TypeScript + Tailwind + shadcn scaffold;
**fresh design direction via the frontend-design skill** (typography, color, spatial system —
presented as rendered explorations; **owner picks/approves before anything is codified**);
approved direction codified via the shadcn skill as theme tokens + core component library;
local Supabase + Drizzle wiring + first migration (identity/leads groups); Supabase Auth
skeleton; tRPC + route-group skeletons for (marketing)/(auth)/(app)/(admin); CI pipeline;
Vercel + Supabase staging projects; PostHog project + consent-gated client; brand config
module (D8); third-party accounts provisioned per ratified matrix (§3.3).
**Exit criteria:** deployed shell on staging with auth round-trip; CI green; owner-approved
design direction rendered as a live sample page built from the new component system;
decision log D1–D7 + D14 ratified.

### Phase 1 — Marketing site + lead gate
**Scope:** all FR-M1 pages (Home per FR-M2 section list, Platform, Broker Model, Services,
Case Studies index/detail, FAQ, About, Contact, 3 Partner pages, Resources hub, Blog,
Transparency, Privacy/Terms); Payload CMS embedded — blog, case studies, FAQ, vendor
marketing copy collections (FR-M4); newsletter capture → Beehiiv (FR-M3); **registration
gate**: sign-up form with mandatory fields, free-domain rejection with inline guidance,
consent checkbox + TCPA language (FR-L1–L4); leads persisted + PostHog funnel events
(FR-L5, FR-T1–T3); HRIS Landscape Report gated download (FR-L3); SEO: metadata, OG, canonical,
sitemap, robots (FR-M5); cookie-consent banner.
**Exit criteria:** marketing site launchable standalone; visitor → completed lead funnel
measured end-to-end in PostHog; Lighthouse LCP < 2.5s on home; a11y pass; lead rows visible
in DB (admin UI arrives Phase 2+).
**Dependencies:** Phase 0. Marketing copy + case-study content needed from you (can launch
with placeholders behind `noindex` until copy freeze).

### Phase 2 — App core: orgs, wizard, marketplace
**Scope:** org creation on sign-up + `org_members` roles + RLS foundation across all
org-scoped tables (FR-A7 enforcement layer, invites UI lands Phase 3); onboarding
commission-disclosure step (D9); **intake wizard** (multi-step, progress-saved, re-editable —
FR-A1); vendor catalog schema + **manually seeded profiles** (data track §7.2); **match
scoring engine v1** + published methodology page (FR-R1); featured/de-dupe rules + integrity
test (FR-R2–R4); **marketplace**: browse/filter/sort, profile pages (match %, pricing w/
confidence tiers per D13, pros/cons, capability scores, "last verified"), shortlists (shared,
FR-A3); demo requests → `demo_requests` (FR-A3); workspace home v1 (progress + activity feed
skeleton, FR-A2); **admin-lite**: minimal internal screens for vendor CRUD + leads list so
data seeding and lead ops don't wait for Phase 6 (early slices of FR-S2/S7).
**Exit criteria:** a new lead can sign up, complete the wizard, browse ≥15 seeded vendors with
real match %, shortlist, and request a demo; RLS test matrix green; scoring engine unit-tested
against fixture orgs.

### Phase 3 — Evaluation suite
**Scope:** **Requirements Builder** (~200-feature library, must/nice/no tagging, feeds match
scores live, export — FR-A4); **Scorecards** (criteria library + custom, weights, expert
question bank, multi-member per-vendor scoring, live demo mode with Realtime updates,
aggregate/individual views — FR-A5); **Project Plans** (go-live date → generated phased
milestones/tasks/guides; check-off, assign, re-date — FR-A6); **Team** (email invites,
role assignment, permission enforcement UI, activity tracking — FR-A7); workspace home v2
(real tasks/milestones/activity).
**Exit criteria:** two users in one org can collaboratively tag requirements, run a live
scorecard against a shortlisted vendor, and work a generated project plan; permissions
verified per role in e2e tests.

### Phase 4 — Advisor layer + reports
**Scope:** advisor role + org assignment; **chat** (threads, Supabase Realtime, unread state —
FR-A8/D11); **meeting booking** (Cal.com embed); **proposal reviews** (Supabase Storage
upload → review request → advisor analysis w/ benchmarks + talking points); **PDF export** of
comparisons/shortlists (D6, FR-A3); transparency/disclosure copy finalized in CMS;
Resend transactional emails (invites, chat notifications, demo-request confirmations);
**advisor console v1** (assigned clients, threads, review queue — early FR-S5).
**Exit criteria:** buyer books a meeting, chats with an assigned advisor in near-real-time,
submits a proposal for review, and exports a branded PDF comparison.

### Phase 5 — Automated research pipeline (parallel track)
**Scope:** source registry + schedules (FR-P1/P2, D12 registry filled as operational task);
Trigger.dev crawl/extract tasks (Firecrawl + Claude structured output → Zod schemas — FR-P3);
validation + anomaly rules + snapshot diffing (FR-P4); review queue backend (UI in Phase 6,
minimal approve/reject screen here); versioned snapshots + traceability (FR-P5); publish flow
recomputing capability scores + freshness dates (FR-P6); scoring-config versioning + ranking
preview (FR-S3 backend); run cost telemetry (FR-S9 data); freshness-SLA metric (≥95% target);
**managed-vs-self-hosted Firecrawl checkpoint** using real per-run cost data (§3.3).
**Exit criteria:** a scheduled run crawls a real vendor source, extracts validated JSON, diffs
against the seeded profile, queues a change, and an approval publishes it to the live
marketplace with updated "last verified" — fully traceable.
**Start condition:** Phase 2 vendor schema stable — can run in parallel with Phases 3–4.

### Phase 6 — SuperAdmin console
**Scope:** consolidate admin-lite + pipeline screens into the full console — pipeline control
(registry CRUD, cadence, manual runs, run monitoring, diff review/approve — FR-S1); vendor
data management with overrides + audit (FR-S2); scoring config UI + impact preview (FR-S3);
user/org management + audited impersonation (FR-S4); advisor ops (assignment, pipeline,
oversight — FR-S5); deals & commissions tracking from demo requests → closed-won (FR-S6);
leads & analytics module (filter/export, PostHog embeds/funnels — FR-S7, FR-T1–T4); content
& featured-placement settings (FR-S8); system health (queues, API costs, errors — FR-S9);
audit log viewer (FR-S10).
**Exit criteria:** all internal operations run from the console; audit coverage verified;
impersonation e2e test proves scoping + logging.
**Dependencies:** Phase 5 (pipeline-control views consume its backend); Phase 4 (advisor ops).

### Phase 7 — Hardening & launch
**Scope:** performance pass (LCP budget on marketing, <200ms perceived app interactions —
caching, query tuning); full WCAG 2.1 AA audit; security review (RLS matrix re-run,
`/security-review` + pen-style checks on lead gate, uploads, impersonation); GDPR/CCPA
data-deletion flow; monitoring/alerting (Sentry + uptime checks for the 99.9% target);
backup/restore drill; launch-tier account upgrades per §3.3 cost picture; go-live checklist
(DNS, brand-name freeze D8, methodology page live, ≥50 vendors published & verified,
commission disclosures verified).
**Exit criteria:** launch checklist signed off; production cutover.

---

## 7. Sequencing & the data track

### 7.1 Dependency graph

```
P0 ─► P1 ─► P2 ─► P3 ─► P4 ─► P7 (launch)
             │                 ▲
             └──► P5 ──► P6 ───┘        P5 starts once P2's vendor schema is stable,
                                        in parallel with P3/P4. P6 consolidates after
Data seed track: runs continuously ─►   P5 (+ advisor ops from P4). P7 requires all.
```

### 7.2 Launch-critical data track (runs alongside everything)
- Seed 50+ vendor profiles (gates: ≥15 at Phase 2 exit, 50+ at Phase 7 launch): company
  facts, modules, pricing benchmarks, pros/cons — entered via admin-lite, later refreshed
  by the pipeline.
- Author the ~200-item feature library (needed by Phase 2 scoring & Phase 3 requirements builder).
- Author criteria library + expert question bank (Phase 3).
- Project-plan milestone/guide templates (Phase 3).
- Scoring methodology doc (generated + prose, Phase 2).
- Source registry per vendor — vendor-owned/licensed URLs (Phase 5, D12).
- Marketing copy: case studies, FAQ, partner pages, Landscape Report v1 (Phase 1).

**This track is the effort's biggest risk: it's research/authoring bounded by source quality
and your review, not code speed.** Much of it can be accelerated with delegated deep-research
runs per vendor — recommend kicking those off as early as Phase 1.

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vendor seed data lags code | Marketplace launches hollow; match % meaningless | Data track starts Phase 1; admin-lite CRUD in Phase 2; ≥15-vendor gate on Phase 2 exit; deep-research assists per vendor |
| Fresh design direction churns | Phase 0 rework if direction misses | Explorations presented for approval **before** codification; nothing themed until you sign off |
| LLM extraction quality (FR-P3/P4) | Bad data published → trust KPI damage | Zod-validated structured output, anomaly thresholds, human review queue default-on for high-impact fields (pricing), golden-set eval fixtures per extractor |
| Pipeline API costs (Firecrawl + Claude) | Cost overrun at 50 vendors × sources × cadence | Cost telemetry per run from day 1 (FR-S9); self-hosted-Firecrawl checkpoint at Phase 5 exit; quarterly default cadence, weekly only where it matters; per-run budget caps |
| Free-tier terms shift mid-build | Surprise costs or migration mid-build | All tiers verified against live pages 2026-07-12; Vercel spend cap set day 1; each service has a documented fallback in §3.3 (Cloudflare, Sanity, pg-boss, SES, Calendly, self-hosted Firecrawl) |
| RLS complexity (org roles + advisor + impersonation) | Data-leak severity bugs | RLS test matrix (table × role) in CI from Phase 2; impersonation designed audited/time-boxed; security review in Phase 7 |
| Scope creep in SuperAdmin (10 FR-S modules) | Phase 6 balloons | Admin-lite slices land early where operationally needed; Phase 6 is consolidation, not first contact |
| Brand rename late (D8) | Copy/OG/domain churn | Brand config module + CMS-driven copy from Phase 0 |
| Gated data vs SEO tension | Weak organic acquisition | Marketing pages + blog + Landscape Report carry SEO (FR-M5); gate applies only to vendor data (per PRD §9 this is intentional — revisit post-v1) |

## 9. Execution protocol (per phase, upon your authorization)

1. Author the phase's detailed implementation plan (bite-sized TDD tasks with code, per the
   writing-plans skill) → save as `.claude/plans/feature-<phase-slug>.md` and get your approval.
2. `/git-workflow-planning:start feature <phase-slug>` (branch off `develop`).
3. Execute task-by-task (TDD); `/git-workflow-planning:checkpoint` per sub-phase after
   updating `docs/ROADMAP.md`.
4. Phase exit: verify exit criteria (superpowers verification protocol + `/code-review`),
   then `/git-workflow-planning:finish` → PR into `develop`.

Plan-file slugs: `feature-foundations`, `feature-marketing-site`, `feature-app-core`,
`feature-evaluation-suite`, `feature-advisor-layer`, `feature-data-pipeline`,
`feature-superadmin`, `feature-launch-hardening`.
