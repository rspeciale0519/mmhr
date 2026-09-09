# Customer requirement saving

Status: implementation under verification. This package does not complete the customer workflow or approve a release.

## Scope and decision

Customers must record structured and custom software needs in their authorized workspace.
This package adds `intake.requirement.save`, an organization action that requires AAL1 and current customer portal access.
New immutable role versions add this default to contributor, organization administrator and Super Admin roles.
The active versions become contributor 4, organization administrator 4 and Super Admin 6.
Other role defaults remain unchanged. Explicit denials and organization restrictions still apply.

This action cannot change membership, ownership, evidence links, vendor links, approvals, ranking or intake submission state.
New requirements use the verified caller as owner. Updates preserve existing ownership and linked evidence.
These fields need separate collaboration controls because the customer answer editor does not read them.

The legacy create and update operations now also require platform `admin.access` under the existing security lock.
This prevents an external AAL2 viewer from using workspace access alone to write requirements.
Existing internal AAL2 input, receipt, revision and metadata behavior remains intact.

## Entry points and persistence

The `intakes.saveRequirement` tRPC mutation requires an exact-origin POST and a verified caller.
The command checks the new action and customer portal access through the same request client and identity.
The fixed `mmhr_save_customer_intake_requirement` RPC independently checks current session, identity, recovery fence, membership and both permissions.
No runtime role gains raw table access or private helper execution.

The strict payload contains ten business fields: requirement, organization and intake identifiers; expected revision; stable key; label; importance; weight; response; and requirement type.
Correlation and retry identifiers travel as separate RPC arguments.
Caller-supplied identity, ownership, authority, evidence and vendor-link fields are rejected.
The command reuses the existing bounded requirement validators.

Expected revision zero creates a new requirement at revision one.
A positive expected revision updates only the matching active requirement in the specified organization and intake.
The parent intake must remain draft or in progress for a new write.
Submitted, under-review, completed and archived intakes remain locked.
Exact retries can return a later revision without another write, including after the parent intake becomes locked.
Clients must not treat this replay as permission to edit a locked record.

The security lock precedes current authorization checks. The parent row lock precedes requirement changes.
The existing immutable history trigger records each new revision.
The business write, history, redacted audit and retry receipt commit together.
Audit summaries contain only `{version: 1}`. Detailed revision evidence remains in requirement history.

## Forward path, risks and recovery

Migration `0109_r3_customer_requirement_save.sql` is additive and preserves earlier role versions and stored records.
The main risks are wrong-workspace writes, viewer escalation, stale overwrites and accidental loss of linked evidence.
Rehearse all migrations and execute the new denial, rollback, history and concurrency tests before release.
Validate the customer operation and retained internal writer in staging before production use.

For containment, revoke execution of the new RPC and remove its application wiring through a reviewed forward change.
If role defaults need correction, create another reviewed immutable role version.
Keep history, audit, receipts, RLS and existing data intact. Do not restore the old broad legacy writer.

## Evidence and remaining work

Static migration and registry checks pass 72 tests. The integration inventory includes 92 files.
Independent SQL review found no remaining implementation defect; it corrected an inaccurate audit expectation in a test.
The seven-file focused run passes 145 tests. The expanded customer command suite passes 31 tests.
Type checking, full lint and the 67-route production build pass.
Full unit34037 passes 317 files and 3,471 tests. Final fixture type/lint63762 also passes.
The staged secret scan passes for 1,076 tracked files. Referenced local document paths exist.
All 24 new integration cases collect. Collection is not database execution; migration 0109 still requires an actual database run.
Review corrected metadata expectations, a duplicate portal grant and denial fixtures that failed before the intended permission check.
The previous CI run at `cd1772e` passed 844 integration tests and failed three assertions across two files.
Those assertions expected older role versions, migration event counts and intake audit summaries.
Their corrections preserve exact checks and include migration 0109 totals. No security validator was changed.
Fresh CI must verify these corrections and the new operation before merge.
There is no customer requirement editor in this package. Browser workflow and save/reload verification remain required after UI wiring.

Sources: [product requirements](../PRD.md), [domain permission contract](r1-domain-extension-contract.md),
[full goal supplement](../../.codex/plans/goal-full-project-completion.md),
[requirement writes](r3-requirement-writes.md), and [authorization matrix](r1-authorization-matrix.md).
