# MMHR MVP P0 Baseline and Launch Inventory

| Field | Value |
|---|---|
| Date | October 7, 2026 |
| Plan | [MVP complete UI/UX and backend roadmap, version 1.1](build-mvp-complete-ui-ux-roadmap-2026-10-06.md) |
| Phase | P0, work package UX-01 |
| Status | **Complete: the owner approved all nine decisions on October 7** |
| Branch | `codex/full-delivery-verification` at `a31b10c`, with uncommitted work |
| Approval owner | Product owner |

## 1. Result

The P0 work that does not depend on owner decisions is complete.
This record gives the starting condition, the launch surface, the workflow work list, the isolation approach, the shared interface rules, and the account recovery design.
P0 exited on October 7 when the owner approved all nine decisions in Section 2.
The integration suite finished on October 7 at 07:19 EDT; Section 3.5 classifies its failures.

Main findings:

- Candidate A depends on about 254 uncommitted application and server files. No copy exists in Git or on GitHub.
- The CI dependency audit fails on one critical and two high findings. All three come from build and command-line tools.
- Contact-form and registration leads are saved, but no staff screen or task shows them.
- Signed-in users can call 39 finance, commission, invoice, and document database functions directly. Finance functions need an internal staff permission, but workspace document functions accept any member with workspace access.
- Windows port-proxy rules hold ports 3000 to 3005, so the local application cannot use its expected port.
- The unit suite passes in full. The integration suite fails 27 of 1,492 tests in 7 of 126 files.
- Only two integration failures touch launch scope. One is a stale test baseline. The other comes from two excluded finance tables without row-level security policies.

## 2. Owner decisions

| ID | Decision | Recommendation | Approval type | Answer |
|---|---|---|---|---|
| D1 | Case identifier | The deal, with a one-to-one bridge from each submitted intake | Product owner | Approved October 7 |
| D2 | Launch surface mechanism | One server-side allowlist, proven by the entry-point inventory test, plus a reversible migration that removes direct database access to excluded functions | Product owner; the migration is a permission change | Approved October 7 |
| D3 | Git checkpoint | One checkpoint commit of all current work on this branch, then a push to the branch's existing remote | Explicit Git authorization; commit and push are separate approvals | Approved October 7 |
| D4 | Email provider | Resend as custom SMTP for Supabase Auth and as the internal email service | Product owner; production activation remains a P5 approval | Approved October 7 |
| D5 | Automated journey tests | Playwright as a development dependency, with axe accessibility checks | Dependency approval | Approved October 7 |
| D6 | Private staging | A Vercel preview environment and a staging Supabase project at the end of P1 | Cost and provider setup approval | Approved October 7 |
| D7 | Local port | Run MMHR locally on port 3100 and update the local Auth redirect settings | Product owner; removing the port-proxy rules instead is a system change only the owner can make | Approved October 7 |
| D8 | Dependency audit fix | Run `npm audit fix` without `--force`; this updates four transitive packages in the lockfile only | Dependency approval | Approved October 7 |
| D9 | Excluded-feature tests in CI | Move the integration files for excluded finance and document features into a separate CI job that reports but does not block, with this record as the documented scope change; keep every test and assertion unchanged | Product owner; this changes a required gate's scope | Approved October 7 |

**D3 detail.** One commit is recommended because grouped commits would not each build. The root router imports the finance routers, so finance files cannot be split from Candidate A files cleanly.
All 755 uncommitted text files passed the project secret scanner with no findings. The two binary files are copies of the patched `braces` package archive.
The commit would include the Codex hook files under `.codex/hooks/`, which match the tracked `.claude/hooks/` pattern.

**D7 detail.** The port-proxy rules forward 127.0.0.1 ports 3000 to 3005 to the WSL address 172.31.166.45.
`npm run dev:local -- --port 3100` already supports another port.
Email links use the local Site URL, so `supabase/config.toml` needs the matching Site URL and redirect URLs.

**Actions after approval, October 7:**

| Decision | Action | Status |
|---|---|---|
| D3 | Checkpoint commit `0b552be` with 877 files, pushed to `origin/codex/full-delivery-verification`. A stale, empty Git index lock from September 14 was removed first. | Done |
| D8 | `npm audit fix` updated the four planned packages in `package-lock.json` only. The audit gate passes; 3 moderate findings remain in the excluded document parser. | Done |
| D7 | The local dev script default, the local Auth Site URL and redirect list, `.env.example`, `AGENTS.md`, and two how-to documents now use port 3100. Local Supabase restarted with its data intact. | Done |
| D9 | The Claude Code auto-mode safety classifier blocked the CI workflow change as a CI bypass. No D9 change remains in the tree. | Waiting for the owner |
| D1, D2, D4, D5, D6 | Scheduled in the P1 order in Section 9 | Pending |

