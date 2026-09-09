# Log
Append-only timeline. Entry format: `## [YYYY-MM-DD] <op> | <title>`.

## [2026-09-08] implementation | Prepare approved customer registration
- User approved automatic private workspace access for verified customers, without administration rights.
- Prepared migration 0101 and adapter; neither is connected to runtime registration.
- Twenty focused tests pass. Database verification is blocked by an inaccessible Docker runtime socket.
- No migration was applied and no container or volume was removed. See journal/2026-09-08.md.

## [2026-07-14] init | mmhr brain initialized
- Vault scaffolded from _brain engine. Knowledge layer = stub.

## [2026-07-26] audit | OutSail questionnaire comprehensive audit
- Fresh-account option inventory, UX/validation analysis, conversion model,
  and MatchMaker HR improvement blueprint captured in `docs/temp/`.

## [2026-08-06] research | OutSail complete public-site corpus and operating model
- Firecrawl accounted for all 566 mapped URLs, saved 562 page bodies plus
  directly referenced media, and produced a clean-room MMHR strategy brief.

## [2026-08-06] research | Founding MMHR voice transcript reviewed
- Distilled the supplied two-page transcript into the core unbiased advisory,
  buyer-matching, vendor-accountability, and referral-partner product thesis.

## [2026-08-17] instructions | Root agent instructions reduced
- Reduced `CLAUDE.md` and `AGENTS.md` from 229 lines to 116 identical lines.
- Kept stable project rules and moved temporary status authority to `STATE.md`.

## [2026-08-24] docs | Canonical v2 product baseline
- Consolidated the revised operating model into canonical README, PRD, and
  technical architecture documents.
- Made AI providers and models interchangeable and marked v1 planning records
  as legacy.

## [2026-08-24] plan | Draft v2 implementation roadmap
- Audited all 148 PRD identifiers against current source and tests.
- Sequenced the complete product into R0 through R9 with approval and recovery
  gates.

## [2026-08-24] approval | v2 implementation roadmap
- Recorded product-owner approval in the roadmap.
- Kept feature implementation gated by an approved owning module plan.

## [2026-08-24] plan | Draft R1 secure platform base
- Defined identity, permission, RLS, audit, invitation, MFA, migration, CI,
  evidence, and recovery contracts.
- Proposed a roadmap amendment for two requirements whose final evidence
  needs later domain resources.

## [2026-08-24] approval | R1 product scope and roadmap amendment
- Recorded product approval for the R1 scope and defaults.
- Moved FR-IAM-10 completion to R6 and FR-IAM-11 completion to R7.
- Kept security, engineering, operations, Git, cloud, bootstrap, and deployment
  approvals separate.

## [2026-08-25] governance | R1 named owners
- Recorded named people for the four R1 owner roles in the product documents.
- Kept security, engineering, and operations reviews as separate pending approvals.

## [2026-08-27] control | R0 local release quarantine
- Added a claim-source inventory and a fail-closed production release gate.
- Verified pages, APIs, crawler controls, image-like paths, and environment-flag denial locally.
- Kept production activation, exact claim review, owner assignments, and old deployment controls pending.

## [2026-08-27] approval | R1 security and engineering reviews
- Recorded the two owner-role approvals from the current task.
- Kept operations, Git, dependency, cloud, bootstrap, and deployment approvals separate.

## [2026-08-27] governance | Remaining roadmap owners assigned
- Assigned the finance, marketing, vendor-data, and production release roles.
- Kept role assignment separate from pending workflow and release approvals.

## [2026-08-27] approval | R1 operations review
- Assigned Rob Speciale as the temporary operations owner.
- Recorded operations approval and completed all required R1 owner reviews.
- Kept implementation, Git, dependency, cloud, bootstrap, invitation delivery, and deployment actions separately gated.

## [2026-08-27] decision | Retain blocked public placeholders
- Kept unverified public statements in source as placeholders.
- Kept exact claim review open and public release blocked.
- Recorded that the current production exposure remains an open risk.

## [2026-08-27] git | Prepare baseline stabilization branch
- Created `feature/v2-baseline-stabilization` from the dirty `develop` worktree.
- Grouped current work into release control, v2 baseline, project instructions, and project memory.
- Passed type checking, lint, 30 tests, and the production build.

## [2026-08-28] build | R1.3 grants and request-scoped access
- Added explicit table revocations, deny policies, private authorization helpers,
  field-safe functions, and request-scoped Supabase access.
- Added emergency containment guidance and migration recovery rehearsals.
- Passed targeted unit, RLS integration, migration rehearsal, type, lint, and build checks.
- Kept commit, push, pull request, merge, and deployment actions pending.

## [2026-08-27] git | Commit baseline stabilization work
- Created four focused local commits for release control, the v2 baseline, project instructions, and project memory.
- Reviewed each staged group before its commit.
- Kept local settings and generated Codex hooks outside Git.
- Kept push, pull request, merge, and deployment actions pending.

