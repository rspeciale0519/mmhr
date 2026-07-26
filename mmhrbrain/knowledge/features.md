---
kind: knowledge
slug: features
status: current
updated: 2026-07-15
layer: reference
sources:
  - docs/development-plan.md
  - docs/ROADMAP.md
  - docs/BUILD_SPEC.md
  - drizzle/0000_light_vanisher.sql
  - src/server/db/schema/
  - src/server/trpc/root.ts
  - src/lib/analytics/posthog.ts
  - src/lib/analytics/consent.ts
  - src/middleware.ts
  - .github/workflows/ci.yml
  - trigger.config.ts
  - src/trigger/health.ts
  - src/designs/registry.ts
  - .env.example
  - .vercel/project.json
---

# Features — build status (Phase 0, 2026-07-15)

Evidence-gated per the knowledge-build runbook. BUILT = entrypoint exists,
non-stub, wired end-to-end. Every claim below was independently re-verified
by re-opening the cited file, not just trusted from a first pass.

## BUILT
- **Local Supabase + Drizzle schema** — `drizzle/0000_light_vanisher.sql` creates
  5 tables (`orgs`, `org_members`, `invitations`, `leads`, `audit_log`); all 5
  have RLS enabled, zero `CREATE POLICY` rows = confirmed default-deny.
- **Supabase Auth** — `src/lib/supabase/{client,server}.ts` (`@supabase/ssr`
  three-client pattern) + `src/middleware.ts` calls `getClaims()`, not
  `getSession()` (explicit warning comment against the swap). Proven by
  `src/server/auth/auth.integration.test.ts` (3 tests, live local stack).
  Middleware does NOT gate routes yet — deferred to Phase 2 by design.
- **CI** — `.github/workflows/ci.yml` runs type-check → lint → `vitest run` →
  build in order. `*.integration.test.ts` excluded from CI (deferred to Phase 2).
- **PostHog, consent-gated** — `initAnalytics()` (`src/lib/analytics/posthog.ts`)
  returns before `posthog.init()` unless `hasAnalyticsConsent()`. Wired via
  `<CookieConsent />` mounted in `src/app/layout.tsx`, not a dedicated
  provider. No code path reaches `posthog.init` pre-consent.
- **Design gallery** — 22 design folders (5 rounds), all registered 1:1 in
  `src/designs/registry.ts`, served at `/designs` + `/designs/[slug]`, shared
  copy in `src/designs/_content.ts`. Deployed as its own Vercel project
  (`mmhr-designs`, `GALLERY_ONLY=1`) at `mmhr-designs.vercel.app` — see
  Orientation for the two-deployments-one-repo split.
- **Test suite** — 7 files, ~22 tests: `brand.test.ts`, `smoke.test.ts`,
  `analytics/consent.test.ts` (7), `trpc/health.test.ts` (2),
  `designs/registry.test.ts` (4), plus 2 integration files (auth, db). Split
  config: `vitest.config.ts` (jsdom, unit) vs `vitest.integration.config.ts`
  (node, loads `.env.local`, sequential).

## PARTIAL
- **Route groups** — `(marketing)`, `(app)`, `(auth)`, `(admin)` all exist and
  render, but only `(auth)` has real logic (`auth-form.tsx`, `actions.ts`).
  `(marketing)` also hosts the fully-built design gallery, unrelated to the
  marketing site itself, which is still a single placeholder `<h1>`.
  `(app)/home` is a functional auth-gated stub; `(admin)` is a placeholder.
- **tRPC** — wiring is complete end-to-end (`root.ts` → `api/trpc/[trpc]/route.ts`
  → `TRPCReactProvider` in `layout.tsx`), but `appRouter` holds only the
  `health` router (`ping`/`whoami`). No business router exists yet.
- **Brand config** — `src/lib/brand.ts` is real and imported by the marketing
  page + CI, but currently holds only `brand.name` (env-overridable) — no
  colors or copy constants despite the name.

## CONFIGURED (client wired, not yet load-bearing)
- **Sentry** — Next.js 16 instrumentation pattern (`src/instrumentation.ts`,
  `src/instrumentation-client.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`), not the legacy `sentry.client.config.ts` pattern.
  Inert until `NEXT_PUBLIC_SENTRY_DSN` is set.
- **Trigger.dev** — `trigger.config.ts` + one task, `src/trigger/health.ts`
  (`health-check`, logs + returns `{ok:true}`) — explicitly a wiring check.
  Real pipeline tasks (crawl/extract/validate/publish, FR-P1–P6) land Phase 5.

## PLANNED (env var placeholder or doc mention only — zero code)
- **Payload CMS** — no `payload` dependency, no config, no collections. D5
  ratified, unbuilt.
- **Resend** — no package, no email-sending module. `RESEND_API_KEY` +
  `EMAIL_FROM` in `.env.example` only.
- **Beehiiv**, **Cal.com**, **Anthropic API** (app-facing), **Firecrawl** — same
  pattern: env var name reserved in `.env.example`, zero code trace.
- **Vercel staging deploy (the app itself)** — `vercel.json` exists (framework
  config only). The only linked Vercel project in this checkout is
  `mmhr-designs` (the gallery) — the product app has no staging deployment
  yet. Roadmap's `[ ]` here is accurate.

## Not yet investigated (UNVERIFIED)
- `src/components/ui/` (shadcn primitives) — presence confirmed, contents not
  audited component-by-component.
- `src/designs/_content.ts` exact shape — confirmed to exist and be imported
  by all 22 designs; not read in full during this pass.