After these changes, type check, lint, dependency audit, both secret scans, unit tests (491 files, 6,346 tests), and the build all pass. The integration suite was not rerun, because the changed packages are build and command-line tools.
These changes are not committed yet; D3 covered only the checkpoint commit.

`npm run dev` still reads `NEXT_PUBLIC_APP_URL` from `.env.local`, which only the owner edits. Use `npm run dev:local`, which sets the 3100 address itself.

## 3. Starting condition

### 3.1 Checks

| Check | Result | Date |
|---|---|---|
| `npm run type-check` | Pass | October 6 |
| `npm run lint` | Pass | October 6 |
| `npm test` | Pass: 491 files and 6,346 tests in 815 seconds | October 7 |
| `npm run build` | Pass: compiled in 34 seconds; 94 static pages; 170 seconds in total | October 7 |
| `npm run test:integration` | **Fail**: 119 of 126 files and 1,465 of 1,492 tests passed in 20,859 seconds | October 7 |
| `npm run check:integration-matrix` | Pass: 126 test files | October 7 |
| `npm run check:secrets` | Pass: 1,156 tracked files | October 7 |
| Secret scan of untracked files | Pass: 755 text files with no findings; 2 binary files skipped | October 7 |
| `npm run check:dependency-audit` | **Fail**: 7 findings: 1 critical, 2 high, 4 moderate | October 7 |
| `npm run check:r9-evidence` | Blocked as expected: every release evidence category is pending | October 7 |

The build ran with an empty `SENTRY_AUTH_TOKEN` and with Next.js telemetry off, so it uploaded nothing.
The build printed two deprecation warnings. Next.js 16 renames the `middleware` file convention to `proxy`, and Sentry deprecates the `disableLogger` option.
Fix both in P1 with the launch-surface work, after reading the installed Next.js guide.

The integration suite starts a full disposable Supabase stack for many cases, so a full run takes about four to five hours.
The first attempt was stopped after one passing file because its 90-minute limit could not finish. Its disposable stack was removed.
The restarted run ended at 07:19 EDT. It ran against one unchanged source snapshot.

### 3.2 Dependency audit detail

| Package | Severity | Introduced by | Exposure in the deployed app | Fix |
|---|---|---|---|---|
| `proxy-addr` 2.0.7 | Critical | `shadcn` and `trigger.dev` command-line tools, through the MCP SDK and Express | None; command-line code only | Non-breaking update |
| `@modelcontextprotocol/sdk` 1.29.0 | High | `shadcn` and `trigger.dev` command-line tools | None; command-line code only | Non-breaking update |
| `source-map-js` 1.2.1 | High | Tailwind PostCSS, jsdom, `trigger.dev` | Build and test only | Non-breaking update |
| `postcss-selector-parser` 7.1.4 | Moderate | `shadcn` command-line tool | None | Non-breaking update |
| `mammoth`, `argparse`, `sprintf-js` | Moderate | `mammoth`, used only by the excluded document parser | The parser stays inactive | Only a breaking downgrade; leave until the parser returns |

`shadcn` is a production dependency because `globals.css` imports `shadcn/tailwind.css`.
The CI gate uses `--audit-level=high`, so the moderate findings do not fail it.

### 3.3 Local environment

- The owner started Docker Desktop on October 7.
- Local Supabase runs with the CI exclusions: Studio, Edge Runtime, Logflare, Vector, and Supavisor are off.
- At start, Docker also ran 39 containers from six other projects. They slowed the unit tests; P0 did not change them.
- The local database had 142 of 169 migrations. P0 applied the 27 pending migrations through the guarded local configuration.
- Postgres truncated one long foreign-key name during the migration. The truncation is harmless, but a future schema diff can show it.
- A pre-migration dump exists only in the session scratchpad. It is temporary.
- `.env.local` has no `MIGRATION_DATABASE_URL`. Local migrations read it from `supabase status`, as `npm run dev:local` and CI do.
- Supabase CLI 2.116.0 is installed; 2.120.0 is available. The config uses the deprecated `[inbucket]` section; rename it to `[local_smtp]` in P1.
- No MMHR development server is running.

### 3.4 Uncommitted work by area

Counted before the P0 document edits.

