# R8 signed Auth evidence — 2026-10-03

The focused R8 suite passed all 36 checks. The runner exited 0 after disposable fixture cleanup.

This result verifies the recorded source snapshot with 162 migrations. It does not accept the complete project integration gate or rendered task workflow.

## Accepted focused run

| Item | Result |
| --- | --- |
| Command | `npm run test:integration -- src/server/db/r8-deal-follow-up-auth.integration.test.ts` |
| Test result | 36 passed; 0 failed; 0 skipped |
| Duration | 199.86 seconds |
| Runner | Session `19208`; exit `0` |
| Snapshot | `r8-current-162-snapshot-2026-10-03` |
| Source inputs | 1,446 files; final hashes unchanged |
| Installed dependency metadata | 39 files; final hashes unchanged |
| Migration count | 162 |
| Manifest SHA256 | `b14f6da60678a1f67e1e413f3065f117041c67de8dd6484eb2029c60df7f3cee` |
| Test SHA256 | `a44c8cd8dcd09fdfbd98288c4c1ef42ddf7ebe977733d27d40b5730ee782ac2a` |
| Migration 0159 SHA256 | `bfeed27450e43310992dab82273d99b2b85c7483fae9cb6d227a2c55de7dbf4a` |
| Migration 0160 SHA256 | `86b4a4b222219934a5c081cd8cc1febf5e528cdf239baa930a979eae6126cef8` |
| Migration 0161 SHA256 | `0311bc025c97c0fda08cb04e69ffeca497c0ada8a3a925b4ff4d10083f8d2cde` |

The fixture used genuine signed Supabase Auth sessions with AAL2 verification. It applied migrations only to its owned disposable local stack.

The wrapper excluded `.env.local`. The snapshot excluded secrets, Git state, saved Supabase state, brain files, and private data.

The snapshot included the required `docs/security/r1-emergency-revocation.sql` input. Source files, scripts, migration SQL, migration metadata, and applicable configuration were recorded.

Installed dependencies were shared through a junction. They were not immutable. Metadata verification does not verify every installed dependency byte.

After teardown, Docker checks found no `mmhr-r1-` containers, volumes, or networks. No R8 fixture process remained after this run.

## Verified behavior

All 33 original cases remained. One signed authority diagnostic and two audit boundary regressions increased the count to 36.

The cases verified scoped task actions, assignment, closed states, concurrent revisions, original replay, and changed-payload rejection.

They verified denied roles, revoked permissions, expired and deleted sessions, restricted raw tables, fixed function search paths, and execution grants.

They verified audit rollback, immutable history, state history binding, queue version protection, cursor binding, pagination, and stable overdue observation time.

The forged receipt case created a valid receipt before its deliberate wrong entity binding reached denial. Its transaction preserved the original database snapshot.

## Measured aggregate budgets

A prior full run passed 32 checks and failed four in 197.10 seconds. Two many-write journeys exceeded the original 20-second aggregate budget.

Their unfinished write loops continued into later cases. The later cursor and database snapshot checks failed during that overlap.

A separate scratch measurement ran those journeys sequentially. It preserved all assertions and used explicit diagnostic budgets.

| Scratch measurement | Duration |
| --- | --- |
| History journey | 36,287 milliseconds |
| Queue journey | 28,260 milliseconds |
| Individual signed writes | 735–3,349 milliseconds |
| History reads | 166 and 105 milliseconds |
| Queue reads | 102–1,147 milliseconds |
| Later overdue case | 6,058 milliseconds |
| Later session and retry case | 3,154 milliseconds |
| Complete selected run | 166.73 seconds; 4 passed; 32 deliberately skipped; exit 0 |

Both later cases passed after the preceding write loops finished. This supports the overlap diagnosis.

Only the two many-write repository tests received 120-second aggregate budgets. Fixed phase diagnostics were added.

The 29-write history journey needs approximately 97 seconds if each write takes the measured maximum. Reads need additional time.

All assertions, other case budgets, and production request limits stayed unchanged. The accepted full run measured 25.881 and 28.228 seconds for these journeys.

## Preserved failures

All logs and failed snapshots remain in the authorized session scratch folder. No failed run was reclassified as passed.

| Log | Original result or cause |
| --- | --- |
| `r8-deal-follow-up-signed-auth-first.log` | 33 skipped; migration 0159 syntax failure |
| `r8-deal-follow-up-signed-auth-syntax-corrected.log` | 33 skipped; synthetic self-issued permission grant violated its actor constraint |
| `r8-deal-follow-up-signed-auth-issuer-corrected.log` | 7 passed; 26 failed |
| `r8-deal-follow-up-signed-auth-diagnostics.log` | 34 skipped; migration 0160 syntax failure |
| `r8-deal-follow-up-signed-auth-finance-corrected-diagnostics.log` | 7 passed; 27 failed; signed diagnostics exposed SQL array concatenation and receipt or capacity failures |
| `r8-deal-follow-up-signed-auth-task-corrected.log` | 32 passed; 4 failed; wrong immutable-helper expectations and outdated forged audit fields |
| `r8-deal-follow-up-signed-auth-fixture-corrected.log` | 32 passed; 4 failed; aggregate timeouts and subsequent write overlap |
| `r8-deal-follow-up-phase-measurement.log` | Separate measurement; 4 passed; 32 deliberately skipped |
| `r8-deal-follow-up-current-162-full.log` | Accepted focused result; all 36 passed |

The task SQL corrections retained existing authorization rules. They corrected ambiguous array concatenation and introduced narrow task audit fields.

The fixture added an eligible reviewed administrator to its synthetic foreign organization. It retained the administration capacity assertion.

Existing immutable helper denials require their exact `P0001` messages. Other task guard denials still require `42501`.

## Evidence location and remaining work

Scratch root: `C:/Users/rob/.codex/visualizations/2026/09/30/01a0f28d-ebdf-7f60-a338-94a3eee6292e`.

The accepted snapshot contains `r8-input-manifest.json`, `r8-dependency-metadata.json`, and `r8-final-hash-verification.json`.

Rendered task verification, the complete current integration gate, and other project completion gates remain separate requirements.

The historical full baseline remains failed. Its identity recovery cleanup error can mask an earlier body failure; that recovery path still needs focused verification.

No cloud migration, saved local database write, permission deployment, provider activation, or real email send occurred.