## [2026-08-27] security | Implement R1.1 secure entry controls
- Added one verified identity boundary, exact-origin Server Action checks, and deny-first protected routes.
- Added a durable entry-point matrix with completeness and source-contract tests.
- Passed all local gates, integration checks, rendered checks, and independent security review.
- Kept R1.2 blocked until the real R1.0 recovery roster and quorum exist.

## [2026-08-27] decision | Approve interim recovery pair
- Replaced the proposed three-approver pool with one named two-person pair.
- Required the other named Super Admin to approve each eligible request.
- Kept self-approval, target approval, and one-person bypasses denied.
- Kept R1.0 open for expiry, allowed actions, and lost-factor identity checks.

## [2026-08-28] decision | Complete R1.0 recovery policy
- Set a 30-minute request window and limited recovery to MFA enrollment reset.
- Approved a phone call to the pre-existing company contact as the identity check.
- Added session binding, stale-token denial, fail-closed recovery state, and external-result reconciliation.
- Unblocked R1.2 while keeping runtime recovery disabled until implementation and testing finish.

## [2026-08-28] database | Build R1.2 identity and audit foundation
- Added one additive migration for compatible identity, permission, audit, and administration data.
- Added an expiring restricted worker with committed lockout before role removal.
- Passed empty, populated, rollback, restore, access, authentication, and standard release checks.
- Kept runtime recovery, cloud migration, bootstrap, `main`, and deployment inactive.

## [2026-08-28] review | Close R1.2 pull-request findings
- Bound each normalized invitation address to its delivery address.
- Added a confirmed-email sign-up state and the 12-character sign-up rule.
- Passed all local gates, remote checks, rendered auth checks, and independent security review.
- Kept runtime recovery, cloud migration, bootstrap, `main`, and deployment inactive.

## [2026-08-30] review | Correct late R1.3 identity and journal findings
- Verified the PR 8 and PR 9 merges at `b445b2e` and `b1ffbe1`.
- Removed the invalid stable-identity-to-Auth-ID comparison.
- Added local request-wrapper tests with distinct identifiers and denial cases.
- Restored the earlier journal text and appended the later merge evidence.
- Passed type checking, lint, 112 unit tests, 48 integration tests, the production build, and independent security review.
- Kept the correction's remote review and R1.4 through R9 work open.

## [2026-08-30] authority | Full verified production delivery
- The active goal authorizes normal implementation, dependencies, Git, cloud configuration, migrations, bootstrap, releases, and deployment.
- Required checks, real identity evidence, and staging validation still apply.
- Purchases and new paid commitments remain prohibited.

## [2026-08-30] security | Verify local R1.4 permission evaluation
- Added typed permissions, explicit role defaults, caller-bound evaluation, field controls, and guarded tRPC builders.
- Passed type checking, lint, 320 unit tests, 82 integration tests, the production build, and independent review.
- Proved audit-failure rollback, role-default concurrency, migration compatibility, restoration, and emergency containment.
- Preserved dbac05f as a separate pending prerequisite. The exact remote push still needs approval after auto-review rejection.
- Kept audited commands, delegation, bootstrap, recovery, workers, remote integration, and production delivery open.

## [2026-08-30] delivery | Resume R1.4 and start R1.5
- Verified 64 restricted-worker cases, 100 recovery and migration cases, 47 boundary cases, and two real local Auth recovery flows.
- Added guarded customer, vendor, home, admin, and MFA routes with focused tests.
- Recorded the R0 control gaps and drafted the R2B CRM substrate plan.
- Kept public release, cloud migration, bootstrap, production credentials, and deployment blocked.

## [2026-08-31] evidence | Add R1.8 local security record
- Added the R1 evidence map and local check record in `docs/security/r1-evidence.md`.
- Added focused route, fail-closed, matrix, RLS, and authorization-boundary checks.
- Registered the integration evidence suite in `scripts/r1-with-local-worker.mjs`.
- Kept CI Supabase setup, cloud migration, production worker activation, bootstrap, and deployment open.

## [2026-08-31] delivery | Build R2A through R9 foundations
- Added consented lead capture, CRM tables, intake and matching, document and communication safety, contract handoff, finance controls, work queues, and release readiness contracts.
- Passed the full unit suite with 1836 tests and passed type checking, lint, matrix checks, and the production build.
- Kept target-environment integration, provider delivery, cloud migration, production deployment, and public-release evidence open.

## [2026-08-31] evidence | Add CRM and newsletter safety boundaries
- Added strict, organization-scoped CRM command validation with fail-closed database behavior.
- Added a provider-neutral newsletter consent contract and exact-origin public route with redacted responses.
- Passed 1910 unit tests, type checking, lint, integration-matrix validation, and the production build.
- Kept reviewed SQL functions, provider delivery, target-environment integration, browser evidence, and release deployment open.

## [2026-08-31] evidence | Require traceable AI and release evidence
- Added immutable provider-neutral AI run records with output hashing and explicit approval transitions.
- Tightened R9 readiness so every passed gate points to a non-empty evidence reference.
- Passed focused AI and R9 checks; full local validation remains required after this package.
- Kept durable AI storage, target-environment evidence, browser evidence, and production release open.
### 2026-08-31 — Add provider-neutral AI service boundary