| Area | Modified tracked files | Untracked files |
|---|---:|---:|
| Candidate A application and server | 73 | 181 |
| Demos, proposals, and contracts (Candidate B) | 8 | 95 |
| Finance (excluded) | 11 | 129 |
| Documents, parser, licenses, and patched package (excluded) | 2 | 165 |
| Migrations and snapshots | 1 | 77 |
| Documents and plans | 6 | 47 |
| Brain memory | 6 | 49 |
| Codex hooks | 0 | 12 |
| Tooling and configuration | 10 | 2 |
| Other | 2 | 0 |
| **Total** | **119** | **757** |

The 10 newest migrations, 0159 to 0168, are untracked.
The staff evaluation, RFP, response, demo, proposal, and contract screens are mostly untracked.

### 3.5 Integration failures

| File | Failed | Scope | Cause | Launch handling |
|---|---:|---|---|---|
| `r1-security` | 1 of 2 | Platform gate | `finance_document_sources` and `finance_document_approvals` have row-level security on but no policy; direct access is denied, but the check requires an explicit policy | Add explicit no-direct-access policies in a reviewed migration in P1 |
| `r4-rfp-notifications` | 1 of 24 | Candidate A | The expected table snapshot predates migrations 0159, 0160, 0162, and 0164; 14 newer tables appear, 11 of them for finance | Update the baseline to the tables that exist before the tested migration; keep the equality check |
| `r4-document-uploads` | 1 of 8 | Excluded documents | A TRUNCATE probe got "object in use" (55006) instead of "permission denied" (42501) | D9 |
| `r7-finance-document-auth` | 5 of 45 | Excluded finance | Authorization error, statement cancellation, and a query parameter typing error | D9 |
| `r7-managed-finance-auth` | 17 of 29 | Excluded finance | Signed-source command failures, a document request failure, and three timeouts | D9 |
| `r7-managed-invoice-auth` | 1 of 34 | Excluded finance | Signed-source command failure | D9 |
| `r7-payment` | 1 of 43 | Excluded finance | The payment event has 17 fields; the test expects 14 | D9 |

The October 3 run failed 4 checks in 4 of 116 files. The new failures come mainly from finance work added after that run.
The CI integration job has a 120-minute limit, but the local full run took 20,859 seconds. CI integration therefore cannot finish today. P1 needs a measured limit or split jobs.

## 4. Launch surface inventory

Source: the entry-point registry in `src/server/auth/entry-point-inventory.ts`, with 383 records.
Rule: finance and private-document records are excluded. Demo, proposal, and contract records belong to Candidate B. All other records belong to Candidate A.

| Kind | Candidate A | Candidate B | Excluded finance | Excluded documents |
|---|---:|---:|---:|---:|
| Page | 45 | 9 | 4 | 2 |
| Error or loading boundary | 15 | 18 | 6 | 2 |
| tRPC procedure | 65 | 40 | 19 | 8 |
| Command | 89 | 6 | 16 | 6 |
| Server action | 7 | 0 | 0 | 1 |
| Route handler | 5 | 0 | 2 | 1 |
| Layout | 4 | 0 | 0 | 0 |
| Middleware | 1 | 0 | 0 | 0 |
| Command support | 4 | 2 | 0 | 0 |
| Background task | 2 | 0 | 0 | 0 |
| Framework hook | 4 | 0 | 0 | 0 |

### 4.1 Pages

- **Candidate A, public (23):** `/`, `/about`, `/blog`, `/blog/[slug]`, `/broker-model`, `/case-studies`, `/case-studies/[slug]`, `/contact`, `/faq`, `/partners/brokers-consultants`, `/partners/pe-vc`, `/partners/software-vendors`, `/platform`, `/privacy`, `/resources`, `/resources/hris-landscape-report`, `/resources/partner-finder`, `/resources/requirements-builder`, `/services`, `/terms`, `/transparency`, `/designs`, `/designs/[slug]`.
- **Candidate A, signed in (22):** `/sign-in`, `/sign-up`, `/mfa`, `/pending-access`, `/agentid/complete-registration`, `/invitations/accept`, `/home`, `/workspaces`, `/members`, `/invitations`, `/invitations/new`, `/customer`, `/customer/evaluation`, `/customer/rfp`, `/vendor`, `/vendor/response`, `/admin`, `/admin/evaluations`, `/admin/vendor-evidence`, `/admin/tasks`, `/admin/tasks/[taskId]`, `/admin/audit`.
- **Candidate B (9):** `/customer/demos`, `/vendor/demos`, `/admin/demos`, `/customer/proposals`, `/vendor/proposals`, `/admin/proposals`, `/customer/contracts`, `/vendor/contracts`, `/admin/contracts`.
- **Excluded (6):** `/admin/finance/commercial`, `/admin/finance/documents`, `/admin/finance/documents/review`, `/admin/finance/invoices`, `/documents`, `/documents/review`.

