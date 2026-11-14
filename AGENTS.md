# MMHR Project Instructions

Global instructions remain in force. This file adds only MMHR-specific facts and rules.

<!-- brain:pointer -->
## Engineering Memory

- At session start, read `mmhrbrain/STATE.md` once. Use its injected copy when already available.
- Read the linked journal entry only when the task needs previous implementation or approval details.
- Use `mmhrbrain/index.md` to find task-relevant knowledge or skills. Do not load the full history by default.
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
- Use `docs/LAUNCH.md` for launch scope, task order, and the work rule. It overrides older plans, roadmaps, and checklists on those points.
- Use `docs/README.md` when project orientation is needed.
- Treat `docs/PRD.md` as product authority and `docs/TECH_STACK.md` as architecture authority.
- Read their relevant sections when the task changes product behavior or architecture.
- Memory records evidence and open work. It does not override canonical requirements or grant permission.
- Treat the other planning documents in `docs/` as legacy unless a canonical document names them.
- Verify old phase status, commands, versions, and tool names before use.

## Task Scope and Completion

- For reviews, inspect and report. Edit only when the user requests changes.
- For approved changes, continue through implementation, relevant checks, and correction of defects caused by the change.
- Run safe local checks without repeated approval. Confirm the target and effects before running checks that write data.
- Local catalog approvals, publication, access changes, and external actions retain their existing authorization requirements.
- Completion requires the requested result, applicable validation, and a final diff review. Report unresolved checks and required decisions.
- A prior task's open work is context. Resume it only when the current request authorizes it.

## Skill Selection

- For Python skill validation, use `& 'C:\Users\rob\.codex\venvs\skill-validation\Scripts\python.exe' -X utf8 <validator.py> <skill-directory>`.
- Follow explicitly requested skills and mandatory tool prerequisites.
- Otherwise, select the narrowest relevant skill from the current inventory. Load supporting files only as needed.
- Use the global browser tool order. Do not load several browser skills for the same operation without a specific need.
- Skill defaults do not authorize Git actions or override project safeguards.
- In particular, `fullpush` must not stage unrelated work or promote to `main` without explicit authorization for those actions.

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

The expected application port is `3100`. Windows port-proxy rules on the owner machine hold ports 3000 to 3005.
Start the application with `npm run dev:local`. Check the port before starting a server.

CI runs `npm ci`, type checking, lint, unit tests, and the production build.

For code or configuration changes, run the smallest relevant check first.

Then run type checking, lint, tests, and builds that cover the changed behavior.

Repeat checks after relevant changes or failures. Do not repeat passed checks without a new reason.

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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Shared project board

Claude Code and Codex use one shared board to track their own work and each other's work.
Both agents follow these rules, also when both agents run at the same time.

### Location and identity