Added a server-only `AiService` contract with capability and data-class checks,
schema validation, safe provider failure states, prompt-injection denial, and
mandatory human review metadata. Focused tests and type checking passed.
Database run storage, approval records, and provider evaluation remain open.

## [2026-09-04] fix | Restore Docker and guarded recovery API
- Archived two stale generated Docker socket directories and restored the Linux engine.
- Flushed guarded Docker wait headers before streaming the delayed response body.
- Passed both real recovery-MFA API cases with exact disposable cleanup.
- Passed focused guard tests, type checking, lint, matrix, secret, and production-build checks.
- Kept aggregate integration, target evidence, Git delivery, and production release open.

## [2026-09-04] test | Pass complete local integration and unit gates
- Centralized the 108-table and 93-migration test inventory.
- Kept `mmhr_create_lead` as the one approved anonymous public function.
- Passed 82 integration files with 678 tests and 271 unit files with 2,739 tests.
- Removed eight orphaned scratch volumes and 58 validated generated temporary directories.
- Kept target evidence, Git delivery, and production release open.

## [2026-09-05] fix | Dependency, CI, and finance authorization corrections
- Full dependency audit reports zero vulnerabilities after compatible updates and tested overrides.
- Reusable CI starts required local services and blocks on security audit failure.
- Finance migration 0093 preserves role authority and blocks external workspace-only writes.
- Six isolated finance integration files pass; local migration applied.
- Retired 135 verified local diagnostic assignments with audit entries and no record deletion.
- Broader verification, domain authorization review, functional interfaces, and release remain open.

## [2026-09-05] fix | Require audited MMHR RFP approval
- Confirmed and corrected external workspace-only RFP approval.
- Added explicit internal AAL2 approval and distribution permissions.
- Passed five approval and six distribution cases, including preserved legacy history.
- Preserved all 273 unit files and 2,750 passing tests after separating environments.
- Reduced measured full unit runtime from 1,066 to 412 seconds.
- Kept the new shared migration, aggregate verification, remote delivery, and release open.

## [2026-09-05] test | Verify RFP approval boundaries
- Passed 2,752 unit tests and the 63-route production build.
- Passed six approval and seven distribution integration tests.
- Verified external override denial and private, exactly scoped approval evidence.
- Found workspace-only amendment approval; correction remains open.
- Set the requested 30-minute progress updates without closing the goal.

## [2026-09-05] fix | Require MMHR amendment approval
- Added migration 0095 with action-specific authorization and exact base evidence.
- Preserved old amendment versions and immutable audit history.
- Passed nine integration and eight focused unit tests, type checking, and lint.
- Shared migrations, full integration, remote delivery, and production remain open.
- Amendment upgrade rehearsal passed: ten integration tests preserve old content and audit records while denying legacy approval replay.

## [2026-09-05] feat | Connect invitation application procedures
- Added caller-only reads and permission-controlled create, resend, and revoke.
- Bound actor identity to server authorization and kept exact-origin mutation checks.
- Passed 66 focused tests, type checking, and lint.
- Full checks, lifecycle integration, rendered administration, and release remain open.

## [2026-09-05] fix | Repair invitation SQL lifecycle
- Corrected ambiguous variable naming and invalid audit summary keys in migration 0096.
- Kept audit validation unchanged and preserved existing records.
- Passed six isolated lifecycle tests, type checking, focused lint, and the 83-file integration matrix.
- Fresh full checks and shared migrations remain pending.

## [2026-09-05] fix | Enforce live invitation identity state
- Passed ten invitation tests for pending reads, provider/session denial, and lifecycle replay.
- Passed all 2,765 unit tests and the 63-route build.
- Applied pending migrations to the validated local stack only.
- Started clean full integration verification; production remains incomplete.

## [2026-09-05] test | Extend invitation expiry and provider checks
- Passed 13 isolated invitation tests, type checking, and focused lint.
- Verified exact expiry, one audit event, replay, and deleted/anonymous provider denial.
- Corrected finance test scope; fresh integration evidence remains pending.
- Full integration session 34031 remains live. No database migrations changed.

## [2026-09-05] feature | Connect invitation creation screen
- Added the guarded creation page and permission-aware workspace navigation.
- Passed 23 focused tests, type checking, full lint, and scoped whitespace checks.
- Kept existing interface tokens, accessible controls, retry keys, and safe error feedback.
- Build and full integration sessions remain live; signed-in browser evidence remains open.

## [2026-09-05] fix | Correct page identity binding and pending acceptance
- Kept provider subjects separate from application identity IDs in page guards.
- Replaced the active-only acceptance read with verified provider data and the existing caller-bound SQL command.
- Passed 115 focused tests, eight action tests, type checking, and scoped whitespace checks.
- Full unit/build and integration verification remain live; pending MFA and browser evidence remain open.

## [2026-09-05] feature | Add authorized organization selection action
- Added exact-origin, current-permission checks before writing the hardened selection cookie.
- Passed 15 focused tests, type checking, focused lint, and whitespace checks.
- Organization listing and navigation remain unfinished. Full unit/build and integration runs remain live.