### 4.2 Route handlers, server actions, and background tasks

- **Candidate A:** `GET` and `POST /api/trpc/*`, `POST /api/leads`, `POST /api/newsletter`, `GET /auth/agentid/callback`.
- **Candidate A server actions:** `signUp`, `signIn`, `signOut`, `selectOrganizationAction`, `acceptInvitationAction`, `signInWithAgentId`, `completeAgentIdRegistration`.
- **Candidate A background tasks:** `health-check` and `identity-admin-intents`. No excluded background task exists.
- **Excluded:** `/api/documents/access`, `/api/finance/documents/access`, `/api/finance/invoices/originals`, and the `searchWorkspaceDocumentsAction` server action.

### 4.3 tRPC procedures

- **Candidate A (65):** audit, tasks, clarifications, responses, health, invitations, memberships, organizations, intakes, evaluations, the RFP workflow, RFP notifications, RFP receipts, and vendor evidence.
- **Candidate B (40):** demos 14, proposals 13, contracts 13.
- **Excluded (27):** documents 8, finance documents 11, managed finance 4, managed invoices 4.

### 4.4 Database functions

In the migrated local database, the `authenticated` role can execute 39 finance, commission, invoice, and document functions, for example `public.mmhr_record_commission`.
Thirteen demo, proposal, and contract functions follow the same pattern.
A signed-in user can call them through the Supabase API without the application.
Finance functions check the internal `finance.manage` permission with AAL2.
Workspace document functions check `workspace.access`, so a customer member can reach the excluded document storage through the API even when the screens are hidden.

### 4.5 Advertised public actions

| Action | Where | Behavior today | Launch handling |
|---|---|---|---|
| Create an account | 14 links to `/sign-up` | Works locally; the confirmation link lands on the home page without a session | Fix in UX-02 |
| Contact MMHR | 12 links to `/contact`; the form posts to `/api/leads` | Saves a lead; no staff screen or task shows it | Add a new-leads queue to staff Today in UX-05 |
| Sign in | 1 link to `/sign-in` | Works | Shared shell in UX-02 |
| Newsletter | Pulse form posts to `/api/newsletter` | Uses Beehiiv when configured; otherwise answers "unavailable" | Hide until the owner approves Beehiiv |
| Resource pages | 3 links each | Informational; buttons lead to sign-up and the platform page | Keep; claims need owner approval |
| Partner pages | 2 links each | Informational | Keep; claims need owner approval |
| Cookie consent | All public pages | Records the choice and gates analytics | Keep |
| AgentID sign-in | Sign-in page | Off unless `AGENTID_SIGN_IN_ENABLED` is set | Keep off unless approved |

Behavior in this table comes from source reading. P1 browser checks confirm it.
The R0 release gate blocks public release until `PUBLIC_RELEASE_ENABLED` and an approval ID are set.

## 5. Excluded surface isolation approach

| Surface | Mechanism | Proof |
|---|---|---|
| Pages (6) | Middleware returns not-found for paths outside the launch allowlist; each excluded page also calls a launch guard | Entry-point inventory test and a browser check |
| Route handlers (3) | The same allowlist check runs first in each handler | Inventory test and route tests |
| Server action (1) | A launch guard runs first in the action | Unit test |
| tRPC routers (4) | The routers stay in the type; a launch middleware returns `NOT_FOUND` for their procedures | Router tests call each excluded procedure |
| Navigation | The shell builds navigation from the allowlist and permissions; the staff home loses its finance and document links | Component tests |
| Database functions (39 excluded; 13 Candidate B) | A reversible migration revokes `EXECUTE` from `authenticated`; its reverse restores the grants; no identity holds `finance.manage` at launch | Integration tests as customer, vendor, and staff |
| Background tasks | None are excluded | Inventory |
| Newsletter | The allowlist entry stays off until Beehiiv is approved; the form hides and the route returns not-found | Unit test |

Keep all excluded code, tables, data, and failed evidence.
Candidate B surfaces follow the same mechanism until Candidate B ships.

## 6. Launch workflow work list

Scenario numbers refer to roadmap Section 10, "Minimum acceptance scenarios."

