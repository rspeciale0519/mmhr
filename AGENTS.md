# MMHR Project Instructions

Global instructions remain in force. This file adds only MMHR-specific facts and rules.

<!-- brain:pointer -->
## Engineering Memory

- Before new work, read `.brain.json`, `mmhrbrain/STATE.md`, `mmhrbrain/index.md`, and the latest journal entry.
- Read an applicable file in `mmhrbrain/skills/` when the state lists one.
- State the last recorded work and its location before starting.
- After substantive work, follow the journal protocol in `mmhrbrain/CLAUDE.md`.
- Never record secrets or personal data in the brain.
- Run consolidation only after the current user task.
- Do not hand-edit `.claude/hooks/**` or `.codex/hooks/**`.
<!-- /brain:pointer -->

## Repository and Authority

- This repository contains one npm application.
- Use npm and `package-lock.json`. Do not introduce another package manager.
- The stack uses Next.js App Router, React, strict TypeScript, Tailwind CSS, Supabase, Drizzle, tRPC, TanStack Query, and Vitest.
- Read installed versions from `package.json` and `package-lock.json`.
- `develop` is the default integration branch. `main` is the production release branch.
- Use current source, tests, manifests, configuration, and CI as repository truth.
- Read `mmhrbrain/STATE.md` for current status and temporary warnings.
- Use `docs/README.md` as the project entry point.
- Treat `docs/PRD.md` as product authority and `docs/TECH_STACK.md` as architecture authority.
- Treat the other planning documents in `docs/` as legacy unless a canonical document names them.
- Verify old phase status, commands, versions, and tool names before use.

## Architecture and Code

- `src/app/` contains App Router routes for marketing, authentication, customer/vendor, admin, and API surfaces.
- `src/server/` contains database code and tRPC routers.
- `src/lib/` contains shared clients, analytics, branding, and utilities.
- `src/components/ui/` contains shadcn/ui components.
- `src/designs/` contains the retained design gallery.
- `src/trigger/` contains Trigger.dev tasks.
- `drizzle/` contains SQL migrations and generated metadata.
- `supabase/` contains local Supabase configuration.
- Use the `@/*` alias for imports from `src/`.
- Prefer Server Components. Add `"use client"` only for browser APIs, state, or client interactions.
- Use tRPC for typed application procedures.
- Use route handlers for public endpoints and webhooks.
- Keep Vitest tests near the behavior they test.
- Use camelCase in TypeScript and snake_case for database column names.
- Pulse renders at `/` and `/designs/pulse`.
- Verify both routes when shared Pulse code changes.
- Keep the design gallery unless the user requests a change.
- Never publish placeholder claims or copied evidence from `docs/temp/`.
- Do not claim authorization is complete without RLS policies and supporting tests.

## Commands and Checks

Use these commands:

- Install exactly: `npm ci`
- Development server: `npm run dev`
- Production build: `npm run build`
- Production server: `npm run start`
- Type check: `npm run type-check`
- Lint: `npm run lint`
- Unit and component tests: `npm test`
- Local integration tests: `npm run test:integration`

The expected application port is `3000`. Check it before starting a server.

CI runs `npm ci`, type checking, lint, unit tests, and the production build.

For code or configuration changes, run the smallest relevant check first.

Then run type checking, lint, tests, and builds that cover the changed behavior.

Run all four standard gates before a merge or production release.

For documentation-only changes, validate the changed text, links, paths, and commands.

Do not run application gates when documentation cannot affect application behavior.

Run `npm run test:integration` for database, authentication, RLS, migration, or query changes.

For rendered changes, use the global browser workflow and check relevant states.

Check both Pulse themes when shared Pulse UI changes.

## Database and Authentication

- Use `supabase start` and `supabase status` for the local stack.
- Define Drizzle schemas in `src/server/db/schema/`.
- Generate migrations with `npx drizzle-kit generate`.
- Review every generated SQL migration before applying it.
- Add required RLS statements and `auth.users` foreign keys when Drizzle cannot generate them.
- Apply local migrations with `npx drizzle-kit migrate`.
- Include a forward path, recovery path, and local integration evidence for each migration.
- Do not apply cloud or production migrations without explicit approval.
- The direct server PostgreSQL pool bypasses RLS.
- Use request-scoped Supabase clients for user-authorized data access.
- Use `supabase.auth.getClaims()` for verified server identity.
- Do not use `getSession()` to authorize a request.
- Never weaken RLS, audit requirements, consent records, or ranking-integrity tests.

## Environment and Generated Files

- Do not read or print `.env.local` values.
- Use `.env.example` as the variable-name inventory.
- Update `.env.example` when application code changes a variable.
- Only non-secret values can use the `NEXT_PUBLIC_` prefix.
- Store staging and production values in Vercel environment settings.
- Do not hand-edit `node_modules/`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `drizzle/meta/`, `.vercel/`, `.trigger/`, or Supabase local state.
- `.vercelignore` controls Vercel CLI uploads. `.gitignore` does not replace it.

## Git and Deployment

- Create feature branches from `develop`.
- Target normal feature and fix pull requests at `develop`.
- Use `main` only for an approved production release.
- A change to `main` can trigger a Vercel production deployment.
- Treat `npx vercel --prod` as an external production action.
