# Contract integration test budget correction

Date: October 3, 2026. The focused current contract SQL suite passes all 13 checks.
The immutable full integration run retains this failed case.
This correction changes one test's aggregate budget and adds measured phase durations.

## Failed baseline

The affected file is `src/server/db/r6-contract-portal.integration.test.ts`.
Its case, "preserves non-signed and cancelled outcomes and permits another decision", failed after 20,022 milliseconds.
The default integration test budget was 20,000 milliseconds.
The retained baseline trace reports 12 passing checks and one failed check in this file.

This file uses modeled Auth rows and direct SQL calls in a disposable database.
It is separate from `r6-contract-portal-auth.integration.test.ts`, which uses genuine signed Auth sessions.
The original failure must not be described as a failed genuine Auth request.

The unchanged trace is [the full baseline log](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/full-integration-snapshot-2026-10-03.log).
The baseline source snapshot remains unchanged.
Its affected source file has SHA256 `e706cc16f4b6314c74a186661ef735144953b0337eb1df5eacf4dffcf117f7cb`.

## Diagnosis and correction

The case performs eight sequential command calls and two customer reads in one transaction.
Each modeled Auth call also performs savepoint, role, claim, and verification round trips.
The case proves that both original outcomes remain visible after another customer decision.
Keep its composed history assertions together.

The corrected case uses a 120,000-millisecond aggregate test budget.
Existing genuine Auth contract journeys already use this budget.
The SQL history pagination case already uses 180,000 milliseconds for its longer sequence.
The integration configuration's default budget remains unchanged.

Seven phase measurements report only fixed phase names and durations.
They do not log payloads, tokens, account identifiers, or customer content.
No assertion, SQL constraint, role check, request deadline, transaction boundary, or fixture isolation changed.
No application runtime source or migration changed in this correction.

The measured complete case took 21,081 milliseconds.
This exceeds the former aggregate budget without removing any assertions.
It supports the test-budget correction.
The measurements do not prove that resource contention caused the earlier slowdown.

## Measured current verification

The finance fixtures completed their owned cleanup before this focused suite started.
The guarded runner used the current source and 158 registered root migrations.
Application secrets and ordinary database URLs remained excluded by the existing wrapper.

Command: `npm run test:integration -- src/server/db/r6-contract-portal.integration.test.ts`.

| Phase | Milliseconds |
|---|---:|
| First selection approval and introduction | 8,874 |
| First negotiation | 1,535 |
| First not signed outcome | 1,598 |
| Second selection and approval | 5,857 |
| Second cancelled outcome | 1,848 |
| Preserved customer outcomes | 750 |
| Customer can make another decision | 603 |

Vitest reports one passing file and 13 passing checks.
The suite started at 00:39:05 EDT and took 228.72 seconds, including setup and cleanup hooks.
The guarded runner exited with code zero.
The owned contract test namespace has no remaining containers or database volumes.
The saved trace is [the focused current log](C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/contract-sql-current-2026-10-03.log).

The corrected test file has SHA256 `b71cedac905fd6bc5aad8a79d82bf24070620f5744efbc8141f465900b3538d5`.
Focused ESLint passed for the changed test file.
The source whitespace check passed.

## Limits and remaining checks

This focused pass does not turn the earlier complete baseline into a passing gate.
The final candidate still requires complete integration evidence and applicable broader checks.
Genuine Auth request timing, hosted behavior, production performance, and real participant acceptance remain separate evidence requirements.
The existing genuine Auth timeout and retry assertions were not weakened or edited.

No package installation, Git write, saved database change, cloud action, or deployment occurred.
See [the complete gate record](r1-integration-gate-2026-10-03.md) and [the existing contract evidence](r6-contract-portal.md).
