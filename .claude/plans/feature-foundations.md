# Phase 0 — Foundations & Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed Next.js 16 shell with working auth round-trip, first database migration, tRPC wiring, CI, consent-gated analytics, and an owner-approved fresh design system — every BUILD_SPEC Phase 0 exit criterion evidenced.

**Architecture:** Single Next.js App Router codebase with route groups `(marketing)/(auth)/(app)/(admin)`; local Supabase (Postgres+Auth+Realtime) via `@supabase/ssr`; Drizzle for schema/migrations; tRPC v11 + TanStack Query for the app API; Tailwind v4 + shadcn/ui themed after owner-approved design exploration.

**Tech Stack:** Next.js 16 (TS), Tailwind v4, shadcn/ui, Supabase (local), Drizzle ORM, tRPC v11, TanStack Query v5, Vitest 3, PostHog, Sentry, Trigger.dev v4, Vercel.

## Global Constraints

- TDD: failing test → minimal code → pass → commit. Never weaken a test to pass.
- `npm run type-check`, `npm run lint`, full `npm test` exit 0 at every checkpoint.
- Branch `feature/foundations` off `develop` via `/git-workflow-planning:start feature foundations`; never merge to `main`; PR via `/git-workflow-planning:finish` at the end (G4).
- Files ≤ ~450 LOC. No unthemed default UI ships (theming lands in Task 10 after G3).
- `.env.local` already fully populated — never commit it; never run service signups.
- Git workflow prose: checkpoint via `/git-workflow-planning:checkpoint 0 <desc>` after Tasks 4, 8, 11 (update `docs/ROADMAP.md` first each time).
- OWNER GATES in this plan: **G2** = owner approves this plan before Task 1. **G3** = owner approves design direction after Task 9, before Task 10.

---

### Task 1: Next.js scaffold + test tooling

**Files:**
- Create: entire Next.js app at repo root (via generator, then merge), `vitest.config.ts`, `src/test/setup.ts`
- Modify: `package.json` (scripts), `.gitignore` (merge generator entries)

**Interfaces:**
- Produces: `npm run dev|build|lint|type-check|test` all runnable; `@/*` path alias.

- [ ] **Step 1: Scaffold into a temp dir (repo root is non-empty) and merge**

```powershell
cd C:\Users\rob\Documents\Software\service-businesses\mmhr
npx create-next-app@latest .scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes
# Merge generator output into repo root (PowerShell):
Get-ChildItem .scaffold -Force | Where-Object Name -notin '.git','.gitignore','README.md','node_modules' | Move-Item -Destination .
# Append any generator .gitignore lines we lack (manual diff), then:
Remove-Item .scaffold -Recurse -Force
npm install
```
Expected: `package.json`, `src/app/…`, `next.config.ts`, `tsconfig.json` at root; `npm run dev` serves the default page on :3000.

- [ ] **Step 2: Add scripts + test deps**

```powershell
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @types/node
```
In `package.json` scripts add: `"type-check": "tsc --noEmit"`, `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/*.integration.test.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```
`src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```
Add `"test:integration": "vitest run --config vitest.integration.config.ts"` with `vitest.integration.config.ts` (environment `node`, include `src/**/*.integration.test.ts`, no jsdom).

- [ ] **Step 4: Smoke test the toolchain**

`src/lib/smoke.test.ts`:
```ts
import { expect, test } from "vitest";
test("toolchain runs", () => { expect(1 + 1).toBe(2); });
```
Run: `npm run type-check && npm run lint && npm test` → all exit 0.

- [ ] **Step 5: Commit** — `chore: scaffold Next.js 16 app with Vitest toolchain`

---

### Task 2: Brand config + route-group skeletons (TDD)

**Files:**
- Create: `src/lib/brand.ts`, `src/lib/brand.test.ts`, `src/app/(marketing)/page.tsx` (move default home), `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(app)/home/page.tsx`, `src/app/(admin)/admin/page.tsx`

**Interfaces:**
- Produces: `brand.name: string` (from `NEXT_PUBLIC_BRAND_NAME`, fallback "MatchMaker HR"); all four route groups render.