## [2026-09-05] feature | Connect caller-authorized workspace list
- Added filtered workspace forms, redacted-name handling, empty/error states, and home navigation.
- Passed 43 focused checks, type checking, focused lint, and whitespace checks.
- Prior full suite passed 2,781 tests and 64 routes. Fresh build and integration remain live.
- Signed-in browser verification and full production delivery remain open.

## [2026-09-05] fix | Pin guarded development server to loopback
- Kept the exact command allowlist and added the fixed Next hostname argument.
- Five tests, syntax, focused lint, and the integration inventory passed.
- Verified the ready development server and OS listener at 127.0.0.1:3018.
- Type and whitespace checks also passed. Browser evidence remains open; integration remains live.

## [2026-09-05] fix | Accept the real pending-access identity response
- Corrected strict extra-field rejection and passed 31 focused parser/guard tests.
- Verified anonymous workspace redirection in the in-app browser.
- Docker services are healthy; the full integration run continues creating rehearsal containers.
- Signed-in browser checks and the pending-state database read boundary remain open.

## [2026-09-05] fix | Preserve invitation acceptance retry identity
- Reused the immutable invitation ID with caller/command-scoped database receipts.
- Passed 26 focused tests, type checking, and whitespace checks.
- Duplicate invitation fields fail before provider access. Live response-loss evidence remains open.

## [2026-09-05] fix | Align workspace navigation with portal permissions
- Reused route permission constants and independently gated each portal/invitation link.
- Added clear no-access guidance and passed 28 focused tests.
- Signed-in rendered checks and invitation administration remain open.

## [2026-09-05] verification | Revalidate suites and browser authority
- Full unit/build 58712 and integration 34031 remain live.
- Browser authentication submission was rejected by approval review; explicit local-test approval is requested.
- Retained sign-in tab 3. No authentication workaround or process restart occurred.

## [2026-09-05] verification | Prove stable invitation acceptance replay
- All 13 isolated PostgreSQL invitation tests passed.
- Replay produced one membership, audit event, and receipt; another caller could not reuse the key.
- Full unit/build and integration suites remain active. Browser authentication awaits approval.

## [2026-09-05] fix | Exclude unreviewed invitation data
- Reproduced two read-policy failures, then passed all 15 isolated tests with additive migration 0097.
- Passed five migration checks, type checking, and lint; applied 0097 locally.
- Full unit/build passed 2,821 tests and 65 routes. Full integration passed 82/83 files with one old finance expectation failure.
- Fresh real-token permission suite 18020 passed all 33 tests. No production change occurred.

## [2026-09-05] fix | Provide caller-only pending setup state
- Added and locally applied migration 0098 without broadening protected identity reads.
- Passed 10 isolated database tests, 33 focused tests, four inventory checks, type/lint, and 65 build routes.
- All 33 real-token permission tests passed, including pending setup with denied workspace access.
- Browser interaction, registration synchronization, administration, and production delivery remain open.

## [2026-09-05] feature | Verify scoped invitation administration read
- Added migration 0099 and a strict permission-bound paginated read adapter; applied locally.
- Passed all 18 isolated invitation tests, 21 focused unit/inventory/migration checks, type checking, and focused lint.
- Corrected a fixture that violated last-administrator protection; retained the denial as a regression assertion.
- Administration UI wiring, full fresh integration, browser approval, remote delivery, and production remain open.

## [2026-09-05] feature | Connect invitation administration UI
- Added scoped invitation list, pagination, empty/error/loading states, and confirmed audited resend/revoke controls.
- Passed 25 UI/home tests, 15 inventory/router checks, type checking, and focused lint.
- Verified anonymous loading then sign-in redirect in the in-app browser; signed-in checks await approval.
- Build 86953 passed with 66 routes. Full lint passed; unit suite 85198 is live. No production action occurred.

## [2026-09-05] feature | Expose scoped membership commands
- Added separate role, status, and revoke router operations using existing audited commands.
- Passed 27 router tests, 70 command/inventory tests, type checking, focused lint, and a 66-route build.
- Passed all 10 disposable real-token API tests again in 99479, including exact audit-count verification.
- Full unit 85198 passed 2,855 tests across 282 files before these router changes. Member UI and production remain open.

## [2026-09-05] fix | Restrict and paginate member reads
- Reproduced unreviewed-target disclosure; fixed it in additive migration 0100 and added bounded member reads.
- Passed six isolated database tests and 25 adapter/migration/inventory checks, type checking, and focused lint.
- Applied locally; real-token compatibility suite 6135 passed all 33 tests. Inventory is 101 migrations and 85 integration files.
- Member screens, fresh full integration, browser approval, remote delivery, and production remain open.

## [2026-09-05] feature | Connect member administration screen
- Added /members with paginated reads and confirmed role, status, and revoke controls.
- Passed 27 UI/home tests, 20 router/inventory tests, type checking, and focused lint.
- Verified anonymous loading then sign-in redirect. Signed-in evidence remains approval-gated.
- Build 47981 passed with 67 routes. Full lint/unit 75646 and integration 42302 are live. No production action occurred.