| # | Workflow | Source | Gap | Acceptance check | Work package and dependency | Candidate |
|---|---|---|---|---|---|---|
| 1 | Registration and confirmation | `(auth)/sign-up`, `signUp` in `(auth)/actions.ts` | The confirmation link lands on the home page without a session; no resend action; hosted email needs custom SMTP | A visitor registers, confirms by email, and reaches the right workspace | UX-02; D4 | A |
| 2 | Account recovery | None | No confirm, forgot-password, reset, or resend routes | Reset by emailed link; an expired link recovers; an unknown address gets the same message; staff still need MFA; scenario 7 | UX-02; D4 | A |
| 3 | Workspace, members, and invitations | `/home`, `/workspaces`, `/members`, `/invitations`, `/invitations/new`, `/invitations/accept`, `/mfa`, `/pending-access` | Home is a link list; the members page shows raw identity IDs and no names or email addresses; no shared shell or account menu | Each role lands on its home with its next action; invalid and expired invitations recover | UX-02, UX-03 | A |
| 4 | Guided needs assessment | `/customer`, `intake-form.tsx`, `requirement-form.tsx`, `customer-intake-save.ts`, `customer-intake-submit.ts` | Customers type their own labels and pick data types; no sections, progress, or review step | Save, sign out, resume, review, and submit; scenario 2 | UX-04 | A |
| 5 | Case identity | `deals` in `crm-workflow.ts`, `workspaces` in `r3-workspace.ts`, intake submission | Deals have no intake link; workspaces key on the intake | Each submitted intake has exactly one deal; a backfill covers existing intakes | UX-05; D1 | A |
| 6 | Staff daily work and leads | `/admin`, `/admin/tasks`, `lead-create.ts` | No Today view, case list, or case workspace; saved leads appear nowhere | Staff see new leads, find a case, assign an owner, set the next action, and see it after reload | UX-05, UX-11; D1 | A |
| 7 | Customer and vendor records | `crm-database.ts`, `crm-search-database.ts`, `relationship.ts` | No staff screens for customers, contacts, vendors, or products | Staff create, find, and update permitted records without scripts | UX-05 | A |
| 8 | Vendor facts and publication | `/admin/vendor-evidence`, publication controls in `/admin/evaluations` | Real fact approvals are pending; the screens sit outside case context | Only approved facts and rules reach customers | UX-06; owner fact approvals | A |
| 9 | Comparison and initial selection | `/customer/evaluation`, `comparison-matrix.tsx`, `evaluation-options.tsx` | No current keyboard or narrow-screen evidence; design pass pending | The sixth selection is refused; names stay masked before disclosure; scenarios 3 and 4 | UX-06 | A |
| 10 | Disclosure, RFP, approval, and delivery | Review controls in `/admin/evaluations`, RFP commands, `rfp-notification-controls.tsx` | Outside case context; vendor invitation is not a case action; no email provider is active | Unapproved requests cannot reach vendors; a failed notice retries without a duplicate; scenarios 5 and 8 | UX-07; D4 | A |
| 11 | Vendor response and clarification | `/vendor`, `/vendor/response`, `response-review.tsx`, `/customer/rfp` | No shared shell; deadlines and next actions are not prominent | Only the invited vendor responds; customers see approved results only; scenario 6 | UX-08 | A |
| 12 | Demos | `/customer/demos`, `/vendor/demos`, `/admin/demos`, `demo-workspace.tsx` | Each page asks for the case again | A confirmed session with time zones and outcomes stays in one case | UX-09 | B |
| 13 | Proposals | The three proposal pages, `proposal-workspace.tsx` | Each page asks for the case again | Compare quotes with missing costs and different billing bases; scenario 9 | UX-09 | B |
| 14 | Selection and contract handoff | The three contract pages, `contract-workspace.tsx`, `contract-handoff-portal.ts` | Each page asks for the case again; outcome history sits outside the case view | Paused, cancelled, not-signed, and signed outcomes keep history; scenario 10 | UX-10 | B |
| 15 | Reporting and settings | `/admin/audit`, `src/server/reporting/` contracts | No count views or settings screen | Each count links to its records | UX-11 | A for Today counts; B for the rest |
| 16 | Public site and claims | Marketing pages, Pulse, `/api/leads`, `/api/newsletter`, R0 gate | Claims await owner approval; the newsletter depends on Beehiiv | Every advertised action works or is hidden | UX-12; owner content approval | A |
| 17 | Launch surface control | Middleware, root router, staff home links, database grants | Excluded pages, routers, links, and functions are live | Excluded surfaces return not-found; the inventory test proves it | UX-01, UX-03; D2 | A |
| 18 | Email delivery | `rfp-notification-worker.ts`, `EmailService`, AgentMail test adapter, Supabase Auth email | No production provider; the hosted built-in sender only reaches team addresses | Delivery states, failures, and retry are visible | UX-07, UX-17; D4 | A |
| 19 | Hosting and staging | Vercel and Supabase Cloud | No staging environment | The same three-role journey passes on staging | UX-17; D6 | A |
| 20 | Automated journeys | None | No browser test framework | The three-role journey runs in the integration workflow | UX-16; D5 | A |

