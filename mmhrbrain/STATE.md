# MMHR — Current State

Updated: 2026-10-14 22:31 EDT. Branch: `codex/full-delivery-verification`. Last commit be89df6 (all fonts self-hosted), pushed; gallery review tools live on preview mmhr-czz7wdawp with Neon storage.

## Scope and authority
- Latest user direction: working core features first, then high-quality public and logged-in design, then further security and features.
- Owner approved roadmap v1.1 and started P0 on 2026-10-07. P0 is complete: the owner approved D1-D9 on 2026-10-07. D3, D7 and D8 are applied; D9 is blocked by the auto-mode classifier and waits for the owner. P1 steps 1 to 4 are done (launch allowlist, migrations 0169-0170); step 5 changed: the owner chose to replace Pulse entirely. Twenty candidate designs live at /gallery (src/gallery), rounds 1 to 4; the owner picks one, then P1 applies it everywhere. The gallery now has ToddSpeciale4-style review tools (comment, pick, /gallery/final builder, /gallery/inbox) with a separate review database (GALLERY_REVIEW_DATABASE_URL); live on the Vercel preview with Neon review storage (GALLERY_REVIEW_DATABASE_URL, Preview only); public short address https://mmhr-gallery.vercel.app (branch domain; owner turned Vercel Authentication off on 2026-10-16, so all previews are public behind the release gate). Warning: mmhr.vercel.app serves the public July build (pre-gate), not a holding page (journal 2026-10-16). Owner rule: no full integration run until go-live on hosted staging.
- This direction supersedes the October3 full-platform-before-live instruction. Nine older documents now carry dated supersession notices; full rewrites follow launch.
- Financial-record management and private document storage are outside the requested MVP. Contracts and existing permission controls remain important.
- Do not resume superseded finance/parser/security expansion. Local migrations and checks are authorized within P0 and later phases.
- Approved on 2026-10-07: checkpoint commit and push (done), audit fix (done), port 3100 (done), Resend, Playwright dev dependency, staging at the end of P1. Still unapproved: other Git writes, cloud migrations, production actions, and real-data rehearsal.
- Exact braces package has local installation/testing approval. Parser acquisition, build, and activation have no approval.
- Brain sync and consolidation are not requested. Neither ran.
- Rename open (2026-10-07 20:23 EDT): the owner wants a new name to replace "MatchMaker HR." Round-2 top picks are Benchtrial, Blindfit, and Fitgap (journal/2026-10-08.md). No domain is bought and no brand text has changed yet.
- Shared project board (2026-10-07 20:52 EDT): .project-board/ (Git-ignored) tracks tasks, both agents' status, questions, and conflicts. Rules: "Shared project board" in AGENTS.md. Both agents follow it before each task.
- Known flaky test (2026-10-21, task 51): `r8-deal-follow-up-auth` "rejects changed, foreign and malformed queue cursors..." fails about 15% of runs on develop (edits the min-UUID task of a shared org). Owner-approved test-only fix is applied in worktree dazzling-wright-4b6bf0, uncommitted; commit and push wait for the owner (journal/2026-10-21.md).

## Evidence locations
- Current plan: .codex/plans/build-mvp-complete-ui-ux-roadmap-2026-10-06.md (v1.1, owner-approved). Current phase record: .codex/plans/build-mvp-p0-baseline-2026-10-07.md. P0 status: complete. Checkpoint commit 0b552be is pushed. Local dev port is 3100.
- Current journal: mmhrbrain/journal/2026-10-07.md. Earlier runtime evidence remains in the October 4 and 5 journals.
- Prior full state: mmhrbrain/archive/STATE-before-2026-10-06-1340.md.
- Current scratch: C:/Users/rob/.codex/visualizations/2026/10/04/01a10918-17c6-7272-b7a9-caedeac93d50.
- Earlier gates: docs/security/current-candidate-gates-2026-10-03.md.

