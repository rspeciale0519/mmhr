---
kind: knowledge
slug: roadmap
status: current
updated: 2026-10-07
layer: roadmap
sources:
  - docs/README.md
  - docs/PRD.md
  - docs/TECH_STACK.md
  - .codex/plans/roadmap-v2-implementation.md
  - .codex/plans/release-mvp-launch-checklist.md
  - .codex/plans/module-r0-roadmap-and-public-release-control.md
  - .codex/plans/module-r1-secure-platform-base.md
  - drizzle/0001_heavy_kulan_gath.sql
  - drizzle/0002_r1_request_scoped_access.sql
  - scripts/r1-with-local-worker.mjs
  - memory:2026-08-27-r0-release-control
---

# Roadmap

Current delivery order, owner-approved October 7, 2026: [MVP complete UI/UX and backend roadmap v1.1](../../.codex/plans/build-mvp-complete-ui-ux-roadmap-2026-10-06.md), phases P0 to P5, with Launch Candidate A after P2 and Candidate B after P3. Current phase record: [P0 baseline](../../.codex/plans/build-mvp-p0-baseline-2026-10-07.md).
Finance ledgers and private document storage are outside the MVP. The older plans carry dated supersession notices and remain history until their post-launch rewrite.
The full v2 roadmap is [roadmap-v2-implementation.md](../../.codex/plans/roadmap-v2-implementation.md).
The earlier MVP checklist, [release-mvp-launch-checklist.md](../../.codex/plans/release-mvp-launch-checklist.md), keeps its task IDs as tracking labels only; later mandatory software work remains in the full roadmap.

## Historical Implementation Baseline — August 31

The implementation statements below record the August 31 baseline, not a new audit.
Use STATE.md and dated evidence for subsequent implementation status.

It maps all 148 PRD identifiers to evidence status, release, owner role, and
recovery controls. Version 1.10 records the R0 control record, R1 owner
approvals, and the resolved RFP amendment decision. Current source and tests
provide verified R1 through R9 foundation evidence; target release evidence
remains open.

## Baseline

- 6 requirements are Implemented.
- 141 requirements are Partial.
- 0 requirements are Missing.
- FR-IAM-08 is Deferred.

FR-RFP-05 is implemented with a common base and additive immutable vendor
amendments. The production release remains blocked by missing target evidence.

See the roadmap traceability matrix for evidence paths and classifications.

## Full v2 Release Order

1. R0 records approval, assigns decision ownership, and enforces the public-release block.
2. R1 completes identity, permissions, RLS, and audit.
3. R2A and R2B complete marketing, leads, CRM, and workflow foundations.
4. R3 builds intake, matching, and evaluation.
5. R4 builds RFP, communication, document, inbound, and job foundations.
6. R5 adds provider-neutral AI assistance.
7. R6 builds demos, proposals, and contract handoff.
8. R7 builds commissions and financial closure.
9. R8 completes customer success, operations, administration, and reporting.
10. R9 completes production hardening and release gates.

R2A and R2B can run in parallel after R1. R3 depends on R2B.
The MVP milestone is an earlier delivery subset with its own mapped sequence and the existing release checks.
See the authoritative checklist rather than treating this full-product order as a requirement to finish every later UI before the MVP.

## R0 Control

The R0 record defines assigned owner roles, the policy quarantine, claim-family
inventory with accountable owners, route coverage, the local fail-closed gate,
recovery, and remaining exit evidence. The control records are complete. The
local gate is verified but is not active on the current production deployment.

Public release remains blocked for exact statement review, deployment and alias
controls, live verification, and the required approvals.

The product owner chose to retain unverified statements as blocked placeholders
for now. This decision does not approve public use.

## R1 Detailed Plan

The fully owner-approved R1 plan is
.codex/plans/module-r1-secure-platform-base.md.

It defines identity, permissions, RLS, audit, invitations, MFA, migration,
CI, evidence, and recovery. The owning plan records the temporary operations owner.

The approved amendment makes R1 the foundation for FR-IAM-10 and FR-IAM-11.
Their final evidence belongs to R6 and R7.

FR-IAM-12 remains in R1. R2B must extend its implemented portal-grant control
to real deal grants.

R1.0 through R1.4 are complete on the implementation branch. R1.4 adds
audited commands, recovery, identity adapters, and restricted worker delivery.
R1.5 route and MFA foundations are in progress. Runtime recovery remains
disabled until target-environment activation is separately approved.

## Authorization

The August 27 record authorized R1 implementation and routine Git work through `develop`.
That historical record does not authorize current launch actions; use the current user instructions and project working agreement.
