# Claude handoff — November 10, 2026

## Start here

Use branch `codex/fix-selection-retry` in `rspeciale0519/mmhr`.
Code commit `9c47411673a5cabb43e2b2706eee1d7f708d84cf` was pushed and verified on GitHub.
This branch contains the unique code from the three local fix worktrees and the main checkout's current documents.
The local development checkout is:

`C:/Users/rob/.codex/visualizations/2026/09/13/01a098d6-8ffd-7e60-900f-342770760bda/mmhr-selection-retry-fix`

The original checkout remains on its older `develop` revision with its edits preserved.
Do not start from that old checkout and assume it contains these fixes.
The remote integration branch is `develop`; `main` is for an approved production release.

## Database

All 175 Drizzle migrations, through `0174_r3_coverage_conditions`, are applied to the existing local database.
There are no pending entries in the current migration journal.
This result applies to the local Supabase database at `127.0.0.1:57022/postgres`.
No cloud or production migration was applied.

Migration 0174 is a backward-compatible function expansion.
The staff preparation screen still uses format 2.
The API and database accept format 3; old format 1 and 2 records retain their behavior.
The temporary failure guard has been removed after review and tests.

The exact migration SHA-256 is:
`f601c78b405aa188289b9b279dce1e00771526faa00971658b879e42f9192687`.

Before application, a local transaction installed the exact migration and then rolled back.
The checks preserved all 197 checked table fingerprints, 174 older migration records, and nine legacy comparison results.
After application, the same checks passed and the new migration record matched the exact hash.
The existing function permissions stayed unchanged; the new private helpers are not callable by application roles.

Six older committed migration files differ from the applied historical records. Four original versions remain unrecovered.
The unrecovered versions are 0001, 0002, 0026, and 0027.
The 0028 applied bytes match commit `b9507dd9260424a9e069299bf4fdeeb0cb1779bf`.
The 0046 applied bytes were reconstructed with `masked`; migration 0172 already corrects that installed behavior.
Their records were preserved. Do not replace those records or reset the database to hide this difference.
See `docs/security/phase1-four-option-preview-2026-09-16.md` and the November 9 journal for the earlier recovery evidence.

## Recovery

The migration changes functions and does not rewrite saved application records.
Failure during its transaction rolls back the function changes.
Original function definitions and table fingerprints are saved in session scratch as `phase1-0174-before-apply.json`.
After a format 3 publication exists, preserve format 3 readers and use a forward repair.
Do not restore old readers alone, delete history, or reset the existing database.

## Remaining Phase 1 work

1. Connect staff preparation controls to format 3 and its saved partner-choice mapping.
2. Complete the reviewed vendor records. Do not treat draft vendor facts as approved.
3. Resolve the pending local worker-login startup action.
4. Verify customer evaluation creation in a signed native browser session.
5. Complete the remaining launch checklist and hosted validation.

The customer partner question and the staff package-condition inputs are present.
These inputs do not mean that real vendor records have been approved.
The payroll absence rule remains conservative for string answers unless an explicit, tested meaning is provided.

## Verification at migration application

- 13 isolated migration tests passed against the final migration file.
- 83 focused scoring and worker-wrapper tests passed.
- Type checking passed again after the final code changes. Full lint and the focused lint rerun passed.
- Integration inventory passed for all 127 files.
- The final staged-file secret scan passed for 2,232 files.
- The production build passed with placeholder settings. The full unit rerun is still running.

The first full test run and build stalled in the restricted sandbox.
The first isolated database run could not access Docker and ran no cases.
These failed attempts are not passing evidence.
Signed browser verification and the full hosted integration suite remain unverified.

Migration 0174 retains its exact applied bytes. Its final blank line produces a whitespace-only diff warning.
The Git attributes preserve its mixed line endings so the GitHub file keeps the recorded migration hash.

Nine additional historical SQL files had Git line-ending differences only.
Their existing working bytes match the database records and are now preserved in Git.
These are 0130, 0133, 0140, 0142, 0144, 0145, 0150, 0155, and 0156.
No SQL text or database history changed for this byte-preservation step.