## 7. Shared interface rules

### 7.1 Design plan

**Color.** The application maps Pulse colors onto the shadcn/ui semantic tokens in `src/app/globals.css`.

| Token | Light | Dark | Pulse source |
|---|---|---|---|
| `--background` | `#eef3f2` | `#080c11` | `--bg` |
| `--foreground` | `#0a161b` | `#f3f6f8` | `--ink` |
| `--card`, `--popover` | `#ffffff` | `#10161d` | `--module` |
| `--primary`, `--ring` | `#097061` | `#2fe6c4` | `--accent` |
| `--primary-foreground` | `#ffffff` | `#04120e` | `--accent-on` |
| `--secondary`, `--accent` | `#f2fbf8` | `#141d26` | `--module-hover` |
| `--muted` | `#e3eae9` | `#0f1318` | `--veil` over `--bg`, flattened |
| `--muted-foreground` | `#4e616a` | `#8a96a3` | `--muted` |
| `--border` | `#cbd9d7` | `#1e2732` | `--line` |
| `--input` | `#7a8f93` | `#5f7080` | New; form controls need 3:1 |
| `--destructive` | `#b42318` | `#f97066` | New |
| Status: warning | `#8a5a00` | `#e3b341` | New |
| Status: information | `#1d5fa8` | `#7cb8ff` | New |

Measured contrast: every text pair meets 4.5:1. The lowest is muted text on the muted band at 5.31:1.
Input borders measure 3.03:1 to 3.84:1 against cards and backgrounds. Hairline borders are decorative and need no minimum.
Success uses the primary color. Every status also shows a word, so meaning never depends on color.

**Type.** Geologica, weights 400 to 700, carries all text.
Martian Mono appears only for figures, dates, times, and reference codes inside tables and the comparison matrix. Labels and headings stay in Geologica, in sentence case.
Body text is 16 pixels in forms and 14 pixels in dense tables. Headings use 20, 24, and 30 pixels. Prose stays under 80 characters per line.
One shared font module loads each family once for the marketing site and the application.

**Radius.** `--radius` is 0.75rem. Controls use the small radius of about 7 pixels; panels use 12 pixels, as Pulse does.

**Layout.** Application shell on a desktop screen:

```text
+---------------------------------------------------------------------------+
| MMHR   Acme Corp, customer workspace v                    Theme   Account |
+--------------+------------------------------------------------------------+
| Overview     | Cases / Acme Corp / Comparison                             |
| Needs        | Acme Corp: HRIS selection             Owner: Rob           |
| Comparison   | o-----o-----o-----*-----o-----o-----o   stage trace         |
| RFP          +--------------------------------------+---------------------+
| Team         | Tab content                          | Next action         |
|              |                                      | Review 3 responses  |
|              |                                      | Due October 14      |
+--------------+--------------------------------------+---------------------+
```

Staff Today:

```text
+---------------------------------------------------------------------------+
| Today                                                                     |
| Needs you now: 2 approvals, 1 overdue task, 0 failed sends   (each links) |
| My cases: customer, stage trace, next action, due date                    |
| New contact requests                                                      |
| Upcoming demos (Candidate B)                                              |
+---------------------------------------------------------------------------+
```

On narrow screens, the sidebar becomes a sheet, the next-action panel moves above the tab content, and the comparison matrix scrolls inside its own frame.

**Principles.**

1. The stage trace is the one bold element. It draws the case stages as a line in the Pulse trace color. The current stage marks itself once on load, and reduced motion removes the effect.
2. Working surfaces stay quiet. Sections separate with spacing and hairlines. Cards hold discrete objects only, such as a quote or a vendor column.
3. Every status has a word, such as "Overdue" or "Waiting for approval", as well as a color.
4. Screens show names, not identifiers. References move to a detail view.
5. Buttons name their result. "Approve RFP" produces the message "RFP approved."