## [2026-09-05] fix | Match member role controls to active status
- Removed suspended-member role actions while retaining authorized restoration and revocation.
- Passed 21 member tests, type checking, focused lint, and the 67-route build 72701.
- Full unit 75646 and integration 42302 remain live. Strict R9 release check failed with all 12 categories open, as expected.

## [2026-09-05] verification | Prepared identity synchronization boundary
- Added missing-provider-response rejection and registered the unused adapter boundary.
- Passed 28 focused tests, lint, and type checking. The synchronization RPC and sign-in wiring remain absent.
- Full lint/unit 75646 passed 287 files and 2,909 tests. Integration 42302 remains live with unchanged migration inventory.

## [2026-09-05] fix | Reject unconfirmed sign-out
- Reproduced three sign-out failure cases, then passed all 27 authentication/home tests.
- Focused lint, type checking, and whitespace checks pass. Build 42911 and integration 42302 remain live.
- Preserved sign-out scope and exact-origin checks. No production or database change occurred.

## [2026-09-05] checkpoint | Stop development for product clarification
- Organization endpoint checks passed: 35 router tests, 23 inventory/router tests, type checking, lint, and 67-route build.
- Preserved all local edits without commit, push, or deployment. Organization UI and real router evidence remain open.
- Paused the progress heartbeat. User requests product discussion before further development; automatic goal continuations must not resume implementation.
- Existing integration 42302 may finish naturally. No replacement suite or new feature should start during the discussion.

## [2026-09-07] checkpoint | Prepare reviewed GitHub backup
- Created checkpoint/pre-workflow-review-2026-09-07 from the unchanged feature HEAD.
- Passed type checking, lint, 2,957 unit tests, build, secret scanning, dependency audit, and whitespace checks.
- Recorded the clarified workflow and open requirements in docs/CHECKPOINT-2026-09-07.md.
- Excluded local settings and hooks. Integration and signed-in browser success remain unverified.
- Commit/push verification belongs to this task; development, merges, and releases remain stopped.

## [2026-09-08] fix | Correct canonical R1 evidence references
- Replaced two missing R9 and R0 paths in `docs/security/r1-evidence.md` with the existing canonical artifacts.
- Added a regression test in `src/server/auth/r1-security.test.ts`; focused security and inventory checks passed 9 tests.
- Docker remains unavailable, so database rehearsal and runtime wiring stay gated.

## [2026-09-08] fix | Mark historical R1 integration evidence
- Labeled the earlier 82-file and 678-test integration result as historical.
- Added the current 86-file inventory and Docker engine boundary to `docs/security/r1-evidence.md`.
- Added a regression assertion; focused security and inventory checks passed 10 tests.

## [2026-09-08] feature | Add route-specific marketing metadata
- Added canonical, Open Graph, and Twitter metadata for every stable marketing route and dynamic blog and case-study page.
- Added metadata helper, route coverage tests, and dynamic fallback metadata.
- Full unit suite passed 291 files and 2,977 tests; full lint, type checking, and the 67-route production build passed.
- Database rehearsal and production release evidence remain blocked by the unavailable Docker engine.

## [2026-09-08] fix | Include dynamic public routes in sitemap
- Added generated blog and case-study paths to the public sitemap.
- Added sitemap assertions for dynamic entries and route metadata coverage.
- Sitemap tests, type checking, lint, and the 67-route production build passed.

## [2026-09-08] test | Guard R1 evidence artifact references
- Added a check that every local path in `docs/security/r1-evidence.md` resolves to an existing artifact.
- The R1 security test passed 7 tests and focused lint passed.

## [2026-09-08] security | Require complete R9 review domains
- Passed security reviews now cover authorization, RLS, audit, worker, privacy, dependencies, secrets, and deployment.
- Partial failed reviews remain valid for tracking unresolved findings.
- Focused R9 and marketing-content checks passed 14 tests; type checking, lint, and whitespace checks passed.

## [2026-09-08] fix | Require marketing-content source traceability
- Marketing content now requires a bounded source reference and capture timestamp before approval or publication.

## [2026-09-08] audit | Review R2A lead boundary
- Confirmed strict work-email, phone, consent, and idempotency validation.
- Confirmed durable public rate limiting is not yet implemented; no unsafe in-memory substitute was added.
- Live lead and registration rehearsal remains gated by the unavailable database engine.
- Missing source reference and capture time have regression tests.

## [2026-09-08] goal | Resume with verified customer workflow priority
- Reviewed the full active goal and saved `.codex/plans/goal-full-project-completion.md` as its execution supplement, under 4,000 characters.
- Reconciled the PRD, README and roadmap with approved self-service registration, all masked options and five initial RFP selections.
- Preserved the checkpoint and all mandatory R0 through R9 scope. Existing goal authorization covers normal project actions; release evidence is still required.
- Fixed the interrupted Supabase syntax, SQL-result mapping and registration rejection handling. The debugger workflow supplied red-to-green regression evidence.
- Prepared an aggregate lead-write ceiling with RLS and atomic rejection; per-client network protection remains a separate release requirement.
- Passed 51 focused tests, 2,997 full unit tests, type checking, lint, the 67-route build, migration ledger validation and the 87-file integration inventory.
- Both local and elevated integration startup failed because Docker's engine was absent. Seven new cases did not execute; migration 0102 remains unapplied.

