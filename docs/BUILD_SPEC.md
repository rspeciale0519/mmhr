> **Legacy v1 build contract:** [PRD.md](./PRD.md) and [TECH_STACK.md](./TECH_STACK.md) superseded this file on 2026-08-24. Preserve its evidence as history only.

# MatchMaker HR — Build Spec (goal-run contract)

> Machine-checkable contract for autonomous `/goal` runs. Scope and architecture live in
> the historical `docs/development-plan.md`; this file translated each legacy phase's
> exit criteria into transcript checks. It is no longer an active goal contract.
> `docs/ROADMAP.md` preserves the matching historical checklist.

## How this is used
One `/goal` per phase (commands in the autopilot handoff). A phase goal is satisfied when
EITHER (a) every EXIT CRITERIA check below for that phase has been run in-session with
passing output shown, OR (b) an OWNER GATE or owner-level blocker has been clearly
surfaced to the owner and logged in `docs/temp/BLOCKERS.md`. After the owner resolves a
gate, re-issue the same phase goal to continue.
**Recommended flow:** clear G1 interactively (ratify D1–D14 with fresh pricing
verification + decide GitHub repo name/visibility) BEFORE the first goal issuance, so the
Phase 0 goal runs uninterrupted from scaffold to the G3 design-approval stop.

## Current state (do not rediscover, do not redo)
- **Git is fully set up** (2026-07-12): repo initialized, `main` + `develop` both pushed to
  `git@github.com:rspeciale0519/mmhr.git` (private; `develop` is the default branch).
  Initial commit holds the planning docs + `.env.example` + `.gitignore`.
- **All third-party accounts are provisioned and `.env.local` is fully populated**
  (never commit it; `.gitignore` covers it): local Supabase (active) + cloud Supabase
  (commented out — copy to Vercel env vars for staging, never uncomment locally),
  Payload, the configured AI service, Firecrawl, Trigger.dev (project ref `proj_mmmffglqprpzbymxcwqe`,
  DEV secret key), Resend (sender domain `directmailmarketinghq.net` — verify it's a
  verified domain in Resend before relying on sends), Beehiiv (key + publication id),
  Cal.com (`miodiollc/30min`), PostHog (`phc_` project token verified correct),
  Sentry (org `miodio-llc`, project `mmhr`, DSN + auth token), generated
  PAYLOAD_SECRET/CRON_SECRET. **Do not run any service signup flows.**
- **Sentry and Trigger.dev wizard/init steps were intentionally deferred** — they
  require a package.json; run their init/instrumentation as part of the scaffold
  (`npx trigger.dev init -p proj_mmmffglqprpzbymxcwqe`; Sentry via manual Next.js
  instrumentation or wizard), consuming the existing `.env.local` values.
- No design assets exist or should be sought — design is created fresh (development-plan §4.2).
- Stack decisions D1–D7 + D14: **ratified 2026-07-12** (development-plan §3). D8–D13 open, due at their listed phases.

## OWNER GATES (work pauses; only the owner clears them)
G1. ~~Ratification of D1–D14~~ **CLEARED 2026-07-12**: stack + service matrix ratified
    (after live pricing verification); GitHub repo decided and already created by the
    owner — `git@github.com:rspeciale0519/mmhr.git` (private, name `mmhr`).
G2. Approval of each phase's detailed implementation plan (`.claude/plans/feature-<slug>.md`).
G3. Approval of the Phase 0 design direction (rendered explorations, before codification).
G4. PR merge decision at each phase's end (`/git-workflow-planning:finish` asks first).
G5. Marketing copy / brand-name freeze (D8) before Phase 1 goes public.
G6. Production cutover in Phase 7.
Hitting a gate: announce it plainly, log it in `docs/temp/BLOCKERS.md`, stop new work.

## HARD CONSTRAINTS (hold at every checkpoint)
- TDD: failing test → minimal code → pass → commit. No test is weakened, skipped, or
  gamed to satisfy a check. An honest documented failure beats a fake pass.
