---
kind: knowledge
slug: orientation
status: current
updated: 2026-08-28
layer: orientation
sources:
  - docs/README.md
  - docs/PRD.md
  - docs/TECH_STACK.md
  - .codex/plans/roadmap-v2-implementation.md
  - .codex/plans/module-r0-roadmap-and-public-release-control.md
  - .codex/plans/module-r1-secure-platform-base.md
  - docs/security/r1-authorization-matrix.md
  - src/lib/public-release.ts
  - src/server/auth/
  - drizzle/0001_heavy_kulan_gath.sql
  - scripts/r1-with-local-worker.mjs
  - src/middleware.ts
  - package.json
  - src/app/
  - src/server/
  - memory:2026-08-27-r0-release-control
---

# Orientation

**What this is:** MMHR is a private operating platform for HR software
selection, vendor management, CRM, deal flow, commissions, and customer
success. MMHR staff use it with invited customer and vendor users. It is not a
general SaaS product. See docs/PRD.md.

**Document authority:** docs/README.md is the entry point. docs/PRD.md controls
product behavior. docs/TECH_STACK.md controls architecture, security, and
provider boundaries. The product owner approved the v2 roadmap on 2026-08-24.
Roadmap v1.8 contains the approved amendment, the R0 control record, and the
R1.0 and R1.1 status. Current source and tests provide R1.2 evidence. All
required R1 owner reviews are approved.
Former plans in docs/ are legacy records.

**Where the build is:** Foundations and the public marketing shell exist.
Pulse renders at the site root. The design gallery remains at /designs.
Authentication, the first schema, tRPC, analytics consent, CI, Sentry, and
Trigger.dev foundations exist. Customer and administration workflows remain
mostly placeholders.

R1.1 now verifies one identity subject, denies untrusted Server Action origins,
denies `/admin`, and limits `/home` to a pending-access response. The durable
entry-point record lives in docs/security/r1-authorization-matrix.md.

R1.2 adds compatible identity, permission, audit, and administration data. One
additive migration preserves legacy reads. An expiring restricted worker has no
raw table access. Fresh, populated, rollback, and restore rehearsals pass.

A fail-closed production release gate is implemented and verified locally.
The current production deployment does not include it yet.

The v2 product baseline replaced the former buyer-marketplace plan on
2026-08-24. The approved roadmap maps all 148 requirements to releases.

## Architecture Summary

The repository contains one Next.js application with marketing,
authentication, customer/vendor, administration, and API route groups.

The installed foundation uses Supabase, Drizzle, tRPC, TanStack Query,
Tailwind, shadcn, Trigger.dev, PostHog, Sentry, and Vitest.

All AI work must use a provider-neutral AIService. Provider or model changes
must not alter domain schemas, permissions, approvals, or workflows.

Use package.json and package-lock.json for installed versions. Use
docs/TECH_STACK.md for adopted and planned integration status.

## Important Current Risks

- RLS is enabled on all application tables, but policies remain absent.
- The direct server PostgreSQL pool uses a restricted worker with no raw DML.
- Verified identity does not prove organization membership or permission.
- `NEXT_PUBLIC_APP_URL` must match one canonical target origin.
- The Next.js `authInterrupts` control is experimental.
- The interim recovery pair has no backup, and no runtime recovery command exists.
- Customer and administration routes do not implement the v2 workflows.
- Public placeholder claims remain a release risk. The product owner chose to retain them for now.
- The current production deployment remains accessible until an approved gate deployment occurs.
- Former roadmap phases and FR identifiers are not current sequencing.
- Legacy FR identifiers remain temporary aliases in docs/PRD.md.

## Where Things Live

- docs/README.md — entry point and honest current status
- docs/PRD.md — canonical v2 product requirements
- docs/TECH_STACK.md — canonical architecture and stack
- .codex/plans/roadmap-v2-implementation.md — approved v2 execution order and amendment
- .codex/plans/module-r0-roadmap-and-public-release-control.md — release quarantine and claim-source inventory
- .codex/plans/module-r1-secure-platform-base.md — fully owner-approved R1 security plan
- docs/security/r1-authorization-matrix.md — current entry-point and denial record
- src/lib/public-release.ts — local fail-closed production release gate
- docs/outsail-competitive-operating-model.md — supporting research
- src/app/ — route surfaces
- src/server/ — domain, data, authorization, and tRPC foundations
- src/designs/ — Pulse and retained design gallery
- src/trigger/ — background-job entry points
- src/server/db/schema/ — Drizzle schemas
- drizzle/ — migrations
- .env.example — variable-name inventory; never read .env.local values

## Next Real Step

Start the approved R1.3 grants, RLS, and request-scoped access work.
Claim review remains deferred, and public release remains blocked.