## [2026-09-08] security | Review registration and retry safe Docker recovery
- Added explicit caller-subject consistency in the prepared customer setup RPC, with a red-to-green static regression.
- The focused identity, registration, lead migration and security inventory checks passed 53 tests. Type checking and focused lint passed.
- A guarded, approved close of the verified frozen Docker UI allowed backend processes to start without a data reset.
- The engine remained unresponsive. Lead rehearsal 63348 timed out after 240 seconds and skipped all seven cases.
- Runtime registration wiring and live database evidence remain open. Do not infer completion from static checks.
- Reviewed 38 collected registration cases with real independent connections, observed writer blocking, caller mismatch and historical-authority denial checks.
- Final focused checks pass 54 tests. The post-review full type check and focused lint pass; database execution remains unverified.

## [2026-09-08] fix | Protect intake revisions before customer API wiring
- Prepared migration 0103 with bounded data, lifecycle guards, applicable-requirement submission checks and private-writer runtime denial.
- Kept existing AAL2 write authorization and immutable history. Read/resume, customizations and customer-write policy remain open.
- Reproduced seven adapter defects in final review, then passed 40 focused intake checks, type checking, lint and the 67-route build.
- Collected 12 real database cases without startup hooks. Docker blocks execution; the migration remains unapplied.
- Full unit run exposed the registration test's direct database import. The test now uses the existing isolated pool; all 47 boundary checks pass.
- Full unit rerun 34258 subsequently passed 293 files and 3,024 tests.

## [2026-09-08] feature | Prepare scoped intake reads
- Reviewed the full goal and supplement. No additional scope change was needed.
- Added migration 0104, scoped list/detail adapters and read-only tRPC queries without new write authority.
- Corrected the independent review's stored-data limit finding and preserved padded and Unicode text.
- Final focused checks passed 58 tests. Type checking, lint and the 67-route build passed.
- Eleven database cases collect; Docker prevents execution. The migration remains unapplied.
- Full unit session 16640 passed 296 files and 3,081 tests. The final Unicode regression passes separately.
- Customer forms, customer-write policy and customizations remain unfinished.

## [2026-09-08] feature | Prepare requirement creation and revision history
- Added structured/custom requirement creation and strengthened existing metadata updates.
- Prepared migration 0105 with scoped AAL2 commands, parent-state locks and immutable snapshots.
- Kept generated ledger name `0105_0105_r3_requirement_commands`; removed the unused agent-authored duplicate draft.
- Corrected review findings without applying the migration or changing customer authentication policy.
- Forty-nine focused tests, type checking, lint and the 67-route build pass. Fifteen database cases collect.
- Full unit 43611 passed 298 files and 3,129 tests. Docker prevents SQL execution.
- Final review added safe exact legacy update replay before new-write validation; 50 focused tests pass.
- The final wrapper passed a separate read-only review. Sixteen database cases collect; no test process remains running.

## [2026-09-08] feature | Connect customer saved-intake views
- Reviewed the full goal and supplement; no scope change was needed.
- Added authorized saved-intake list/detail reads, bounded pagination and explicit loading/error/empty states.
- Corrected loading inventory and JSX error-handler findings; kept all write controls absent.
- Final focused checks pass 73 tests; full unit 90113 passes 300 files and 3,155 tests.
- Type, lint, the 67-route build, integration inventory and tracked-file secret scan pass.
- Development startup lacks MIGRATION_DATABASE_URL. Port 3000's system-service listener was untouched.
- Local production preview on port 3007 shows the release block without console errors.
- Authenticated browser/database verification remains open. No migration, Git or production action occurred.

## [2026-09-08] feature | Prepare scoped requirement reads and verification branch
- Added active-only scoped reads with explicit safe projection and legacy data preservation.
- Prepared migration 0106 and eight collected database cases; no SQL execution is verified.
- Final focused checks pass 77 tests; full unit 33155 passes 302 files and 3,217 tests.
- Type, lint and build pass; the build preceded the final generic error text.
- Inventory checks pass for 107 migrations and 90 integration files.
- Preserved the checkpoint and created codex/full-delivery-verification at the same HEAD.
- Fresh origin/develop remains 103 commits behind the checkpoint. Draft PR preparation is in progress.
- Correct unsupported equal-rate claims before committing. No push, merge or production action yet.

## [2026-09-08] verification | Commit workflow preparation and correct public claims
- Commit a80b643 preserves the reviewed customer/lead workflow package on the verification branch.
- Removed only a verified stale empty Git lock after fresh process and timestamp checks.
- Corrected unsupported equal-rate claims in marketing, Pulse and retained gallery text without removing designs.
- Public and release-control focused checks pass 49 tests; the staged secret scan passes for 1,044 files.
- Build 59165 and type/full lint 84986 pass. Both Pulse routes retain the production release block.
- Full unit 4939 passed 3,239 tests and failed one omitted-error documentation assertion.
- Restored the recorded Docker error; all seven focused security-evidence tests pass afterward.
- Remote unit/database verification and public claim approval remain open. No production action occurred.