## Current MVP planning checkpoint
- Read canonical PRD2.6 and TECH_STACK2.9, MVP checklist, phased delivery, pilot operating procedure, prior execution plan, October3 audit and core requirement gaps.
- Inspected current registration, home, workspace selection, customer intake/comparison/RFP, vendor inbox, staff evaluations/tasks, contract workflow, root router and Pulse styles/fonts.
- Source includes connected intake/comparison/RFP/response/demo/proposal/contract paths. This inspection does not certify current runtime success.
- Ordinary staff case operation, guided intake, shared navigation and consistent design remain the priority. Admin home is a link list; intake uses generic answer editors.
- Saved sequence P0–P5: scope and baseline; accounts/intake/staff cases; comparison/RFP/responses; demos/proposals/contracts; full Pulse design; verification and launch preparation.
- Keep contracts as selection/introduction/status/reference records; no legal contract execution, financial ledgers or private-file ingestion in MVP.
- Keep later code and failed evidence. No new framework, speculative security system, broad148-row audit, or finance/parser fixture expansion is needed before core feature work.
- Saved plan covers all launch screens, backend work, scope exclusions, acceptance, risks and approval points. All 27 local links and nine npm script names passed checks.
- No application code, canonical document, provider, database, permission or Git change occurred. No application tests or agents started. Stop for user approval.
- Last publicationV17 run passed189 pure cases18901ms, then strict types failed14633ms. Lint did not run. Captured known/direct/marker absence passed00:59:15UTC; unknown descendants remain unproved. Later isolated typing candidates are not MVP completion evidence.
- Oct 7 P0: unit 491 files/6346 tests pass; build pass; integration matrix pass; secrets pass for tracked and 755 untracked files; dependency audit FAILS (1 critical, 2 high, all build/CLI tools; fix needs D8). Local DB migrated 142->169 after a scratch backup. Integration run 01:31-07:19: 119/126 files, 1465/1492 tests pass; 5 failing files are excluded finance/documents (D9), r1-security fails on two finance tables without RLS policies, r4-rfp-notifications has a stale table baseline. Containers from six other projects keep running; port-proxy rules hold 3000-3005 (D7).

## Accepted receipt and existing delivery evidence
- Root0166 and0168 receipt corrections are integrated. SQL remains unapplied outside synthetic fixtures.
- Receipt V9 passed all61 Auth and15 history cases. Both wrappers closed exit0 with exact names/multiplicities.
- Both before/after guards checked6478 source files,6478 snapshot files,77742 dependency files, and junction identity.
- Auth report SHA860a1ef72289cbf29f976299a617731aff1653ea0cccaaff1e565d4da4568bce.
- History report SHA3dc4bdf8dcb5012dcc6075331819c3929a94a2f5373403c050c30b7af87eb234.
- Actual owned resources, recorded processes/direct children/markers, and16 ports are absent. Unknown descendants remain unproved.
- Accepted snapshots and every failed receipt attempt remain preserved. Root capture freeze has ended.
- Staff audit passed32 genuine/70 focused cases; email passed88 focused cases. Audit publication remains revoked; providers remain disabled.
- Unit-title corrections passed146 cases twice. Historical full6169/476 failed supervisor acceptance; collector V5 accepted16 pending cases without bodies/hooks.

