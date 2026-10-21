# Entry-point discovery check October 3 2026

The focused entry-point inventory check passed all 14 tests.
The complete unit gate remains open.
This record does not establish application performance or release readiness.

## Problem and correction

An earlier complete unit run timed out in the executable discovery check after 5.775 seconds.
That check retained its original 5-second test budget.
Its discovery work repeated directory traversal and parsed every source file for server actions.
The separate authorization architecture scan passed after 10.358 seconds.

The correction changes only `src/server/auth/entry-point-inventory.test.ts`.
Discovery enumerates source files once and reads one local source snapshot.
Directory selectors reuse that file list.
Each discovery call owns its parsed-source cache.
The cache cannot retain source from another discovery call.

Server-action discovery skips parsing only when source contains neither `use server` nor a backslash.
A backslash can encode a directive through Unicode, hexadecimal, or continued-line syntax.
Those files still use the TypeScript parser.
Route exports, router procedures, background tasks, and framework hooks retain their original discovery rules.
All four original inventory checks and their assertions remain unchanged.
No test budget or executable coverage exception was added.

## Focused evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Unchanged original inventory probe | 4 passed; tests took 4.07 seconds | `entry-point-inventory-readonly-focused.log` |
| Synthetic optimization checks | 10 passed; four original checks excluded by the explicit filter | `entry-point-inventory-optimization-synthetic.log` |
| First complete optimized inventory run | 13 passed; one durable matrix synchronization failure | `entry-point-inventory-optimization-full.log` |
| Complete run after task matrix synchronization | 14 passed; exit 0; tests took 1.39 seconds | `entry-point-inventory-optimization-synchronized.log` |
| Focused ESLint | Exit 0 | `entry-point-inventory-optimization-lint.log` |

The first optimized run found missing matrix rows for newly added task entry points.
The original matrix assertion detected that mismatch.
The corrected source matrix contained 334 entries when the complete rerun passed.
The initial failure log remains available.

The synthetic checks cover plain directives and escaped Unicode, hexadecimal, and continued-line directives.
They also cover arrow and function exports, misleading comments, and unrelated escaped literals.
One check proves that the safe filter avoids parsing an irrelevant file.
Another proves that separate snapshots do not share stale parsed source.

The reviewed source hash before correction was:
`b4e409719e495e016ef301054635b75cc5eab636e230cea1f6874ee7cf04bbf6`.

The corrected test file hash was:
`03c9484350dddb16bff3e641471e5913cb9ad8fd082b1bd7d6832dca0bec4bc4`.

All named logs are in:
`C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e`.

## Limits and recovery

The measured durations describe focused local test runs.
They do not guarantee the same duration under complete-suite resource load.
The candidate still requires a complete unit run and its other applicable gates.
The frozen integration baseline uses its original source and remains unchanged.

This change affects discovery tests only.
It changes no application permissions, runtime routes, database data, or provider settings.
Recovery can restore the previous discovery implementation without changing its coverage assertions.