- Git: work on the phase's `feature/*` branch off `develop` via
  `/git-workflow-planning:start`; checkpoint via `:checkpoint` (after updating ROADMAP.md);
  never merge to `main`; never push/merge without G4.
- `npm run type-check`, `npm run lint`, and the full test suite exit 0 at every checkpoint.
- From Phase 2 on: the RLS test matrix (table × role) passes at every checkpoint.
- All UI through the frontend-design + shadcn skill workflow; no unthemed defaults.
- Files ≤ ~450 LOC; a11y (axe) checked per screen as built.
- Local Supabase only until launch; no paid tiers provisioned without owner sign-off.
- Every phase begins by authoring its implementation plan and passing G2 — no feature
  code before the plan is approved.

## PHASES — exit criteria as runnable checks

### Phase 0 — Foundations & design system
0.1 ~~Pre-flight~~ **DONE 2026-07-12** (git init, remote, both branches pushed, accounts
    provisioned, `.env.local` populated — see Current state). Verification only:
    `git branch -a` + `git remote -v` output shown once at phase start.
0.2 Design explorations rendered and G3 approval given in-conversation.
0.3 Approved direction codified: sample page built from theme tokens + component library,
    screenshot shown via chrome-devtools against local dev server.
0.4 Local Supabase up (`supabase status` shown); first migration applied (`drizzle` migrate
    output); auth round-trip e2e test passes (sign-up → session → sign-out).
0.5 `npm run build` succeeds; type-check/lint/test exit 0 (outputs shown).
0.6 CI config committed; staging deploy URL shown (Vercel preview acceptable).
0.7 ROADMAP Phase 0 items checked; phase PR opened (G4 to merge).

### Phase 1 — Marketing site + lead gate
1.1 Every FR-M1 route returns 200 (scripted check, list + statuses shown).
1.2 Lead gate e2e: free-domain email rejected inline; work email + all mandatory fields +
    consent accepted → `SELECT count(*) FROM leads` increments (before/after shown).
1.3 Landscape Report download blocked before gate, served after (e2e).
1.4 Newsletter capture hits provider API in test mode (logged request shown).
1.5 CMS: blog post + case study created in Payload admin render on their public pages (e2e).
1.6 Lighthouse on `/`: LCP < 2.5s (report figure shown); axe scan: 0 critical violations.
1.7 `sitemap.xml` + OG/canonical tags present (curl output); cookie banner gates PostHog
    (no PH network calls before consent — network log shown).
1.8 Suite green; ROADMAP checked; PR opened.

### Phase 2 — App core
2.1 Sign-up → org created with admin membership (SQL shown).
2.2 Onboarding commission-disclosure step records acknowledgment timestamp (SQL).
2.3 Wizard e2e: complete → resume mid-way → edit answers → match scores recompute.
2.4 ≥15 vendors seeded (`SELECT count(*) FROM vendors` shown) with pricing + pros/cons +
    capability scores.
2.5 Marketplace e2e: filter/sort; profile shows match %, pricing confidence tier, "last
    verified"; shortlist add/remove persists org-wide; demo request row created (SQL).
2.6 Scoring engine unit tests pass incl. the ranking-integrity test (organic order is a
    pure function of config + data) and the featured/de-dupe rules.
2.7 RLS matrix suite passes (full run output shown). Admin-lite vendor CRUD + leads list
    work (e2e). Suite green; ROADMAP checked; PR opened.

### Phase 3 — Evaluation suite
3.1 Feature library seeded (`SELECT count(*) FROM features` ≥ 200 shown).
3.2 Requirements tagging e2e: must/nice/no tags change the org's match scores (values
    before/after shown); export produces a file.
3.3 Scorecards e2e: weighted criteria + question bank; two users score the same vendor;
    aggregate + individual views correct; live mode updates a second session via Realtime.
3.4 Project plan e2e: go-live date generates milestones/tasks; check-off/assign/re-date.
3.5 Team e2e: invite → accept → role enforced (contributor can score, viewer read-only —
    both proven); activity feed records the actions.