## Finance
- Foundation has six proposed collection tables. Historical V4 independent review checked99 pins;114 genuine bodies remain unrun.
- Source-intake, admission, command V2, and read V2 packets remain preserved. Database authority and actual fixture acceptance remain open.
- Collection prototypes passed102 cases; effective ledger/contracts passed20/28 and strict types. Closed intake still rejects; application wiring remains open.
- Independent result reviews found impossible summaries, unchanged digests, and retained-preparation limit defects.
- ResultV7/ContractsV4 passed136 cases and strict13-source types. Report SHA16c5be376f2104d4a2199f3f6bb61606e994093d7f8f2747f52f99fb95d5be15; exact disposition digest rules remain required.
- CorpusV10 retains72 original bodies and adds5 active-guard cases. Its77 bodies remain unrun; original5 corruption requirements remain UNRUN_UNMET.
- ComposedV8 types passed243.515s; focused lint passed167.518s with0 errors/22 warnings. Guards passed for1553 copied files, including SQL.
- Complete47-schema strict types passed4.993s. Owned generation passed13.068s without dotenv, credentials, root config, or SQL execution.
- Complete raw SHA5ae4c5cadb52de07a24b26b52e44a7e408386a9d241128c94023a2a928544ae2 has24 tables,69 indexes,111 FKs and206 statements. Earlier candidates remain preserved.
- Ordered V3 preserves206 exact statements and reverses fully. SHA7324c70ca3f7480fa20eff74d5cb4ecc79c5bdff0c881b5b0dd52228f7f0e4d2.
- Independent single-DDL review passed nine exact table removals, three reverses and44 public DDL matches. Security bytes remain exact.
- Catalog V1 retains169 canonical migrations and72 parts. Both source reviews missed one forward REVOKE dependency.
- Catalog V1/V2 failed part9; V3 failed CASE parsing. V4 failed part52 parameter naming. All failures remain saved.
- V5 passed6 cases:72 parts/21 tables/94 FKs/RLS/closed functions/raw denial/triggers. Report SHA9ebf166d9a9f352cd02d1649f6d8be2de69e2645efd7643bed43acb8eef3481f; unchanged strict25-source evidence was reused explicitly.
- SQL V2 review verifies four repairs,76 pins and44 reverses. Installation passed;25 behavioral cases remain unrun.
- Accounting correction cannot prove returned funds. Original fund identities remain consumed.
- Browser recovery V3 passed25 cases and strict types. Actual two-tab checks proved queued cancellation while another tab retained its lock.
- Reload retained the marker without resending. Exact synthetic fence proof cleared it. Both console error/warning logs were empty.
- Document bridge V2 passed99 cases and strict37-source types. Report SHA4f81662b6ce86f5c603c6fe729a547a995ef8ec9b74f6da76bbf19e5a7d56f8f.
- Failed browser V1 types, V2 queued cancellation, and bridge V1 test types remain saved. Application mounting remains open.
- Download V1 passed95 cases and strict36-source types. Durable document V3 passed50 cases and strict45-source types; behavior remains open.
- Financial recovery V2 passed63 cases and strict36-source types. Independent review confirms marker-only recovery resolves V1's reload deadlock.
- Shared wiring V2 passed24 cases and strict41-source types. Shared contracts passed36 cases and strict37-source types.
- Shared wiring V1 passed23 cases but failed TS2345. V2 narrows only the barrier reader type; the writer contract stays exact.
- Shared server adapter V2 passed64 cases and strict37-source types. Report SHAc56447ec4c69416b58d12561c52f7ac72f4797ff0fc231ad6a8e4aff40d12f19.

## Other unfinished source work
- Onboarding original-authority successor has231 unrun genuine cases and independent source review.
- Reminder V4 has70 unrun genuine cases and38 controls. SQL, catalog, and durable browser recovery remain unverified.
- CSM through owner transfer Y, role repair Z and public schema AA passed composed types120661ms and lint23575ms, with0 errors/24 warnings. All1613 copies passed guards; known processes are absent22:40:13UTC.
- Owned52-schema generation passed15316ms without dotenv, credentials or SQL. Raw147058-byte SHA bc0400aaa5c48ca918dcc046033e006ceac37ab72f7698d784ca6c47a4fa85d3 preserves206 old statements and adds132 reviewed statements.
- Independent AA review verifies16 reverses/41 removals,16 tables/280 columns/77 CHECKs/91 public and38 supplemental FKs. Ordered338-statement candidate fixes17 FK/index gaps with exact reverse. Helper/private-target/full source installation order remains open.
- AB staff-observation detail and AC milestone/plan completion source are frozen outside semantic gates. AC29 SQL/two TS and four unwired cases remain unrun. Other CSM families and mounting remain open.

