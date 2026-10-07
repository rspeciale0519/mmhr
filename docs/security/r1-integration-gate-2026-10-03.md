# Full local integration gate October 3 2026

The complete integration gate remains open.
The completed run used a frozen source snapshot and disposable local database projects.
Its result describes that baseline, not source changes made after the snapshot.

## Baseline and scope

The baseline contains 116 integration files and 157 registered root migrations.
The guarded command is `npm run test:integration`.
The wrapper removes application secrets, blocks ordinary database URLs, and enables only the disposable rehearsal lifecycle.
Each suite provisions its own synthetic fixtures and owned random project ID.
Tests keep their existing assertions, file sequence, worker isolation, and timeout settings.
No `.env.local`, hosted credentials, saved database state, or private customer data entered the snapshot.

The snapshot contains `src/`, `scripts/`, `drizzle/`, and `supabase/config.toml`.
It also contains `package.json`, `package-lock.json`, `tsconfig.json`, and `vitest.integration.config.ts`.
The input manifest records 1,360 files and their SHA256 values.
Installed dependencies are reused through a junction; their contents are not frozen.
Package and installed dependency changes must remain on hold throughout this baseline run.
The dependency manifest records 39 declared and installed package versions, with package metadata hashes.

Snapshot directory:
`C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e/integration-baseline-2026-10-03`

| Evidence | SHA256 |
| --- | --- |
| `baseline-input-manifest.json` | `d9993d0784dfbecf5cef65f8188c3fe6d9b6bf03565960750042ed1fd1bd1ea8` |
| `package.json` | `f926e699a401799c072a9a94a0a09f93ec074184f69af328d482af633baa8183` |
| `package-lock.json` | `e6015b1a0e2c7999600dbe1cdfc71551c1a59c5a502a9386c94440ab959ce669` |
| `baseline-dependency-versions.json` | `b2e90feb7e56c278e1fbe419e8d34e7114e292ebb4ea39a71c46d6aa08132adc` |

## Earlier failed gate

The October 1 run passed 110 files and 1,056 checks but failed two checks.
It did not establish a complete integration pass.
The original trace remains in `proposal-full-integration.log` in the session scratch directory.

The identity audit test expected one authorized row before recovery containment but received no rows.
That trace contains no claim-clock diagnostics, so its exact cause remains unproved.
The current modeled Auth helper uses the database clock for issued claims.
An existing regression advances the host clock and separately verifies rejection of future-issued claims.
No production authorization rule was weakened.

The portal replay test exceeded its former 20-second aggregate timeout.
It performs fixture setup and several actual Auth and SQL operations in one test.
The existing test now has a 120-second limit and retains every receipt, revision, and rejection assertion.
This limit does not establish acceptable production performance.

## Current execution

The first October 3 attempt started from the mutable working directory.
It was stopped deliberately so implementation could continue while the baseline ran separately.
Its exit was incomplete; it is not a successful or failed functional gate.
Its retained log is `full-integration-2026-10-03.log`.

Only its identified runner tree was stopped.
The exact disposable project was `mmhr-r1-commandapi-cf7493f8`.
Its checked project configuration identified the temporary cleanup target.
Its containers, volume, empty loopback network, and temporary files were removed.
Saved local projects and their volumes were not changed.

The replacement run started from the snapshot directory.
Its active log is `full-integration-snapshot-2026-10-03.log` in the session scratch directory.
The runner exited 1 after all 116 files finished.
It passed 112 files and failed four files.
It passed 1,101 checks and failed four checks.
The reported duration was 15,317.59 seconds.

The snapshot has a contract SQL aggregate failure at the former 20-second limit.
The failure is in `r6-contract-portal.integration.test.ts`, not a genuine Auth suite.
The current-tree focused correction passed 13 checks and measured 21.081 seconds for that aggregate.
The [contract recovery record](./r6-contract-integration-recovery-2026-10-03.md) documents the separate correction.
It does not turn the frozen baseline failure into a pass.

The snapshot has two further failed checks.
The proposal comparison check in `r6-proposal-quotes.integration.test.ts` exceeded its 20-second aggregate limit at 20.024 seconds.
Its source and assertions remain unchanged in the snapshot.
The identity-worker migration recovery check failed after 86.677 seconds.
That check has an explicit 600-second limit, so an aggregate timeout does not explain this failure.
The final trace identifies a cleanup failure, not a test timeout.
Supabase stop exited 1 with `failed to prune containers` for `mmhr-r1-workerfail-089a61b0`.
The trace points to `stopScratchProject`, called from the nested recovery fixture's `finally` block.
It does not prove that every recovery assertion passed; cleanup can replace an earlier exception.
Do not treat this failed check as accepted recovery evidence.

The empty migration suite also failed its emergency containment check after 8 milliseconds.
Its helper first reads `docs/security/r1-emergency-revocation.sql`.
The snapshot excluded documentation and therefore omitted this required operational SQL artifact.
The file exists in current source but is absent from the unchanged snapshot.
Its current SHA256 is `396acb453831863c2d5dd040c415dd6579b32a62fd9d03b2fd97d9dc98466744`.
That hash describes the current artifact, not a copied baseline input.
This is a snapshot input defect; it does not establish an application SQL failure.
The final trace confirms `ENOENT` for the omitted operational SQL artifact.
Do not add the missing file to the active frozen run.
Include and hash this operational artifact in any complete candidate snapshot or run.

A running checkpoint verified all 1,360 copied file hashes and 39 installed package metadata hashes.
No hash changes were found.
Final verification also found no changes in those 1,360 files or 39 package metadata records.
The recorded manifest, package, and lockfile hashes also matched.
The retained result is `baseline-final-hash-verification.json` in session scratch.
Package metadata verification does not verify every byte in shared dependency directories.

## Final owned cleanup

The runner ended and no baseline runner remains active.
The failed nested fixture left one stopped PostgreSQL container, its synthetic volume, and an empty network.
Their labels identified only `mmhr-r1-workerfail-089a61b0`.
The container label identified `C:/Users/rob/AppData/Local/Temp/mmhr-r1-cF7TPH` as its generated work directory.
Its configuration identified the same project and random local ports.
Its configuration SHA256 was `995c129bef190e351809f7e15c52af44ddbf42d5488cf4a8b3d6c00721489da1`.

An exact retry used `supabase stop --workdir <checked-directory> --project-id mmhr-r1-workerfail-089a61b0 --no-backup --yes`.
That cleanup exited 0.
The checked generated directory was then removed.
Final resource-name checks found no remaining `mmhr-r1-` containers, volumes, or networks.
The retained cleanup log is `baseline-workerfail-cleanup.log` in session scratch.
Saved local projects and their volumes were not changed.

## Completion requirements

Record the complete test result and preserve every failure trace.
Verify the snapshot hashes and installed dependency metadata after execution.
Confirm cleanup of every owned disposable project and runner.
Run affected checks again after subsequent source changes.
The final release candidate requires its own complete integration evidence.
This baseline cannot establish hosted readiness, actual participant acceptance, or production approval.
