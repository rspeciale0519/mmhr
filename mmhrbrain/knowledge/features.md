---
kind: knowledge
slug: features
status: current
updated: 2026-08-27
layer: reference
sources:
  - docs/PRD.md
  - docs/TECH_STACK.md
  - src/app/
  - src/server/
  - drizzle/0000_light_vanisher.sql
  - .github/workflows/ci.yml
  - trigger.config.ts
  - package.json
  - .codex/plans/roadmap-v2-implementation.md
  - .codex/plans/module-r0-roadmap-and-public-release-control.md
  - src/lib/public-release.ts
  - src/lib/public-release.test.ts
  - src/middleware.test.ts
---

# Features — Evidence-Gated Build Status

The v2 roadmap audit classifies all 148 requirement identifiers. It found 5
Implemented, 22 Partial, 119 Missing, 1 Deferred, and 1 Open.

Use the roadmap traceability matrix for per-requirement evidence and ownership.

## Built Foundations

- The Next.js application and marketing, authentication, customer,
  administration, and API route groups exist.
- Pulse renders at the site root.
- The 22-design gallery remains available under /designs.
- Local Supabase and Drizzle create organizations, memberships, invitations,
  leads, and audit-log tables.
- Supabase authentication uses verified claims.
- tRPC is wired end to end with health-only procedures.
- PostHog initialization remains consent-gated.
- Sentry and Trigger.dev wiring exists.
- GitHub Actions runs installation, type checking, linting, unit tests, and
  the production build.
- Unit and local integration test configurations exist.
- A fail-closed production release gate blocks pages, APIs, and crawlers in local production checks.

## Partial or Security-Incomplete

- RLS is enabled on the first application tables, but policies are absent.
- The direct Drizzle pool bypasses RLS and is suitable only for trusted paths.
- Customer workspace and administration routes remain placeholders.
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