3.6 RLS matrix + full suite green; ROADMAP checked; PR opened.

### Phase 4 — Advisor layer + reports
4.1 Advisor assignment; chat e2e: message round-trip between buyer and advisor sessions
    via Realtime; unread state clears.
4.2 Cal.com embed renders on the advisor page (screenshot).
4.3 Proposal review e2e: upload → object in private Supabase Storage bucket (listing
    shown); signed-URL access works for advisor, denied cross-org.
4.4 PDF export: comparison/shortlist PDF generated, non-zero size, opens (file evidence).
4.5 Resend test-mode sends for invite/chat-notification/demo-confirmation (logs shown).
4.6 Advisor console v1 lists assigned clients, threads, review queue (e2e).
4.7 RLS matrix + full suite green; ROADMAP checked; PR opened.

### Phase 5 — Research pipeline (parallel: may run alongside 3–4 once vendor schema stable)
5.1 Source registry + schedules CRUD via API (tests); D12 registry entries loaded for
    pilot vendors.
5.2 End-to-end pipeline run against ≥1 real vendor-owned source: `ingestion_runs` success
    row, versioned snapshot, diff computed vs seeded profile, significant change queued
    (SQL evidence at each step).
5.3 Approval publishes: marketplace profile shows updated data + new "last verified"
    (before/after shown); traceability chain snapshot→run→source queryable (SQL).
5.4 Extraction validated by golden-set fixtures (tests); anomaly rules trip on a crafted
    outlier (test).
5.5 Cost telemetry recorded per run (SQL); scheduler fires a cadence-configured run
    (Trigger.dev run log). Scoring-config version preview endpoint tested.
5.6 Firecrawl managed-vs-self-hosted checkpoint written to docs/temp/ with real per-run
    cost data (owner decides — G-level note, not a blocker).
5.7 Full suite green; ROADMAP checked; PR opened.

### Phase 6 — SuperAdmin console
6.1 Each FR-S1..S10 module has a passing e2e or integration test; run outputs shown
    (pipeline control, vendor CRUD w/ override+audit, scoring config w/ ranking preview,
    user/org mgmt, advisor ops, deals from demo→closed-won w/ commission, leads
    filter/export, content + featured-placement settings, system health, audit viewer).
6.2 Impersonation e2e: scoped + time-boxed session; every action lands in `audit_log`
    (SQL shown); non-superadmin denied.
6.3 RLS matrix + full suite green; ROADMAP checked; PR opened.

### Phase 7 — Hardening & launch
7.1 Lighthouse on all marketing routes: LCP < 2.5s each (figures shown).
7.2 Full axe audit app-wide: 0 critical/serious (report shown).
7.3 `/security-review` run; findings fixed or accepted in writing; RLS matrix re-run green.
7.4 GDPR/CCPA deletion flow e2e: request → lead + org data removed (SQL before/after).
7.5 Sentry + uptime checks wired (test event shown); backup/restore drill documented.
7.6 ≥50 vendors published & verified (`SELECT count(*) FROM vendors WHERE published` shown);
    methodology page live; disclosure surfaces verified (e2e).
7.7 Launch checklist doc completed → G6 (production cutover) surfaced to owner.

## DATA TRACK (separate goal, runnable any time after Phase 2 schema exists)
DT.1 ≥50 vendor profiles in DB, each with pricing range, ≥3 pros/cons, module capability
     scores (SQL counts + spot-check queries shown).
DT.2 ~200-item feature library (SQL count ≥200); criteria library + question bank seeded.
DT.3 Source registry URLs per vendor (SQL count shown; vendor-owned/licensed only).
All entries via admin-lite/seed scripts; sources cited in `docs/temp/vendor-research/`.

## DEFINITION OF DONE
All Phase 0–7 exit criteria evidenced in order; all HARD CONSTRAINTS held throughout;
all OWNER GATES cleared by the owner; DT complete; production cutover executed at G6.
