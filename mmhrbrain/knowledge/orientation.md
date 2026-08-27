---
kind: knowledge
slug: orientation
status: current
updated: 2026-08-27
layer: orientation
sources:
  - docs/README.md
  - docs/PRD.md
  - docs/TECH_STACK.md
  - .codex/plans/roadmap-v2-implementation.md
  - .codex/plans/module-r0-roadmap-and-public-release-control.md
  - .codex/plans/module-r1-secure-platform-base.md
  - src/lib/public-release.ts
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
Roadmap v1.3 contains the approved amendment and the R0 control record.
Security and engineering approved the R1 draft. Operations review remains pending.
Former plans in docs/ are legacy records.

**Where the build is:** Foundations and the public marketing shell exist.
Pulse renders at the site root. The design gallery remains at /designs.
Authentication, the first schema, tRPC, analytics consent, CI, Sentry, and
Trigger.dev foundations exist. Customer and administration workflows remain
mostly placeholders.

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

- RLS is enabled on the first application tables, but policies remain absent.
- The direct server PostgreSQL pool bypasses RLS.
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

Preserve the current work before new implementation. Claim review is deferred, and public release remains blocked.
