# R1 Security Evidence

Updated: 2026-08-31

This record summarizes local R1 evidence. It does not prove cloud, staging, or
production activation. It does not record real administrator credentials,
phone evidence, or recovery approvals.

## Evidence map

| Control | Local evidence |
|---|---|
| Verified identity and assurance | `src/server/auth/verified-identity.ts`, `src/server/auth/authorization.test.ts`, `src/server/auth/auth.integration.test.ts` |
| Protected entry points | `src/server/auth/entry-point-inventory.ts`, `src/server/auth/entry-point-inventory.test.ts`, `docs/security/r1-authorization-matrix.md` |
| Fail-closed permission decisions | `src/server/auth/authorization.ts`, `src/server/auth/authorization.test.ts`, `src/server/auth/r1-security.test.ts` |
| Route and portal guards | `src/server/auth/page-guards.ts`, `src/server/auth/page-guards.test.ts`, customer and vendor layouts, `src/server/auth/r1-security.test.ts` |
| RLS and raw table denial | `src/server/auth/rls.integration.test.ts`, `src/server/auth/r1-security.integration.test.ts` |
| Permission, role, override, and delegation rules | `src/server/auth/permissions.integration.test.ts`, `src/server/auth/permission-registry.test.ts` |
| Security commands, audit, and idempotency | `src/server/auth/security-command-api.integration.test.ts`, `src/server/db/r1-security-command.integration.test.ts` |
| Recovery and MFA reset controls | `src/server/db/r1-recovery-mfa.integration.test.ts`, `src/server/db/r1-recovery-mfa-api.integration.test.ts`, recovery command tests |
| Restricted identity worker | `src/server/db/r1-identity-worker.integration.test.ts`, `scripts/r1-with-local-worker.mjs` |
| Source and import boundaries | `src/server/auth/security-source-contract.test.ts`, `src/server/auth/authorization-boundaries.test.ts` |

## Local check record

The verified local R1.4 package recorded these checks before later R1.5 bootstrap test edits:

- `npm test`: 1,762 tests passed in 48 files.
- `npm run type-check`: passed for that package; the current worktree reports two undefined-value errors in `src/server/auth/r1-bootstrap-super-admin.test.ts`.
- `npm run lint`: passed.
- `npm run build`: passed with framework deprecation warnings only.
- `npm run check:integration-matrix`: passed after the wrapper and source inventory matched.
- Recovery and migration rehearsal: 100 cases passed.
- Restricted worker rehearsal: 64 cases passed.
- Boundary scan: 47 cases passed.
- Two real local Auth recovery flows passed.

Run the integration evidence with `npm run test:integration` after starting the
local Supabase stack. The wrapper uses the restricted local worker path and
keeps credentials out of logs and retained artifacts.

## CI and release state

CI now checks the integration matrix inventory before the standard gates. CI
does not yet start Supabase or run the full integration matrix because the
approved pinned Supabase setup action is not available.

R1 is not closed by this record. Browser journeys, approved CI Supabase setup,
target-environment identity evidence, and later domain coverage remain open.
Cloud migration, production worker activation, bootstrap, and deployment did
not occur.

## Recovery path

If a required security check fails, keep the affected route or worker disabled,
preserve the evidence, and use `docs/security/r1-emergency-containment.md`.
Apply a reviewed forward fix and rerun the relevant local matrix before any
target-environment action.
