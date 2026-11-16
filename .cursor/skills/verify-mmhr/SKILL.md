---
name: verify-mmhr
description: Verify MatchMaker HR (MMHR), the Next.js web UI at http://127.0.0.1:3100 (Pulse landing, sign-in, customer intake, masked vendor comparison, workspace). Use before claiming a change is done, after UI or auth work, or when asked to prove the app.
---

# Verify MatchMaker HR

MMHR is a Next.js App Router app. The primary surface is the Pulse web UI on port **3100**. There is no Playwright suite in application `package.json`; this skill ships a headless Chrome recipe. Do not push to `main` and do not merge as part of verification.

Keep this map current with the `maintain-verification-skill` process as the app changes.

## Isolation

Ports are fixed: app `3100`, Supabase API `57021`, Postgres `57022`, Studio `57023`, Inbucket `57024`. Two instances cannot run side by side. If doctor already passes for this run, drive that instance. If port 3100 is busy with some other process, stop and report it. Never attach to an instance this run did not start unless doctor proves it is the recorded launch tree.

## Static checks

Run from the repository root after `npm ci`. Do not print `.env.local` values.

```bash
npm ci
npm run type-check
npm run lint
npm test
npm run build
```

`npm run build` compiles; it is not a running app. CI also runs `npm run check:integration-matrix`, `npm run check:r9-evidence`, `npm run check:dependency-audit`, and `npm run check:secrets`. GitHub Actions on this account may be budget-blocked; report that status as-is.

Integration tests need the local Supabase stack and the worker wrapper:

```bash
supabase start
npx drizzle-kit migrate
npm run test:integration
```

`npx drizzle-kit migrate` reads `MIGRATION_DATABASE_URL`. That URL must be this project's loopback Postgres on port `57022`. `npm run test:integration` injects a restricted worker login; do not put a superuser URL in `DATABASE_URL`.

The four standard gates before merge remain type-check, lint, unit tests, and build. Integration is required when the change touches database, authentication, RLS, migrations, or queries.

## Launch

The documented local command is `npm run dev:local`. It reads live values from `supabase status` and starts `next dev` through `scripts/r1-with-local-worker.mjs`. It does not write `.env.local`, create accounts, or seed vendor data. Database seed is disabled in `supabase/config.toml`.

From an empty data directory on a machine with Docker:

```bash
supabase start
npx drizzle-kit migrate
node .cursor/skills/verify-mmhr/scripts/launch.mjs
```

Ready means `GET http://127.0.0.1:3100/` returns 200 and the HTML includes `Compare HR software options with vendor names hidden.` It must not include `This site is not available yet.` A listening port is not enough: the first App Router compile can take a minute after `Ready`.

Use `http://127.0.0.1:3100`, never `localhost`. Server Actions require `Origin` to equal `NEXT_PUBLIC_APP_URL`.

Do not use `npm run start` / `next start` for verification. Production `NODE_ENV` turns on the public-release holding page because `CHECKED_IN_PUBLIC_RELEASE_ID` in `src/lib/public-release.ts` is still `null`.

Do not run `supabase db reset` unless the operator asked to wipe the local catalog. Reset deletes approved vendor facts.

If Docker or the Supabase CLI is missing, full launch must fail. Only then:

```bash
node .cursor/skills/verify-mmhr/scripts/launch.mjs --stand-in
```

Stand-in starts `next dev` on `127.0.0.1:3100`. It points `NEXT_PUBLIC_SUPABASE_URL` at this project's local API origin and reuses `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the environment when set; otherwise it generates a non-secret stand-in token at runtime. It does not set `MIGRATION_DATABASE_URL`, and it skips migrations, the worker wrapper, and Auth. Authenticated journeys are unverified in that mode. Doctor will say `mode: stand-in`.

Teardown is the cleanup helper below.

## Doctor

Read-only. Run before the first drive, after any failed drive, and whenever the instance looks wrong.

```bash
node .cursor/skills/verify-mmhr/scripts/doctor.mjs
```

It checks: recorded pid alive, port 3100 owned by that process tree, `GET /` is Pulse not the holding page, `GET /sign-in` shows `Sign in`, and in full mode `supabase status` points at API port 57021. Exit 0 means the instance is worth driving.

## Drive

Install the skill-local Playwright once, then drive with system Chrome (no bundled browser download when `google-chrome` is installed):

