# mmhr brain — STATE
Updated: 2026-08-27

## Current focus
The canonical v2 product baseline lives in docs/README.md, docs/PRD.md, and
docs/TECH_STACK.md. The approved implementation roadmap lives in
.codex/plans/roadmap-v2-implementation.md.

The roadmap maps 148 requirements to evidence status, releases, owner roles,
tests, risks, and recovery. Version 1.4 links the R0 release-control record and
records all required R1 owner approvals. Rob Speciale is the temporary
operations owner. R1 implementation still needs separate authorization.

The approved baseline is captured in four local commits on
`feature/v2-baseline-stabilization`. No push, pull request, merge, or
deployment is authorized yet.

The R0 owner assignments, claim-source inventory, and fail-closed release gate live in
.codex/plans/module-r0-roadmap-and-public-release-control.md and
src/lib/public-release.ts. The gate passes local production checks but is not
active on the current production deployment.

Pulse remains the selected homepage direction at /. All 22 gallery layouts
remain in src/designs/ and stay available at /designs.

## Latest synopsis
Created four focused baseline commits after type checking, lint, 30 tests, and
the production build passed. See [[journal/2026-08-27]].

## Open threads
- R0 claim review is deferred while the statements remain blocked placeholders.
- The current production deployment remains accessible. Activating the gate needs separate Git and production approval.
- Old deployment URLs and aliases must be protected or retired before R0 closes.
- R1 implementation, Git, dependency, cloud, bootstrap, and deployment actions remain separately gated.
- The local baseline commits need separate push and integration approval.
- Open product decisions remain in docs/PRD.md and must close before their
  owning modules start.
- RLS is enabled on the first application tables, but policies and the
  organization-role integration matrix remain absent.
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
- Use [[knowledge/superseded]] before consulting a legacy planning file.
- Public release stays blocked until exact claim review and production gate activation are complete.
- Product approval does not authorize feature implementation or external actions.
