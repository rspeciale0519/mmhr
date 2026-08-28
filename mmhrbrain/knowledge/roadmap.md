---
kind: knowledge
slug: roadmap
status: current
updated: 2026-08-27
layer: roadmap
sources:
  - docs/README.md
  - docs/PRD.md
  - docs/TECH_STACK.md
  - .codex/plans/roadmap-v2-implementation.md
  - .codex/plans/module-r0-roadmap-and-public-release-control.md
  - .codex/plans/module-r1-secure-platform-base.md
  - memory:2026-08-27-r0-release-control
---

# Roadmap

The approved v2 roadmap is .codex/plans/roadmap-v2-implementation.md.

It maps all 148 PRD identifiers to evidence status, release, owner role, and
recovery controls. Version 1.6 records all required R1 owner approvals and the
validated R1.1 status.

## Baseline

- 5 requirements are Implemented.
- 22 requirements are Partial.
- 119 requirements are Missing.
- FR-IAM-08 is Deferred.
- FR-RFP-05 is Open.

See the roadmap traceability matrix for evidence paths and classifications.

## Release Order

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

## R0 Control

The R0 record defines assigned owner roles, the policy quarantine, claim-source inventory, local
fail-closed gate, recovery, and remaining exit evidence. The local gate is
verified but is not active on the current production deployment.

R0 remains open for exact claim review, deployment and alias controls, and
live verification.

The product owner chose to retain unverified statements as blocked placeholders
for now. This decision does not approve public use.

## R1 Detailed Plan

The fully owner-approved R1 plan is
.codex/plans/module-r1-secure-platform-base.md.

It defines identity, permissions, RLS, audit, invitations, MFA, migration,
CI, evidence, and recovery. Rob Speciale is the temporary operations owner.

The approved amendment makes R1 the foundation for FR-IAM-10 and FR-IAM-11.
Their final evidence belongs to R6 and R7.

FR-IAM-12 remains in R1. R2B must extend its implemented portal-grant control
to real deal grants.

R1.1 is complete. It adds the durable entry-point inventory and fail-closed
identity and request boundaries. R1.0 remains open because the recovery roster
and demonstrated three-person quorum are placeholders. R1.2 must wait.

## Authorization

The current standing instruction authorizes R1 implementation and routine Git
work through `develop`. Production dependencies, cloud migrations, bootstrap,
`main`, and deployments need separate approval.