- The board is in `C:\Users\rob\Documents\Software\service-businesses\mmhr\.project-board\`.
- Use this absolute path from every checkout and Git worktree. Git ignores the folder, so a worktree has no copy.
- Claude Code is `claude`. Codex is `codex`. Use only your own name.
- Board work changes only files in `.project-board/`. It never changes code, docs, or Git state.
- The board does not replace the `mmhrbrain` journal protocol. It does not grant permission for any action.

### Files

- `plan.json`: milestones, parts, tasks, and the board style. Each task is one line with `id`, `title`, `part`, `milestone`, `status`, `owner`, and `blockedOn`.
- Status values are `not started`, `in progress`, `done`, and `stuck`. Owner values are `claude`, `codex`, and `unassigned`.
- `agents/claude.json` and `agents/codex.json`: the live status of each agent. Write only your own file.
- Status file fields: `agent`, `heartbeat`, `currentTask`, `doingNow`, `touching`, `lastFinishedStep`, `blockers`, `questions` (`id`, `question`, `default`, `mustWait`), `handoffs` (`to`, `note`, `since`), and `deliverables` (`kind`, `label`, `ref`).
- `log.md`: append-only history. Never change or remove an earlier line.
- `index.html`: the board page. `board.mjs`: the helper that adds log lines and rebuilds the page.

### Commands

Use the absolute board path in these commands:

- `node <board>/board.mjs now` prints the current time. Use it for every `heartbeat` and `since` value. Never guess the time.
- `node <board>/board.mjs log <claude|codex> "<one line>"` adds a dated log line and rebuilds the page.
- `node <board>/board.mjs build` checks the data and rebuilds the page. Run it after each JSON change.
- If `build` fails, correct your own change immediately.

### Before each task

1. Read `plan.json`, the other agent's status file, and the last 20 lines of `log.md`.
2. Read the `handoffs` in the other agent's file. Do or answer each handoff addressed to you first.
3. Choose a task with owner `unassigned` and an empty `blockedOn`. Prefer the suggested next step on the board.
4. Do not take a task that the other agent owns, unless its status is `done`.
5. Exception: you can take it when the other agent's heartbeat is more than 2 hours old AND the owner tells you to take it.
6. Claim the task: set `owner` to your name and `status` to `in progress` in `plan.json`.
7. Update your status file, run `build`, and add a log line.

### Safe edits to plan.json

- Read `plan.json` again immediately before each change.
- Change only the lines of tasks that you own or claim. Keep each task on one line.
- Make one small change and write it immediately. Do not keep an old copy during long work.
- Do not reformat the file.
- Do not change the other agent's task lines, the milestones, the parts, or the style unless the owner asks.
- To add a task, append one line with the next free `id`. Set the owner to `unassigned`, or to your name if you start it now.

### Files and areas that you touch

- Before you edit a file, folder, or area, add it to `touching`.
- If the other agent's `touching` already includes the same file or folder, do not edit it. Add a question for the owner and choose other work.
- Clear `touching` when you finish or stop.

### Status updates

Update your status file, set `heartbeat`, run `build`, and add one log line at these times:

- at the start of each task;
- after each meaningful step, for example a passed check, a finished sub-part, a commit, or a pull request;
- when you finish, get stuck, or stop.

When you finish a task, set its status to `done` and keep your name as owner.
Add the result to `deliverables`. Put the newest item first and keep 10 items.
When you are stuck, set the task status to `stuck`. Write the reason in `blockedOn` and in `blockers`.

### Questions for the owner

- Add each question to your `questions` with a `default`. Continue with the default.
- Stop and wait when the decision involves deleting anything, spending money, or changing production or live accounts. Set `mustWait` to `true`.
- Project rules that need explicit approval, for example Git writes and cloud migrations, still need it. Use a default that does not do the action.
- After the owner answers, remove the question and log the answer.

### Handoffs between agents

- To ask the other agent for something, add `{ "to": "<agent>", "note": "...", "since": "<time>" }` to `handoffs` in your own file.
- The other agent checks for handoffs before each new task. It answers in its own status file or in the log.
- The sender removes the handoff when the request is complete.

### "Where are we?"

When the owner asks "where are we?", read the board files. Answer for both agents.
Give the next milestone and tasks left, what each agent does now, and the age of each heartbeat.
Also give conflicts, waiting questions, and the suggested next step.

## Working with Claude Opus 5.5

### 1. Effort: medium by default
- Run every session at **medium** effort unless the task says otherwise.
- Use high, xhigh or max only for jobs where we've seen it make a real difference (for example tricky debugging or a big refactor). Note why in the task or PR.
- Don't raise effort just to be safe. It costs more and runs slower.

### 2. No "think carefully" lines
- Don't add "think carefully", "think step by step", "take a deep breath" or similar lines to prompts, skills or these files. Opus 5.5 always thinks, so those lines only slow replies.
- If you find one, remove it as part of normal cleanup.

### 3. Long unattended runs: checklist + 3 auto-continues max
- Before a long run, write the plan as a checklist in `TASKS.md` (or the task's own checklist file), with one line per step and a clear pass/fail check (tests pass, build succeeds, page loads).
- Before stopping, read the checklist. If items are still open, keep going.
- Auto-continue **at most 3 times**. After the 3rd, stop and report: what's done, what's left, and what's blocking.
- Never mark an item done unless its check actually passed.

### 4. Refusals aren't crashes
- If a run stops with a refusal, read the refusal category before treating it as a crash or retrying. Security-review prompts can trip the cybersecurity safeguard; reword the task's purpose instead of looping.

### 5. UI work: specific design bans
- For UI work, give specific design bans (for example no gradients, no emoji icons, no centered walls of text) instead of "make it look good".
