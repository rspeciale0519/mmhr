---
kind: knowledge
slug: orientation
status: current
updated: 2026-07-15
layer: orientation
sources:
  - docs/development-plan.md
  - docs/BUILD_SPEC.md
  - docs/PRD.md
  - src/middleware.ts
  - .vercel/project.json
---

# Orientation

**What this is:** MatchMaker HR — a buyer-side HRIS (HR software) brokerage.
Buyers get free vendor matching, evaluation tools, and an advisor; vendors
pay commission. Category reference: outsail.co. Full spec: `docs/PRD.md` +
`docs/development-plan.md` (authoritative, 8 phases, no timelines).

**Where the build actually is:** Phase 0 (foundations), most items done —
see [[knowledge/roadmap]] for the checklist and [[knowledge/features]] for
evidence. The real current blocker is **owner gate G3**: 22 homepage design
options exist, none chosen yet.

## The two-deployments-one-repo split (easy to get confused by)
This single Next.js codebase runs as **two separate Vercel projects**,
switched by one env var:
- `GALLERY_ONLY` unset → the real product app (marketing/app/auth/admin
  route groups). **Not yet deployed to its own Vercel project.**
- `GALLERY_ONLY=1` → `src/middleware.ts` serves nothing but `/designs`,
  skips Supabase auth entirely. This is the `mmhr-designs` Vercel project,
  already live at `mmhr-designs.vercel.app/designs`.

Don't read the gallery's live deployment as evidence the *app* is deployed —
it isn't yet.

## Stack (ratified D1–D7 + D14, 2026-07-12)
Next.js 16 App Router + Turbopack, React 19, TypeScript, Tailwind v4 ·
Supabase (Postgres + Auth + Storage + Realtime; `@supabase/ssr`, always
`getClaims()` not `getSession()`) · Drizzle ORM, RLS default-deny · tRPC v11
+ TanStack Query · Vitest (split unit/integration config) · shadcn/ui
(unthemed pending G3) · PostHog (consent-gated) · Sentry (Next.js 16
instrumentation pattern) · Trigger.dev (wiring only, real jobs Phase 5) ·
Payload CMS self-hosted (planned, unbuilt) · Resend / Beehiiv / Cal.com
(planned, zero code).

## Where things live
- `docs/development-plan.md` — architecture, phases, stack decisions.
- `docs/BUILD_SPEC.md` — machine-checkable exit criteria per phase, owner
  gates, hard constraints (TDD, RLS matrix, file size, git workflow).
- `docs/ROADMAP.md` — the checkbox tracker (kept current; see
  [[knowledge/superseded]] for a granularity caveat on two checkmarks).
- `src/designs/` — the 22-option design gallery; `registry.ts` is the single
  wiring point, `_content.ts` the shared copy.
- `src/server/db/schema/` — Drizzle schema (identity + leads, 5 tables).
- `src/server/trpc/` — tRPC router tree (currently just `health`).
- `src/lib/analytics/` — PostHog init + consent gate.
- `.env.example` — the full env var inventory; **never read `.env.local`**.

## Working conventions (from CLAUDE.md / BUILD_SPEC hard constraints)
TDD (failing test → minimal code → pass → commit), work on `feature/*`
branches via `/git-workflow-planning:start`, never merge to `main`,
type-check/lint/full-suite must exit 0 at every checkpoint, files ≤~450 LOC,
all UI through frontend-design + shadcn skills (standing instruction, see
memory), local Supabase only until launch.

## Next real step
Pick (or synthesize) a direction from the 22 gallery options → clears G3 →
unblocks theme-token codification and the rest of Phase 0.

