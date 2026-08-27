---
kind: knowledge
slug: superseded
status: current
updated: 2026-08-24
layer: reference
sources:
  - docs/PRD.md
  - docs/README.md
  - docs/TECH_STACK.md
  - docs/development-plan.md
  - docs/BUILD_SPEC.md
  - docs/ROADMAP.md
  - docs/master-plan.md
---

# Superseded Product and Planning Claims

The canonical v2 document set replaced the former product definition on
2026-08-24.

## Superseded Documents

- docs/PRD-2.md — retained drafting input
- docs/README-2.md — retained drafting input
- docs/development-plan.md — legacy v1 sequence
- docs/BUILD_SPEC.md — legacy v1 phase contract
- docs/ROADMAP.md — legacy v1 checklist
- docs/master-plan.md — legacy v1 product plan
- .claude/plans/feature-foundations.md — historical Phase 0 plan

## Superseded Product Claims

- MMHR is primarily a self-service buyer marketplace.
- Every vendor pays the same commission rate.
- One named reseller receives guaranteed placement.
- Vendor self-service is outside scope.
- One named AI provider or model is an architectural dependency.
- The former design direction remains selected.
- The former eight-phase roadmap remains current.

The v2 product is a private operating platform with customer and vendor
portals, internal CRM, variable commissions, and provider-neutral AI.

## Preserved Foundation Evidence

Existing Phase 0 code remains valid evidence for the capabilities it actually
implements.

Legacy FR comments remain temporary aliases through docs/PRD.md. They do not
make legacy sequencing current.

The route-group and tRPC completion claims remain foundation-only:

- Route groups exist, but customer and administration workflows remain stubs.
- tRPC is connected, but business procedures remain largely absent.
- RLS is enabled, but authorization is incomplete without policies and tests.

Use [[knowledge/features]] for current evidence and [[knowledge/roadmap]] for
the required v2 planning reset.