```bash
npm install --prefix .cursor/skills/verify-mmhr playwright@1.56.1
node .cursor/skills/verify-mmhr/scripts/drive.mjs landing
```

Prefer ARIA roles, accessible names, and route paths. Real handles:

| Surface | Handle |
|---|---|
| Pulse heading | `getByRole('heading', { name: 'Compare HR software options with vendor names hidden.' })` |
| Hero email | `getByRole('textbox', { name: 'Work email' })` |
| Hero submit | `getByRole('button', { name: 'Get access' })` |
| Cookie banner | `getByRole('region', { name: 'Cookie consent' })` then `Decline` or `Accept` |
| Theme | `getByRole('button', { name: 'Switch to light theme' })` / `Switch to dark theme` |
| Public nav | `getByRole('navigation', { name: 'Primary navigation' })` → `Contact` |
| Legal | footer `Privacy`, `Terms` |
| Sign in | `/sign-in`, heading `Sign in`, labels `Work email` and `Password`, button `Sign in` |
| Sign up | `/sign-up`, heading `Create your account`, labels `Full name`, `Company`, `Work email`, `Direct company phone`, `Password`, consent checkbox, button `Sign up` |
| Customer intake | `/customer?new=1`, form `aria-label="Customer software needs intake"`, buttons `Save draft` / `Save and continue` |
| Comparison | `/customer/evaluation?intake=<uuid>`, heading `Compare your software options`, region `Software comparison` |
| Workspace | `/home` heading `Workspace`; `/workspaces` heading `Choose a workspace` |

Read `features/` before driving. The helper currently automates `landing`. Other mapped features are driven with the same Playwright recipe in that feature file. Do not call tRPC helpers, test-only RPCs, or internal setters as a substitute for the user path.

## Evidence

Store proof in `artifacts/verify-mmhr/<run-id>/` (gitignored). Cleanup must not delete it. A drive writes `<run-id>/<feature>/` screenshots, ARIA snapshots, `http-home.json`, `console.json`, and `report.md`. Launch writes `launch.log` and `ready.html` in the run directory.

Proof standards:

- Drive the real UI route. Do not POST to `/api/trpc` as a stand-in for a click.
- Capture the action and the resulting state (for landing: fill Get access, then the sign-up heading plus prefilled email).
- Verify side effects that the path claims. Landing Get access is a GET to `/sign-up`; there is no database write. Newsletter and contact POSTs hit `/api/newsletter` and `/api/leads` and need a live stack — do not treat a skipped submit as a pass.
- Mocks only at existing production boundaries (PostHog/Sentry stay inert without keys; Beehiiv/Resend are not called unless those keys exist).
- `--stand-in` skips Supabase, migrations, worker login, Auth, and every signed-in page. Record that in the report; do not call those pages verified.

## Cleanup

```bash
node .cursor/skills/verify-mmhr/scripts/cleanup.mjs
```

Kills only the recorded launch pid tree (SIGTERM, then SIGKILL). If this run started Supabase, it runs `supabase stop --no-backup`. It never `pkill node` / `killall next`. It never deletes `artifacts/verify-mmhr/<run-id>/`. After cleanup, confirm that directory still exists. Run cleanup after failed attempts too.

## Helpers

All helpers are Node ESM. Invoke from the repository root:

| Script | Invocation |
|---|---|
| Launch | `node .cursor/skills/verify-mmhr/scripts/launch.mjs` |
| Stand-in launch | `node .cursor/skills/verify-mmhr/scripts/launch.mjs --stand-in` |
| Doctor | `node .cursor/skills/verify-mmhr/scripts/doctor.mjs` |
| Drive landing | `node .cursor/skills/verify-mmhr/scripts/drive.mjs landing` |
| Cleanup | `node .cursor/skills/verify-mmhr/scripts/cleanup.mjs` |

Playwright install (skill-local, not an app dependency):

```bash
npm install --prefix .cursor/skills/verify-mmhr playwright@1.56.1
```

## Feature map

Index: [features/README.md](features/README.md)

Seeded features: landing, account access, customer intake, customer evaluation, workspace. Authenticated journeys need a real customer (or vendor/staff) session. Local Auth requires email confirmation (`enable_confirmations = true`); confirmation mail appears on Inbucket at `http://127.0.0.1:57024`. There is no seed user. If a precondition is missing, the journey fails and the reason stays in that feature's Gotchas.