- [ ] **Step 1: Failing test** — `src/lib/brand.test.ts`:
```ts
import { expect, test } from "vitest";
import { brand } from "@/lib/brand";
test("brand name comes from env with fallback", () => {
  expect(brand.name.length).toBeGreaterThan(0);
});
```
Run `npm test` → FAIL (module not found).

- [ ] **Step 2: Implement** — `src/lib/brand.ts`:
```ts
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "MatchMaker HR",
} as const;
```
Run `npm test` → PASS.

- [ ] **Step 3: Route groups** — plain placeholder pages (unstyled `<main><h1>` only; theming comes in Task 10). Verify `npm run build` succeeds and `/`, `/sign-in`, `/sign-up`, `/home`, `/admin` return 200 under `npm run dev` (curl each).

- [ ] **Step 4: Commit** — `feat: brand config + route-group skeletons`

---

### Task 3: shadcn/ui init (unthemed base)

- [ ] **Step 1:** Consult the `shadcn-cli-v4` skill, then `npx shadcn@latest init` (defaults; CSS variables on) and add primitives: `npx shadcn@latest add button card input label`.
- [ ] **Step 2:** `npm run type-check && npm run lint && npm test` → exit 0. Commit — `chore: shadcn/ui base (theme tokens land post-G3)`.

---

### Task 4: Local Supabase + Drizzle schema + first migration

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `src/server/db/schema/identity.ts`, `src/server/db/schema/leads.ts`, `src/server/db/index.ts`, `drizzle.config.ts`, `drizzle/0000_*.sql` (generated + hand-edited RLS), `src/server/db/db.integration.test.ts`

**Interfaces:**
- Produces: tables `orgs`, `org_members`, `invitations`, `leads`, `audit_log` (RLS ENABLED, default-deny; policies arrive Phase 2); `db` Drizzle client on `DATABASE_URL`.

- [ ] **Step 1:** `supabase init` then `supabase start`. In `supabase/config.toml` set `[auth.email] enable_confirmations = false` (local only). Show `supabase status` output; verify URL/keys match `.env.local` (correct them if the CLI prints different ones).
- [ ] **Step 2:** `npm i drizzle-orm postgres && npm i -D drizzle-kit`. Write schema:

`src/server/db/schema/identity.ts`:
```ts
import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";

export const orgRole = pgEnum("org_role", ["admin", "contributor", "viewer"]);

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // references auth.users(id) — FK added in SQL
  role: orgRole("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("org_members_org_user_uq").on(t.orgId, t.userId)]);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: orgRole("role").notNull().default("contributor"),
  token: uuid("token").notNull().defaultRandom(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`src/server/db/schema/leads.ts`:
```ts
import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  company: text("company").notNull(),
  workEmail: text("work_email").notNull(),
  phone: text("phone").notNull(),
  source: text("source"),
  status: text("status").notNull().default("new"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`drizzle.config.ts` (dialect postgresql, schema glob, out `./drizzle`, url from `DATABASE_URL`). `src/server/db/index.ts` exports `db = drizzle(postgres(process.env.DATABASE_URL!))` + schema re-exports.

- [ ] **Step 3:** `npx drizzle-kit generate` → append to the generated migration SQL: `ALTER TABLE <each table> ENABLE ROW LEVEL SECURITY;` plus FK `org_members.user_id → auth.users(id) ON DELETE CASCADE`. Apply with `npx drizzle-kit migrate`. Evidence: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';` shows `t` for all five.
- [ ] **Step 4: Failing integration test** — `src/server/db/db.integration.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { db, leads } from "@/server/db";

describe("db", () => {
  test("service role can insert and read a lead (RLS enabled, bypassed by service connection)", async () => {
    const [row] = await db.insert(leads).values({
      fullName: "Test Lead", company: "Acme", workEmail: "t@acme.com",
      phone: "555-0100", consentAt: new Date(),
    }).returning();
    expect(row.id).toBeTruthy();
    await db.delete(leads); // cleanup
  });
});
```
Run `npm run test:integration` → PASS (fails first if migration missing).
- [ ] **Step 5:** Update ROADMAP (local Supabase + migration items) → `/git-workflow-planning:checkpoint 0 supabase-drizzle-first-migration`

---

### Task 5: Supabase Auth wiring + round-trip test (BUILD_SPEC 0.4)

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/middleware.ts`, `src/app/(auth)/sign-in/page.tsx` + `actions.ts`, `src/app/(auth)/sign-up/page.tsx` + `actions.ts`, `src/server/auth/auth.integration.test.ts`

**Interfaces:**
- Produces: `createBrowserSupabase()`, `createServerSupabase()` (cookie-based, `@supabase/ssr`); server actions `signUp(formData)`, `signIn(formData)`, `signOut()`.

- [ ] **Step 1:** `npm i @supabase/supabase-js @supabase/ssr`. Failing integration test:
```ts
import { describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe("auth round-trip (local)", () => {
  test("sign-up → session → sign-out", async () => {
    const supabase = createClient(url, anon);
    const email = `t${Date.now()}@example.com`;
    const { data, error } = await supabase.auth.signUp({ email, password: "test-pass-123!" });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
    const { data: s } = await supabase.auth.getSession();
    expect(s.session).not.toBeNull();
    const { error: outErr } = await supabase.auth.signOut();
    expect(outErr).toBeNull();
  });
});
```
Run → FAIL until config/env load wired (vitest integration config loads `.env.local` via `dotenv` or Next's env loader) → make it PASS.
- [ ] **Step 2:** Implement ssr helpers per `supabase:supabase` skill patterns (browser client, server client with cookie adapters, middleware session refresh). Minimal unstyled forms + server actions calling the helpers; sign-up creates the auth user only (org bootstrap is Phase 2).
- [ ] **Step 3:** Browser round-trip via chrome-devtools MCP: sign-up → redirected signed-in state → sign-out (screenshot each). `npm run type-check && npm run lint && npm test && npm run test:integration` → exit 0.
- [ ] **Step 4: Commit** — `feat: supabase auth (ssr clients, middleware, actions) + round-trip tests`

---

### Task 6: tRPC v11 + TanStack Query wiring (TDD)

**Files:**
- Create: `src/server/trpc/trpc.ts` (initTRPC + context w/ supabase user), `src/server/trpc/routers/health.ts`, `src/server/trpc/root.ts`, `src/app/api/trpc/[trpc]/route.ts`, `src/lib/trpc/provider.tsx`, `src/server/trpc/health.test.ts`

- [ ] **Step 1:** `npm i @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query zod superjson`. Failing test:
```ts
import { expect, test } from "vitest";
import { appRouter } from "@/server/trpc/root";
test("health.ping returns ok", async () => {
  const caller = appRouter.createCaller({ user: null });
  await expect(caller.health.ping()).resolves.toEqual({ ok: true });
});
```
- [ ] **Step 2:** Implement minimal router (`health.ping` public procedure returning `{ ok: true }`), fetch adapter route handler, `<TRPCProvider>` in root layout. Test PASS; build green.
- [ ] **Step 3: Commit** — `feat: tRPC v11 + TanStack Query wiring with health router`

---

### Task 7: Consent-gated PostHog + Sentry + Trigger.dev init

**Files:**
- Create: `src/lib/analytics/posthog.ts`, `src/lib/analytics/consent.ts`, `src/lib/analytics/consent.test.ts`, Sentry instrumentation files (`sentry.*.config.ts` / `instrumentation.ts`), `trigger.config.ts` + `src/trigger/example.ts`

- [ ] **Step 1 (TDD consent gate):** failing test asserting `initAnalytics()` does NOT call `posthog.init` when consent cookie absent, DOES when present (mock `posthog-js`). Implement `consent.ts` (`hasAnalyticsConsent()`, `grantAnalyticsConsent()` cookie helpers) + `posthog.ts`. PASS.
- [ ] **Step 2:** `npx @sentry/wizard@latest -i nextjs` (or manual `@sentry/nextjs` config if wizard misbehaves) consuming existing DSN env; guard: no-op when DSN unset.
- [ ] **Step 3:** `npx trigger.dev@latest init -p proj_mmmffglqprpzbymxcwqe` → commit generated `trigger.config.ts` + example task (don't run `trigger dev` yet — Phase 5 concern).
- [ ] **Step 4:** Full local gates exit 0. Commit — `feat: consent-gated PostHog, Sentry instrumentation, trigger.dev init`

---

### Task 8: CI workflow (BUILD_SPEC 0.6a)

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1:**
```yaml
name: CI
on:
  pull_request:
  push: { branches: [develop, main] }
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm test
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder
          NEXT_PUBLIC_BRAND_NAME: "MatchMaker HR"
```
(Integration tests run locally pre-checkpoint, not in CI — documented in the workflow header comment; Supabase-in-CI arrives Phase 2 with the RLS matrix.)
- [ ] **Step 2:** Update ROADMAP → `/git-workflow-planning:checkpoint 0 ci-pipeline`; push branch so CI runs; show green run via `gh run list`/`gh run watch`.

---

### Task 9: Design explorations → **G3 OWNER GATE**

- [ ] **Step 1:** Invoke `frontend-design:frontend-design` skill. Produce **4 distinct visual directions** as self-contained rendered pages under `src/app/(marketing)/design-explorations/[1-4]/page.tsx` (typography, palette, spatial system, one hero + one card composition each; real brand copy from PRD homepage sections). No direction reuses the old "Bold Sage" reference.
- [ ] **Step 2:** Screenshot each via chrome-devtools MCP; present all four to the owner with one-line rationales (bg/accent/typeface).
- [ ] **Step 3:** **STOP — announce G3, log in `docs/temp/BLOCKERS.md`, await owner pick.** (Goal exits here; owner re-issues goal after choosing.)

### Task 10 (post-G3): Codify approved direction (BUILD_SPEC 0.3)

- [ ] Convert the chosen direction into Tailwind v4 theme tokens (CSS variables) + themed shadcn components (button, card, input, nav); delete losing explorations; build a sample page (`/design-sample`) composed ONLY from the new component system; screenshot as 0.3 evidence; all gates exit 0; commit; update ROADMAP → checkpoint.

### Task 11: Vercel staging deploy (BUILD_SPEC 0.6b)

- [ ] `vercel link` to a new `mmhr` project (already logged in as rspeciale0519); `vercel env add` the staging vars (cloud Supabase URL/anon/service-role from the commented block, brand, PostHog, Sentry DSN); `vercel deploy` → show preview URL loading the shell with auth round-trip against cloud Supabase (cloud project needs no migration yet for the shell; auth pages function). Update ROADMAP → `/git-workflow-planning:checkpoint 0 staging-deploy`.

### Task 12: Exit verification + PR (BUILD_SPEC 0.5/0.7 → G4)

- [ ] Re-run every exit criterion end-to-end and show output: 0.1 git state; 0.2/0.3 approved-direction sample page screenshot; 0.4 auth round-trip (integration + browser); 0.5 `npm run build` + gates exit 0; 0.6 CI green + staging URL; ROADMAP Phase 0 all checked.
- [ ] `/git-workflow-planning:finish` → PR into `develop` → **announce G4 (owner merges)**.

## Self-Review (done at authoring)

Spec coverage: 0.1 verified Task 0/12; 0.2 Task 9; 0.3 Task 10; 0.4 Task 5; 0.5 Tasks 1–12 gates; 0.6 Tasks 8+11; 0.7 Task 12. Dev-plan Phase 0 scope items all mapped (scaffold T1, design T9/T10, Supabase+Drizzle T4, auth T5, tRPC+skeletons T2/T6, CI T8, staging T11, PostHog T7, brand T2, accounts pre-done). Type consistency: `db`/`leads` exports used in tests match schema files; `brand.name` consistent. No placeholders beyond deliberate generator-owned steps (shadcn init, sentry wizard, trigger init) where the command IS the content.