## [2026-09-08] delivery | Open draft verification PR 10
- Pushed codex/full-delivery-verification at 0011ad89168517b37014dd4fbd5e241361dbec17; the remote SHA matches.
- Draft PR https://github.com/rspeciale0519/mmhr/pull/10 targets develop and preserves the checkpoint.
- CI run 34301817813 started disposable integration verification. Standard checks and preview remain pending.
- No merge or production release occurred. Keep release gates closed and inspect actual checks and reviews.

## [2026-09-08] fix | Reject empty Auth provider success results
- The debugger regression reproduced sign-up success without a returned user.
- Sign-up now requires a user; sign-in requires both user and session. Existing permission checks remain unchanged.
- Full local unit 63733 passes 304 files and 3,245 tests; 94 focused checks, type, lint and build pass.
- Independent review found no material defect. No customer setup or identity synchronization is wired yet.
- Current remote standard checks and migration application pass at 0011ad8; integration remains running.
- Hold the next push until that run finishes. Verify the subsequent head before any merge or release.

## [2026-09-08] feat | Connect saved customer requirements
- The complete goal and supplement need no changes. Auth guard 0f77ad3 remains local only.
- Customer details now read active requirements with scoped pagination and safe saved-answer output.
- Either known read failure hides both sections. No writes, permissions or migrations changed.
- Focused run 11356 passes 149 tests, type checking, full lint and the 67-route build.
- Independent review found no remaining defect. Full unit 62065 and remote integration remain active.
- Browser checks confirm only the release block, not authenticated screen behavior.
- Keep the new package local until current remote integration findings are collected. No release or merge occurred.
- Final full unit 62065 passes 305 files and 3,263 tests. Staged secret scan passes for 1,047 files.

## [2026-09-08] fix | Prepare account setup and repair CI database failures
- Requirement view committed as 09c6b35. Auth setup now composes verified identity and private workspace commands locally.
- Strict cookie writes and explicit cleanup uncertainty preserve failure boundaries. Independent Auth review passes.
- CI 34301817813 failed 13 integration tests; 812 passed. Standard checks passed at 0011ad8.
- Additive migration 0107 fixes the audit writer without widening safe summaries or changing historical records.
- Corrected inventory ordering and invalid test fixtures. Changed integration cases collect, but require new live execution.
- Type, lint, 67-route build and focused checks pass. Full unit 27488 remains active.
- Keep release controls closed. Commit and push only reviewed fixes, then obtain complete new-head CI.
- Full unit 27488 passes 310 files and 3,298 tests. All local standard gates pass; remote database repair remains unverified.
- Committed database repairs as 9d1abba and Auth composition as 7ba545f; pushed the exact verified head to draft PR #10.
- Fresh CI34305894008 runs complete checks. Watch session7417 follows it; no merge or production action occurred.

## [2026-09-08] implementation | Prepare customer draft save boundary
- Full goal review found no required change. Added intake.draft.save and a caller-only customer draft operation.
- Corrected audit summaries, recovery fencing, immutable history and the legacy AAL2 viewer write bypass.
- Focused checks pass;109 migrations and91 integration files are inventoried. Full rerun and final build remain pending.
- Independent source review found no remaining SQL/adapter defect. No new-head database or browser completion is claimed.
- See journal/2026-09-08.md and docs/security/r3-customer-draft-save.md. No merge or production action occurred.
- Final full rerun passes3,382 tests across313 files. Build88492, type, lint and staged secret scan pass.
- All21 customer draft database cases collect. Remote CI34305894008 remains active at7ba545f; no database result is claimed for0108.
- Committed the reviewed backend package as cd1772e. Customer form work is separate and unverified; no push or merge yet.

## [2026-09-08] implementation | Customer form wiring and verified prior database run
- Customer page new/edit access checks pass65 tests; form correction and browser verification remain open.
- CI34305894008 at7ba545f passes standard checks and90 database files /826 tests.
- Pushedcd1772e; new CI34308802670 tests the draft-save backend. Keep it intact before another push.
- Independent review found a customer portal-revocation read gap; additive customer-only read checks are in progress.
- See journal/2026-09-08.md. No merge, production action or full-goal completion.

## [2026-09-09] implementation | Customer intake form verification
- New/edit page checks pass 65 tests; final form checks pass 14 tests.
- Type, full lint, final 67-route build and integration inventory pass. Full unit58223 remains active.
- Isolated browser checks pass pending, error, retry, confirmation and narrow layout checks; real Auth/database evidence remains open.
- A second review confirms current reads meet the approved next-request portal revocation contract.
- The incomplete optional read-wrapper draft is preserved in session scratch; no new read migration is integrated.
- CI34308802670 runs atcd1772e. Preserve its result before another push. See journal/2026-09-09.md.
- Final full unit58223 passes 314 files /3,423 tests. All relevant local standard gates pass; prepare the focused reviewed UI commit.
- Committed UI/evidence asf791eb3 after a passing staged secret scan for1,068 files. Keep active CI34308802670 intact before pushing this head.

