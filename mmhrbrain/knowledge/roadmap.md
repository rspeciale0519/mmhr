---
kind: knowledge
slug: roadmap
status: current
updated: 2026-07-15
layer: roadmap
sources:
  - docs/ROADMAP.md
  - docs/BUILD_SPEC.md
  - docs/development-plan.md
  - memory:project_design_gallery
---

# Roadmap — where the build actually stands

Authoritative phase list: `docs/development-plan.md` (8 phases). Full
machine-checkable exit criteria: `docs/BUILD_SPEC.md`. This doc is the
brain's evidence-checked summary of `docs/ROADMAP.md`, not a replacement —
on any future conflict between them, re-run the knowledge-build runbook
rather than trusting this file blindly.

## Phase 0 — Foundations & design system (in progress)
Done (verified against code, see [[knowledge/features]]):
scaffold + route groups · local Supabase + Drizzle + first migration ·
Supabase Auth skeleton · tRPC wiring · CI · PostHog consent-gated client.

Open:
- **G3 owner gate — design direction.** 22 homepage options built across 5
  rounds (report/bureau/grid/marquee/dossier; harbor/beacon/terminal;
  scorecard/advocate/blueprint/ledger; redline/specimen/itinerary/memo/sticker;
  pulse/console/lattice/calibrate/aperture), live at
  `mmhr-designs.vercel.app/designs`. No direction has been picked yet — this
  is the actual current blocker on Phase 0 completion.
- Approved direction codified into theme tokens + component library (blocked
  on G3).
- Vercel staging deploy of the **app itself** (distinct from the gallery,
  which is already deployed — see [[knowledge/orientation]]).

## Phase 1 — Marketing site + lead gate (not started)
All FR-M1 public pages, Payload CMS embed, Beehiiv newsletter capture,
registration gate (free-domain rejection, consent/TCPA), gated Landscape
Report download, SEO/a11y pass. Blocked on Phase 0 design codification.

## Phase 2 — App core (not started)
Orgs/roles/RLS enforcement, commission-disclosure onboarding, intake wizard,
vendor catalog (≥15 seeded), match scoring engine v1, marketplace UI.

## Phase 3 — Evaluation suite (not started)
Requirements Builder (~200-feature library), Scorecards (+ Realtime live
mode), Project Plans, team invites/roles.

## Phase 4 — Advisor layer + reports (not started)
Advisor console, chat (Realtime), Cal.com booking, proposal review (Storage
upload), PDF export, Resend transactional email.

## Phase 5 — Research pipeline (not started, may run parallel to 3–4)
Source registry, Trigger.dev + Firecrawl crawl, Claude structured extraction,
validation/anomaly detection, versioned snapshots, publish flow. Wiring-only
today: `trigger.config.ts` + one health-check task exist; no real pipeline
task does. Anthropic/Firecrawl clients: zero code yet.

## Phase 6 — SuperAdmin console (not started)
## Phase 7 — Hardening & launch (not started)

## Owner gates (from `docs/BUILD_SPEC.md`)
G1 ratification — CLEARED 2026-07-12. G2 (per-phase plan approval) — cleared
for Phase 0's plan. **G3 (design direction) — OPEN, current blocker.**
G4 (PR merge) / G5 (brand freeze) / G6 (production cutover) — not yet reached.

