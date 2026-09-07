# Pre-workflow-review checkpoint

This branch preserves unfinished work. It is not a release or a merge candidate.
Development remains stopped until the user approves the corrected product workflow.

## Scope

The checkpoint retains application code, tests, migrations, required Drizzle metadata,
dependency locks, CI configuration, project documents, and engineering memory.
Local settings, local hooks, secrets, build output, and dependency caches are excluded.
No database migration, production release, or branch merge is part of this task.

## Product clarification

The user confirmed these requirements after development stopped:

1. The customer creates a free account and supplies software needs.
2. The preliminary software scorecard shows all vendors with provider names masked.
3. Each option has a selection button. The customer selects up to five RFP contenders.
4. The customer proceeds to a representative call or a form that creates the RFP.
5. MMHR reviews required capabilities and customization requests with the customer.
6. Provider names become visible after that discussion, before RFP submission.
7. MMHR sends the approved RFP to the selected providers.
8. The customer compares responses and selects a provider, then signs a direct contract.
9. Customers never pay MMHR. Providers pay MMHR a commission or referral fee.

The five-choice limit applies to selections, not to the number of displayed options.
Reconcile the canonical PRD, roadmap, and implementation with these requirements before new development.
This checkpoint does not claim that the current application implements this complete journey.

## Open work and risks

- Registration lacks the identity synchronization RPC and its wiring.
- Organization administration UI and real router integration remain unfinished.
- Signed-in browser verification remains open.
- The September 5 full integration session result could not be recovered on September 7.
- Current full integration success is unverified. No replacement database suite runs for this archival checkpoint.
- The R9 evidence validator accepts the manifest, but all 12 release evidence categories remain blocked.
- A passing unit suite or build does not establish production readiness or complete authorization.

The review covers checkpoint scope, sensitive-file exclusion, key configuration changes,
and automated checks. It is not a complete security audit of the accumulated changes.

## Recovery

The checkpoint branch preserves the current history and work without changing `develop` or `main`.
Use a separate checkout to inspect an earlier commit. Do not discard this worktree or apply its migrations for recovery.

## Verification

September 7 checks passed:

- `npm run type-check`
- `npm run lint`
- `npm test`: 289 files and 2,957 tests passed in 537.20 seconds.
- `npm run build`: 67 pages generated.
- `npm run check:secrets`: 992 tracked files scanned before this checkpoint note was added.
- Additional credential-pattern scan: no matches in staged files.
- `npm run check:integration-matrix`: 85 integration test files inventoried, not executed.
- `npm run check:dependency-audit`: zero vulnerabilities reported.
- `git diff --cached --check` and `git diff --check`: passed.

`npm run check:r9-evidence` validated the manifest but reported all 12 release categories blocked.
Existing Next middleware and Sentry deprecation warnings remain.
Full integration and signed-in browser checks were not repeated for this archival task.