### 7.2 Review against generic defaults

- A default staff dashboard uses large-number cards. Today uses a short priority sentence with linked counts instead, because each count must lead to its records.
- Pulse defaults to dark with a bright teal accent, which resembles a common generated look. The application follows the device setting, and its working surfaces default to the calm light palette when the device has no preference.
- A monospace font on every small label is a common generated tell. Martian Mono is limited to figures, dates, and references, where fixed-width digits help comparison.
- Identical rounded cards everywhere flatten hierarchy. The design uses two radii and hairline sections.

### 7.3 Navigation by role

| Role | Candidate A items | Candidate B adds | Account menu |
|---|---|---|---|
| Customer | Overview, Needs assessment, Comparison, RFP and responses, Team | Demos, Proposals, Contract | Workspace change, theme, sign out |
| Vendor | Requests, Team | Demos, Proposals, Contracts | Workspace change, theme, sign out |
| Staff | Today, Cases, Customers, Vendors, Evidence review, Tasks, Audit, Settings | Case tabs gain Demos, Proposals, and Contract | Workspace change, theme, MFA status, sign out |

"Team" covers members and invitations. It appears only with `org.members.view`.
The shell builds every menu on the server from the launch allowlist and the caller's permissions.

### 7.4 Case context

- The deal is the case. Staff case routes use `/admin/cases/[dealId]`.
- Case tabs are Summary, Needs, Comparison, RFP, Responses, Tasks, and Activity. Candidate B adds Demos, Proposals, and Contract.
- Existing staff workflow pages stay reachable. They gain the case header and a link back to the case.
- Customer routes keep the `intake` query parameter, and the server resolves the deal. The overview lists the customer's cases when more than one exists.
- Vendor routes keep the `recipient` parameter. Vendors see only their own requests.
- Every case screen shows the case header: customer name, stage trace, owner, next action, and due date.
- Breadcrumbs use names, for example "Cases / Acme Corp / Comparison."

### 7.5 Component ownership

| Location | Contents | Owner |
|---|---|---|
| `src/components/ui/` | shadcn/ui primitives from the CLI; local edits only for tokens and 44-pixel touch targets | UX-03 |
| `src/components/app-shell/` | Shell, sidebar, top bar, workspace switcher, account menu, theme choice, page header, breadcrumbs | UX-03 |
| `src/components/case/` | Case header, stage trace, next-action panel, status label, activity list, case tabs | UX-05 |
| `src/components/data/` | Server-paged table, filters, pagination, record picker, detail panel | UX-05 |
| `src/components/forms/` | Form section, save status, validation summary, confirmation dialog; the existing `WorkflowCommand` | UX-04 |
| `src/components/states/` | Empty, error, denied, expired, stale, and loading states | UX-03 |
| `src/components/workflow/` | Existing workflow components; restyle only | The owning work package |
| `src/lib/fonts.ts` | One Geologica and one Martian Mono instance | UX-03 |
| `src/lib/launch-surface.ts` | Launch allowlist and guard helpers | UX-01 |
| `src/app/globals.css` | Pulse-mapped tokens for light and dark | UX-03 |
| Route folders | Screen-specific parts, such as the comparison matrix | The owning work package |

### 7.6 Component additions

A dry run of `npx shadcn add` for 27 components reported 28 new files and no new runtime package:
sidebar, sheet, dialog, alert-dialog, dropdown-menu, popover, tooltip, tabs, select, checkbox, radio-group, switch, separator, scroll-area, avatar, badge, skeleton, table, breadcrumb, textarea, alert, field, empty, spinner, progress, collapsible, pagination, and the `use-mobile` hook.

Cautions:

- The run overwrites `button.tsx`, `input.tsx`, and `label.tsx`. Review each with `npx shadcn add <name> --diff` first and keep the 44-pixel touch targets.
- The run lists one npm dependency named `cn`. Do not install it. Inspect the item with `--view`. The project already has `cn` in `src/lib/utils.ts`.

These components would add packages, so the application uses dependency-free alternatives:

| Avoid | Package | Alternative |
|---|---|---|
| Toasts | `sonner` | Inline status messages with `aria-live`, as `WorkflowCommand` already does |
| Command and combobox | `cmdk` | A server search list inside a popover |
| Calendar and date picker | `react-day-picker` | Native date and time inputs with an explicit time zone |
| Form | `react-hook-form` | Field components with the existing mutations |
| Data table | `@tanstack/react-table` | Server-side sorting and paging with the table component |
| Chart | `recharts` | Text counts that link to records |

