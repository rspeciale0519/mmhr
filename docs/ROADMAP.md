# MatchMaker HR — Development Roadmap

> Tracks phase/task completion per `docs/development-plan.md`. Items get checked off as
> phases complete (Rule 7). PRD requirement IDs in parentheses.

## Pre-flight (upon build authorization)
- [x] git init with `main` + `develop`; remote `git@github.com:rspeciale0519/mmhr.git` (private, develop default) — both pushed 2026-07-12
- [x] Ratify decision log D1–D7 + service matrix D14 — ratified 2026-07-12 after live pricing verification
- [x] Provision third-party accounts + populate `.env.local` — done 2026-07-12 (Vercel staging env-var wiring remains a Phase 0 task)

## Phase 0 — Foundations & design system
- [x] Next.js + TypeScript + Tailwind + shadcn scaffold with (marketing)/(auth)/(app)/(admin) route groups
- [ ] Fresh design direction via frontend-design skill → owner approval of rendered explorations
- [ ] Approved direction codified via shadcn skill: theme tokens + core component library
- [x] Local Supabase + Drizzle + first migration (identity, leads) — 5 tables, RLS enabled default-deny
- [x] Supabase Auth skeleton (sign-up/sign-in round-trip) — verified in-browser + integration tests
- [x] tRPC wiring; brand config module
- [x] CI (type-check, lint, unit tests, build) — green on GitHub Actions
- [ ] Vercel staging deploy
- [x] PostHog project + consent-gated client — 0 tracking requests before consent (browser-verified)

## Phase 1 — Marketing site + lead gate
- [ ] All public pages (FR-M1): Home (FR-M2), Platform, Broker Model, Services, Case Studies, FAQ, About, Contact, Partners ×3, Resources, Transparency, Privacy/Terms
- [ ] Payload CMS embedded: blog, case studies, FAQ, vendor copy (FR-M4)
- [ ] Newsletter capture → Beehiiv (FR-M3)
- [ ] Registration gate: mandatory fields, free-domain rejection, consent + TCPA (FR-L1–L4)
- [ ] Leads persisted + funnel events (FR-L5, FR-T1–T3); cookie-consent banner
- [ ] Gated HRIS Landscape Report download (FR-L3)
- [ ] SEO: metadata, OG, canonical, sitemap (FR-M5); LCP < 2.5s; a11y pass

## Phase 2 — App core
- [ ] Orgs + roles + RLS foundation & test matrix (FR-A7 enforcement)
- [ ] Commission-disclosure onboarding step (D9)
- [ ] Intake wizard: multi-step, saved progress, re-editable (FR-A1)
- [ ] Vendor catalog schema + admin-lite CRUD; ≥15 vendors seeded
- [ ] Match scoring engine v1 + published methodology (FR-R1); featured/de-dupe/integrity rules (FR-R2–R4)
- [ ] Marketplace: browse/filter/sort, profiles, pricing confidence tiers (D13), shortlists, demo requests (FR-A3)
- [ ] Workspace home v1 (FR-A2); admin-lite leads list (early FR-S7)

## Phase 3 — Evaluation suite
- [ ] Requirements Builder: ~200-feature library, tagging, feeds scoring, export (FR-A4)
- [ ] Scorecards: weighted criteria, question bank, team scoring, live Realtime mode (FR-A5)
- [ ] Project Plans: go-live date → milestones/tasks/guides (FR-A6)
- [ ] Team invites, role management UI, activity tracking (FR-A7)
- [ ] Workspace home v2 (real tasks/activity)

## Phase 4 — Advisor layer + reports
- [ ] Advisor role + org assignment; advisor console v1 (early FR-S5)
- [ ] Chat: threads + Supabase Realtime + notifications (FR-A8)
- [ ] Cal.com meeting booking (FR-A8)
- [ ] Proposal review flow: Supabase Storage upload → analysis → benchmarks (FR-A8)
- [ ] PDF export of comparisons/shortlists (FR-A3, D6)
- [ ] Resend transactional emails; transparency copy finalized

## Phase 5 — Automated research pipeline (parallel)
- [ ] Source registry + cadence schedules (FR-P1/P2); registry populated (D12)
- [ ] Trigger.dev crawl (Firecrawl) + Claude structured extraction → Zod schemas (FR-P3)
- [ ] Validation, anomaly detection, snapshot diffing, review queue (FR-P4)
- [ ] Versioned snapshots + full traceability (FR-P5)
- [ ] Publish flow: score recompute + "last verified" + freshness SLA metric (FR-P6)
- [ ] Scoring-config versioning + ranking preview backend (FR-S3)
- [ ] Run cost telemetry (FR-S9 data)
- [ ] Managed vs self-hosted Firecrawl checkpoint with real per-run cost data (§3.3)

## Phase 6 — SuperAdmin console
- [ ] Pipeline control: registry CRUD, runs, diff review/approve (FR-S1)
- [ ] Vendor data management + overrides + audit (FR-S2)
- [ ] Scoring config UI + impact preview (FR-S3)
- [ ] User/org management + audited impersonation (FR-S4)
- [ ] Advisor operations (FR-S5); Deals & commissions (FR-S6)
- [ ] Leads & analytics module (FR-S7, FR-T1–T4)
- [ ] Content & featured-placement settings (FR-S8)
- [ ] System health dashboard (FR-S9); audit log viewer (FR-S10)

## Phase 7 — Hardening & launch
- [ ] Performance pass: marketing LCP < 2.5s, app < 200ms perceived
- [ ] WCAG 2.1 AA audit; security review (RLS matrix, gate, uploads, impersonation)
- [ ] GDPR/CCPA data-deletion flow; monitoring/alerting + backups (99.9% target)
- [ ] Launch-tier account upgrades per plan §3.3 cost picture
- [ ] Launch checklist: brand freeze (D8), ≥50 vendors verified, methodology live, disclosures verified, DNS cutover

## Continuous — launch-critical data track
- [ ] Vendor profiles: 15 by Phase 2 → 50+ by Phase 7
- [ ] ~200-item feature library; criteria library + question bank
- [ ] Project-plan templates & guides
- [ ] Scoring methodology doc; pricing benchmarks
- [ ] Source registry URLs per vendor; marketing copy + Landscape Report v1
