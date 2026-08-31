# mmhr brain — STATE
Updated: 2026-08-31

## Current focus
The canonical product baseline is in docs/README.md, docs/PRD.md, and
docs/TECH_STACK.md. The approved roadmap is in
.codex/plans/roadmap-v2-implementation.md. R1 implementation decisions are in
.codex/plans/module-r1-secure-platform-base.md, version 0.12.

The active full-delivery goal authorizes normal project implementation,
dependencies, Git, cloud configuration, migrations, bootstrap, releases, and
deployment. Required checks and real identity evidence still apply.
Purchases and new paid commitments remain prohibited.

The sandbox reviewer rejected the exact remote push for
bugfix/r1-stable-identity-context. That write needs explicit user approval.
Do not bypass the rejection through another command or branch.
Independent local work can continue.

R1.0 through R1.3 are merged into develop at b1ffbe1. Two late review
findings remain open. The local correction dbac05f fixes the stable-ID
comparison and restores the earlier journal text. It passed all local
checks but is not pushed or merged.

Current branch: feature/r1-permission-evaluation, based on b1ffbe1.
R1.4 commands, recovery, identity adapters, and restricted worker delivery are
implemented and verified locally. R1.5 route and MFA foundations are in progress.

## Latest synopsis
The current package adds 30 typed permissions, 60 explicit role defaults,
caller-bound database evaluation, field filtering, permission-aware tRPC
builders, audited commands, recovery, identity adapters, restricted worker
delivery, guarded portal routes, and an identity-only MFA flow.

Migration 0003 preserves approved version-one role history and activates
version-two defaults. It is applied only to the validated local MMHR stack.
No cloud or production migration occurred.

Type checking, lint, 1762 unit tests, 100 recovery and migration cases, 64
worker cases, 47 boundary cases, two real local Auth recovery flows, and the
production build passed. Independent security reviews found no remaining
critical issue in the verified local package.

See docs/security/r1-permission-evaluation.md, docs/security/r1-evidence.md, and
[[journal/2026-08-31]].
The existing request-scoped helper still needs dbac05f before integration.
Permission-protected home, admin, customer, and vendor route foundations are active in code. R1.8 local evidence records and matrix checks are present. Runtime recovery and production worker scheduling remain disabled.

## Open threads
- Submit dbac05f after exact remote-write approval. Close the late PR 8 and PR 9 findings after remote validation.
- Integrate the local evaluation foundation only after its stable-ID prerequisite and remote checks pass.
- Complete R1.5 through R1.8 route, MFA, administration, and portal evidence.
- Narrow platform allows to platform scope before mutation access opens. See the owning plan's command decisions.
- Keep recovery disabled until stable identity bindings, verified factors, contact preparation, audited commands, and all recovery tests pass.
- The interim recovery pair has no backup. Recovery stops when the required other administrator is unavailable.
- Do not use a stale AAL2 token as proof of current MFA enrollment.
- Complete R1.5 through R1.8, R2A, R2B, and R3 through R9 with objective evidence.
- R0 claim review, public-release controls, old deployment aliases, and live verification remain open.
- Production state was not reverified during this local package. Do not infer current production safety from local checks.
- Validate staging before production migration or deployment. The active goal grants authority, not evidence.
- Target environments must set NEXT_PUBLIC_APP_URL to one canonical origin.
- RLS remains enabled on every application table. Request access uses fixed functions and a request-scoped public client.
- The restricted direct PostgreSQL worker has no raw table access. Worker delivery is locally verified but not activated in a target environment.
- Customer and vendor routes have guard foundations. CRM and workflow records remain future work.
- Public claims and commission copy still need approved evidence before release.
- No provider-neutral AI adapter, fixture suite, approval queue, or AI-run store exists yet.
- Retain all 22 gallery layouts. Verify both Pulse routes and themes if shared UI changes.
- Keep unrelated local settings and generated Codex hooks outside task commits.
- Keep the copied public-site corpus and questionnaire audit in docs/temp/ internal.

## Active skills in play
- (none)

## Notes
- Use docs/README.md as the project entry point.
- Use docs/PRD.md for product authority.
- Use docs/TECH_STACK.md for architecture and security authority.
- Use docs/security/r1-authorization-matrix.md for current entry-point classes.
- Use [[knowledge/superseded]] before consulting legacy plans.
- Verified identity does not prove membership or permission.
- Keep immutable audit history and deny-first recovery controls.
- Do not run consolidation before the current full-delivery task ends.
