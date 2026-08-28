# mmhr brain — STATE
Updated: 2026-08-28

## Current focus
The canonical v2 product baseline lives in docs/README.md, docs/PRD.md, and
docs/TECH_STACK.md. The approved implementation roadmap lives in
.codex/plans/roadmap-v2-implementation.md.

Roadmap version 1.8 maps 148 requirements to evidence status, releases, owner
roles, tests, risks, and recovery. R1.1 is merged into `develop`. R1.2 is
implemented and locally validated in commit `e7bc6c2`. Routine R1 Git work
through `develop` is authorized. `main`, cloud migrations, bootstrap,
dependencies, and deployment remain separately controlled.

R1.1 now uses one verified identity boundary, rejects untrusted Server Action
origins, denies `/admin`, limits `/home` to pending access, and records every
current entry point in docs/security/r1-authorization-matrix.md.

R1.2 adds compatible identity, role, permission, audit, invitation, and recovery
data through one additive migration. It keeps legacy reads, enables RLS on all
application tables, and uses an expiring restricted worker with no raw table
access. Empty, populated, rollback, and restore rehearsals pass.

R1.0 is complete. Requests expire after 30 minutes, allow only an MFA
enrollment reset, and use a phone call to the pre-existing company record.
The approved flow binds one replacement factor to the target's recovery
session and denies stale AAL2 access. Recovery is not implemented or active.

The baseline stabilization pull request was merged into `develop` at
`6187d3d` before this R1.1 branch started.

The R0 owner assignments, claim-source inventory, and fail-closed release gate live in
.codex/plans/module-r0-roadmap-and-public-release-control.md and
src/lib/public-release.ts. The gate passes local production checks but is not
active on the current production deployment.

Pulse remains the selected homepage direction at /. All 22 gallery layouts
remain in src/designs/ and stay available at /designs.

## Latest synopsis
Built and validated the R1.2 compatible identity and audit foundation. All
local gates and an independent adversarial security review passed. Runtime
recovery remains disabled. See [[journal/2026-08-28]].

## Open threads
- R1.3 grants, RLS policies, and request-scoped access are the next R1 package.
- Recovery must stay disabled until stable identity binding, contact preparation, audited commands, and required tests finish.
- The interim recovery pair has no backup. Recovery stops when the required other administrator is unavailable.
- Create and verify stable identity bindings after R1.2 and before recovery activation.
- Target environments must set `NEXT_PUBLIC_APP_URL` to one canonical origin.
- R0 claim review is deferred while the statements remain blocked placeholders.
- The current production deployment remains accessible. Activating the gate needs separate production approval.
- Old deployment URLs and aliases must be protected or retired before R0 closes.
- Open product decisions remain in docs/PRD.md and must close before their
  owning modules start.
- RLS is enabled on all application tables, but policies and the
  organization-role integration matrix remain absent.
- The direct server PostgreSQL pool now uses an expiring restricted worker.
  R1.3 must add request-scoped policies before application data access.
- Customer, vendor, and administration workflows remain mostly placeholders.
- Legacy FR identifiers remain temporary aliases in the canonical PRD.
- Placeholder figures and claims remain in source and on the current production site.
- Public commission and affiliation copy still reflects the legacy fixed-rate
  product. Replace it before any public release.
- No AI adapter, fixture suite, approval queue, or AI-run store exists yet.
- The generic AI environment names replace the former provider-specific
  placeholder. No current application code consumes them.
- The project has a linked production deployment. Do not change or redeploy it without explicit approval.
- The comprehensive OutSail questionnaire audit remains in gitignored
  docs/temp/.
- The public-site corpus remains in gitignored docs/temp/. Keep copied media
  internal.
- The durable operating-model brief remains untracked.

## Active skills in play
- (none)

## Notes
- Use docs/README.md as the entry point.
- Use docs/PRD.md for product authority.
- Use docs/TECH_STACK.md for architecture and security authority.
- Use docs/security/r1-authorization-matrix.md for current entry-point classes.
- Use [[knowledge/superseded]] before consulting a legacy planning file.
- Public release stays blocked until exact claim review and production gate activation are complete.
- Verified identity does not prove organization membership or permission.
- The recovery rule is approved policy only. No runtime recovery command exists.
