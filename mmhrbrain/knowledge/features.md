---
kind: knowledge
slug: features
status: current
updated: 2026-09-03
layer: reference
sources:
  - docs/PRD.md
  - docs/TECH_STACK.md
  - src/app/
  - src/server/
  - drizzle/0000_light_vanisher.sql
  - drizzle/0001_heavy_kulan_gath.sql
  - drizzle/0002_r1_request_scoped_access.sql
  - .github/workflows/ci.yml
  - trigger.config.ts
  - package.json
  - .codex/plans/roadmap-v2-implementation.md
  - .codex/plans/module-r0-roadmap-and-public-release-control.md
  - src/lib/public-release.ts
  - src/lib/public-release.test.ts
  - src/middleware.test.ts
  - docs/security/r1-authorization-matrix.md
  - src/server/auth/
  - src/server/trpc/
  - scripts/r1-with-local-worker.mjs
---

# Features — Evidence-Gated Build Status

The v2 roadmap audit classifies all 148 requirement identifiers. The current
roadmap records 6 Implemented, 141 Partial, 0 Missing, 1 Deferred, and 0 Open.

Use the roadmap traceability matrix for per-requirement evidence and ownership.

## Built Foundations

- The Next.js application and marketing, authentication, customer,
  administration, and API route groups exist.
- Pulse renders at the site root.
- The 22-design gallery remains available under /designs.
- Local Supabase and Drizzle create 19 RLS-enabled application tables.
- Compatible identity, role, permission, audit, invitation, and recovery data exists.
- One additive migration preserves legacy reads and marks uncertain rows for review.
- The server pool uses an expiring restricted worker with no raw table access.
- Supabase authentication uses verified claims.
- One shared identity helper returns only the verified subject identifier.
- Server Actions reject missing or foreign origins before mutation.
- `/home` requires verified identity and returns pending access.
- `/admin` requires verified identity and then denies access.
- tRPC is wired end to end with public health and identity-only procedures.
- The authorization matrix and inventory tests cover current executable entry points.
- PostHog initialization remains consent-gated.
- Sentry and Trigger.dev wiring exists.
- GitHub Actions runs installation, type checking, linting, unit tests, and
  the production build.
- Unit and local integration test configurations exist.
- A fail-closed production release gate blocks pages, APIs, and crawlers in local production checks.

## Partial or Security-Incomplete

- RLS now has explicit deny policies on all current application tables.
- Request-scoped access uses verified claims and fixed field-safe functions.
- Customer and administration data access remains denied until route permissions exist.
- Customer access remains pending until stored membership and permission checks exist.
- Administration remains denied until explicit permission checks exist.
- Public route structure exists, but product copy and claims need v2 review.
- The release gate is not active on the current production deployment.
- No complete v2 domain router or workflow exists.
- Trigger.dev contains a health task only.
- Document, communication, commission, and onboarding workflows are not built.
- AI adapters, evaluation fixtures, review queues, and run records are not built.

## Approved but Not Implemented

- Transactional and inbound communication services
- Private document storage and document scanning
- Managed content
- External content acquisition
- Scheduling and newsletter integrations
- PDF generation
- Provider-neutral AI processing

See docs/TECH_STACK.md for selected boundaries and implementation status.

## V2 Product Domains

The canonical PRD adds or expands customer CRM, vendor CRM, flexible
evaluation, RFP review, vendor responses, demos, proposal versions, contract
handoff, variable commissions, onboarding, customer success, and granular
permissions.

None of these domains is complete until source, policies, tests, and rendered
workflows provide end-to-end evidence.