## Cleanup limits and release blocks
- A reused parent PID selected an unrelated process created earlier. It remains running; prior failed cleanup reports remain saved.
- Browser/bridge/types/document/recovery/generation known-process absence passed. Evidence remains in the dated journal; network capture and unknown descendants remain unverified.
- Braces764 compatibility/197 security/37 consumer checks passed;45 of904 reference cases failed. Audit0 is not clearance.
- Historical broad integration112 files/1101 passes/4 failures remains failed. Current complete application gates remain required.
- Parser Linux isolation, native notices, cancellation, physical termination, and host decision remain open. Runtime stays inactive.
- All four failed catalog fixtures and accepted V5 closed. Each has eight successful empty Docker queries and absent known processes/eight ports.
- Shared V1/V2/contract recorded processes/direct children/markers are absent at19:28:26,19:30:32 and19:37:24UTC.
- Financial44-byte CASE repair and four-token parameter repair passed independent review and actual V5 installation.
- Document schema review records four invalid organizations-to-orgs FK corrections. Three table removals retain exact1020-byte security suffix.
- First81 passed7 actual catalog cases plus strict25-source types. It confirms24 tables/111 FKs and exact five canonical wrapper signatures/ACLs.
- Repaired85 passed7 actual catalog cases. Report SHA9188b208764e5753975c17609162b6af4d6314f81108909ba7bf7f904278d2d4; identical strict25-source evidence was reused explicitly.
- First81 constructor retained a stale unique-table count21 and failed before runtime. Corrected V2 passed the recorded seven catalog cases.
- Shared fixtureV4 passed35 units and strict26/1078-source types. Root214-file review confirms actual-driver tracking and failure-safe private resource capture. Manifest535373bda96cff3a61171dc8586cd33bbc85b17cab3e5f66de4bba102e07feeb.
- Owned databaseV1 failed setup because its filename guard rejected eight canonical names containing hyphens. All captured Docker resources/eight ports/known processes are absent23:00:03UTC.
- Separate filename repair passed3 regression cases; strict current types passed12855ms. V2 reached85-part installation but failed all27 cases with transaction deadlines and unresolved original cancellation. Source guards passed.
- V2 cleanup passed17 exact Docker queries and eight-port/known-process absence23:11:28UTC. Unknown descendants remain unproved. Original38 coverage remains19 source/2 partial/17 unmet. DiagnosticV3 also failed27/27; trace proves unwrapped savepoint queries continue after cancellation. Exact cleanup passed23:32:36UTC. Separate repair is active.
- First81/repaired85 known processes/eight ports/eight Docker queries passed absence19:56:53/20:05:26UTC. Adapter process absence passed20:00:23UTC.
- V8 trigger-bypass cases remain preserved and unexecuted. V9 failed actualTS7053; independently reviewed V10 changes one factory key exactly.
- Six fixture grants, fixed timing probe and captured worker-role deletion remain unapproved. Original HTTP completion does not prove backend completion. Full role baseline needs reviewed worker-role cleanup. V3 recorded processes/direct children/Node markers are absent22:27:31UTC; unknown descendants remain unproved.
- Shared cancellationV5 passed40 pure cases and strict types. Late callback fulfillment still permitted commit, so V5 remains unpromoted. Its corrected UTC process proof passed00:01:33UTC.
- Separate sharedV6 passed45 pure cases3113ms and strict types11902ms with exact input guards. Final callback checks force modeled rollback before commit. Known processes/direct children/markers are absent00:03:16UTC. Actual ownedV5 strict passed12989ms, but27/27 failed after228825ms. Ten failures reject actual Identifier helpers as queries;17 fail2s savepoint deadlines. All tracked timing originals settled. Source repair and separate deadline diagnosis continue.
- OwnedV5 cleanup passed17 exact Docker queries00:14:35UTC for captured projectmmhr-r1-commandapi-ccae3599. Known processes/direct children/markers and eight ports are absent00:15:10UTC. Unknown descendants and hidden cancellation sockets remain unproved. SQL parts, bodies and permissions stayed exact.
- Shared classificationV8 passed57 pure cases3729ms and strict types12485ms. Corrected external process proof passed00:32:17UTC. Failed V7 strict test typing and stale frozen proof remain saved. Unknown descendants remain unproved.
- All17 ownedV5 deadline failures come from aggregate authenticated seed setup exceeding2s; individual statements took6–985ms. No nested begin or backend lock evidence was captured. A private fixed seed capability is authorized for source implementation. Ordinary8s/2s/1s limits and atomic SQL stay exact. Genuine success remains unproved.
- PublicationV9 preserves77 genuine/81 SQL files. Actual V14 helper run failed178 passed/8 failed/186 total after17111ms. Types and lint did not run. Native Promise cancellation was overwritten; four tests also observed registry deletion too early. Known processes/direct children/markers are absent00:42:29UTC; bootstrap supplement also passed. Unknown descendants remain unproved.
- PublicationV10 fixes query controller mutation and exact-original observer tests. Root found the transaction branch still mutates native promises. V11 repair and independent review continue before a189-case helper run. V10/V15 remain unrun. Six grants, timing probe and captured worker-role DROP remain unapproved.
- Publication controlV12 failed before Node because two executable paths formed one command. V13 reached Node but used a doubled stage path before test startup. Both failed attempts remain saved. Current known-process/window/marker absence passed; V13 historical Node PID and unknown descendants remain unproved.
- CSM sourceV2 selects1643 exact additions from446 sources/1800 statements. It records419 functions,244 triggers,33 private tables and7440 edges. Same-author review passed3171 pins; independent review and actual catalog checks remain open. Catalog source checkpoint4b95f0e8907407822f65d8abcacc510d29903951c6cf6c64251327973a2e6447 cannot execute installation. Its builder and assertions remain unfinished.
- All twelve release evidence categories remain blocked. Full delivery remains incomplete.