Each avoided package would need dependency approval.

### 7.7 Theme

The account menu offers Light, Dark, and Device.
A cookie stores the choice. The application layouts read it and set the `dark` class on the shell wrapper, so public pages stay static.
Device mode uses a Tailwind custom variant with a `prefers-color-scheme` media query. It needs no script and no new package. Verify the variant syntax against the installed Tailwind version in P1.
The marketing site keeps the Pulse theme toggle. P4 aligns the two.

## 8. Account recovery and provider configuration

### 8.1 Current state

- Sign-up calls `supabase.auth.signUp` without a redirect. With confirmations on, the user sees "Check your email to confirm your account. Then sign in."
- The default email link confirms the address and redirects to the Site URL. No route completes the sign-in, so the user signs in manually.
- No forgot-password, reset, or resend path exists.
- Staff MFA uses TOTP with AAL2 guards. The two-administrator recovery commands for lost MFA stay separate.
- The installed `@supabase/auth-js` 2.110.2 provides `resetPasswordForEmail`, `verifyOtp` with `token_hash`, `resend`, and `updateUser`. `@supabase/ssr` defaults to the PKCE flow.

### 8.2 Design for P1

| Route or setting | Behavior |
|---|---|
| `/auth/confirm` route handler | Reads `token_hash` and `type`, then calls `verifyOtp`. Redirects only to an allowlisted internal path. An invalid or expired link goes to `/sign-in` with a clear message and a resend action. |
| `/forgot-password` | Takes an email address and calls `resetPasswordForEmail`. Always shows the same message, whether or not the account exists. |
| `/reset-password` | Requires the recovery session. Calls `updateUser` with a new password of at least 12 characters, then routes to `/home`. Staff still need MFA for staff areas. |
| Sign-in and sign-up | Add a resend-confirmation action with the same neutral message and rate-limit handling. |
| Email templates | Confirmation, recovery, invitation, and email change link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>`. Local templates live in `supabase/templates/`. |

### 8.3 Hosted settings for staging

Apply these after decisions D4 and D6:

- Site URL and the redirect URL allowlist for the staging domain.
- Resend as custom SMTP, with a verified sending domain, SPF and DKIM records, and the sender from `EMAIL_FROM`.
- The same email templates as local.
- Email confirmations on, a minimum password length of 12, and TOTP MFA on.
- Reviewed Auth rate limits for email sending and verification.
- The AgentID provider stays off unless approved.
- A decision in P1 on whether a password change requires a recent sign-in.

The built-in Supabase sender delivers only to project team addresses, has low rate limits, and is not for production. Custom SMTP is therefore required before customers or vendors use staging.

### 8.4 Sources

- Supabase, [Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- Supabase, [Customizing email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates).
- Supabase, [Build a User Management App with Next.js](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs).
- Installed type definitions in `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts`.

## 9. P1 start order after the decisions

**Testing rule, owner decision of October 7, 2026:** During P1 to P4, run only short checks: type check, lint, unit tests, the build, and single integration files that the wrapper allows. Run the full integration suite only when the app is ready to go live, against the hosted staging candidate in P5.

1. Make the checkpoint commit and push (D3).
2. Apply the dependency audit fix (D8), resolve the two launch-scope integration failures in Section 3.5, apply D9, and repeat the standard checks.
3. Resolve the local port (D7) before any browser check.
4. Build the launch allowlist, the navigation source, and the database grant migration (D2).
5. Apply the tokens, fonts, theme, and component additions, then build the shell.
6. Add the case identity bridge and backfill (D1).
7. Add the account recovery routes and templates, tested locally with the local mail server.
8. Build the guided needs assessment.
9. Build staff Today with new leads, the case list, the case workspace, and the CRM screens.
10. Show the first visual checkpoint to the owner.
11. Stand up staging and run the first hosted smoke check (D4, D6), then add the journey tests (D5).

## 10. Change record

| Date | Change |
|---|---|
| October 7, 2026 | P0 baseline, launch inventory, isolation approach, work list, interface rules, and recovery design recorded. Supersession notices added to nine planning documents. |
| October 7, 2026 | Owner approved D1 to D9. P0 complete. D3, D7, and D8 applied; D9 blocked by the safety classifier. |
| October 7, 2026 | Integration result recorded: 7 of 126 files failed. Failures classified in Section 3.5. Decision D9 added for excluded-feature tests in CI. |