## [2026-09-09] implementation | Prepare customer requirement saving
- Full goal and supplement reviewed without changes. Added scoped customer requirement saving with migration0109 and preserved legacy internal AAL2 restrictions.
- Focused145 and command31 tests, type, full lint,67-route build and92-file integration inventory pass. New24 database cases collect; actual execution remains pending.
- CI34308802670 ended with844 passes and3 outdated assertion failures. Exact corrections include current role versions, migration audit counts and safe intake audit summaries.
- Independent review confirmed the corrections and found no remaining SQL or TypeScript defect. Full unit34037 remains active; see journal/2026-09-09.md.
- Final unit34037 passes317 files/3,471 tests. Final fixture type/lint and staged secret scan1,076 pass. Prepare the reviewed package commit and fresh CI.
- Committed04cf396 and pushed both customer packages; exact remote head confirmed. Fresh CI34312014214 runs; preserve its result. Checkpoint unchanged. Customer requirement UI remains next.

## [2026-09-09] implementation | Connect customer requirement forms
- Full goal reviewed without changes. Added separate action-gated new/edit navigation and safe requirement entry with preserved saved answers.
- Focused138, final form26, navigation44, type, full lint, build14342 and integration inventory92 pass. Full unit62343 and final wording build8792 remain active.
- Independent review corrected deterministic rejection handling without clearing prior uncertainty. Isolated browser checks pass; real authenticated saving remains unverified.
- Keep CI34312014214 intact before pushing. Prepare the reviewed UI commit after final gates and scanning. See journal/2026-09-09.md.
- Final unit62343 passes319 files/3,542 tests. Final build8792 passes67 routes. All local gates pass; prepare exact staging, scan and commit.
- Committed13 reviewed files asab1ec96 after secret scan1,080 passed. One local commit awaits push after backend CI34312014214 completes. Full goal remains active.

## [2026-09-09] implementation | Add customer submission backend
- Backend CI34312014214 passes92 files/871 database tests. Pushedab1ec96; fresh CI34315077521 runs, with standard checks passed.
- Added separate customer submission action and RPC0110, strict adapter/router, immutable submitted-answer references and legacy capture. Focused131, type, full lint, build74595 and inventory93 pass.
- Full unit5732 runs. New22 database cases collect; three fixture setups are under correction before final review. Local Docker probes returned no usable engine result.
- Keep goal active. Submission UI and masked-option workflow remain open. See journal/2026-09-09.md.
- Final unit5732 passes322 files/3,603 tests. Corrected fixture type/lint pass; final review and exact staging/scan remain. No local application gate is running.
- Final independent review confirms fixture corrections; malformed UUID expectation is repaired with extra revision cases. Secret scan1,088 passes; final fixture lint/type79404 runs before commit.
- Final fixture lint/type79404 passes. All local gates are complete; prepare the reviewed submission commit.
- Committed21 reviewed files as1703c6b after secret scan1,088 passed. One local commit awaits CI34315077521 completion before push. Customer confirmation UI is next; full goal stays active.

## [2026-09-09] implementation | Connect customer submission confirmation
- Full goal and supplement reviewed; no change needed. Connected explicit confirmation with separate authority and safe retries.
- Focused188 and final component/navigation38 pass. Type, full lint, build46081 and inventory93 pass. Full unit93856 and final test checks4087 run.
- Isolated browser checks pass desktop/mobile/tablet and error/retry states; no live database workflow is claimed. See journal/2026-09-09.md.
- Scope audit confirms candidate, matching, deal command and RFP recipient gaps. The existing deal product FK is correct. Full goal stays active.
- Full unit93856 passes324 files/3,638 tests. Final focused38 includes three additional navigation cases; final type/lint4087 passes. Prepare exact13-file staging/scan/commit.
- Committed4abfe42 after1,092-file secret scan. Two commits await CI34315077521 before push. Exact-current-suite full unit63111 runs; next vendor-scope package is read-only analysis.
- Final full unit63111 passes324 files/3,641 tests. CI34315077521 passes92 files/871 integration tests; pushed1703c6b and4abfe42. New CI34318285955 runs at4abfe42, including0110. No merge or release.

## [2026-09-09] implementation | Separate candidate customer and provider scope
- Prepared additive0111, legacy compatibility and five vendor-fact query corrections. Existing intake authority and evidence remain intact.
- Full unit87722 passes325 files/3,650 tests. Type, lint, build46959, final fixture checks91673 and inventory95 pass.
- Fixed draft helper type and exact source classification; 51 boundary cases pass. Independent SQL and fixture reviews found no remaining defect.
- Four new database cases collect but have not executed. Prepare exact staging/scan/local commit; preserve active CI34318285955 before push.
- All approved masked-option publication and up-to-five selection remain open. No merge, cloud migration or release. See journal/2026-09-09.md.
