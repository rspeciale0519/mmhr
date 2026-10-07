# MMHR MVP: Complete UI/UX and Backend Roadmap

| Field | Value |
|---|---|
| Date | October 6, 2026 |
| Version | 1.1 |
| Status | **VERSION 1.1 SAVED: the owner approved the October 6 review modifications. Implementation starts only on the owner's explicit instruction; see Section 14.** |
| Requested result | A usable brokerage application with a complete, consistent public and logged-in experience |
| Priority | Core features first; complete visual design next; further features and security improvements after launch |
| Approval owner | Product owner |
| Delivery order | Six phases, P0 through P5; Launch Candidate A after P2, Launch Candidate B after P3 |
| Source authority | Latest user direction; [PRD](../../docs/PRD.md); [TECH_STACK](../../docs/TECH_STACK.md) |
| Review basis | Source verification of October 6, 2026, approved by the owner; see Sections 2 and 16 |

## 1. Outcome and scope decision

Build the smallest complete application that MMHR can use to guide a customer from registration through vendor selection and contract handoff.
Staff must run this process through normal screens.
Customers and vendors must see their own work, status, and next action.
The application must save results and recover from normal errors.

“Backend” covers both the staff administration interface and the server, data, and service work behind every launch screen.
This plan covers the entire proposed MVP experience.
It also records which full-platform features remain after launch.

MMHR supports HR software selection.
It does not manage individual employee HR records.
Financial-record management and private document storage are outside this MVP, as the user directed.
Software prices, quoted costs, and customer software budgets remain comparison inputs.
Contracts remain selection, introduction, status, date, and reference records.
The customer and vendor negotiate and sign directly.

The October 3 documents require all mandatory platform features before live use.
The user's later instruction replaces that delivery order with a focused MVP.
This roadmap proposes the exact replacement scope.
Approval must precede application changes and alignment of the older documents.
No requirement is marked complete merely because it moves outside the launch scope.

### Launch candidates

Version 1.1 adds a launch cut line after P2.
The PRD's MVP milestone already places demos, proposals, and contracts in the manual pilot procedure.
P3 brings them into the application because the code exists. P3 must not delay the first launch.

| Candidate | Software scope | Manual scope | Release condition |
|---|---|---|---|
| Launch Candidate A | P0, P1, P2, the P4 design pass on their screens, and P5 | Demos, proposals, selection, and contract handoff follow the pilot operating procedure | All P5 evidence for the exposed Candidate A surface |
| Launch Candidate B | Candidate A plus P3 and its design pass | None | All P5 evidence for the exposed Candidate B surface |

Launch Candidate A is the target.
P3 ships inside Candidate A only when P3 is locally verified before Candidate A verification starts.
Otherwise P3 becomes the first post-launch increment.
The pilot operating procedure must cover the manual scope of the shipped candidate before staff acceptance.

## 2. Evidence and implementation starting point

The review covered canonical documents, prior plans, the requirement audit, current routes, core commands, and Pulse styles.
The findings below come from source inspection.
They do not establish current browser acceptance or release readiness.

| Area | Existing work to reuse | Work still needed |
|---|---|---|
| Identity and access | Registration, sign-in, organization access, invitations, staff MFA, server guards | Complete account recovery decisions and a consistent account experience |
| Customer intake | Drafts, revisions, validation, submission, requirement persistence | Replace generic answer editors with a guided questionnaire |
| Evaluation | Approved publication, masked comparisons, saved selections, disclosure records | Complete real catalog approval and a clear customer decision experience |
| RFP and responses | Draft, approval, portal delivery, vendor reply, clarification, staff review | Connect the screens into one case with clear status and next actions |
| Demos, proposals, contracts | Connected routes and commands with role-specific operations | Remove repeated case selection and verify the complete sequence |
| Staff operations | CRM commands, tasks, evaluation review, audit viewer | Build a useful daily dashboard, case list, and case workspace |
| Visual design | Pulse public design, existing UI components, two themes | Apply one navigation, typography, form, table, and feedback system |
| Release | Existing checks, release controls, operating procedure | Obtain current evidence for the actual launch candidate |

Relevant source anchors:

- [Staff home](<../../src/app/(admin)/admin/page.tsx>) currently presents navigation links.
- [Shared home](<../../src/app/(app)/home/page.tsx>) lacks a complete role-specific work summary.
- [Intake form](<../../src/app/(app)/customer/intake-form.tsx>) uses generic label, answer, and type controls.
- [Root router](../../src/server/trpc/root.ts) already registers many workflow procedures, including tasks and finance surfaces.
- [Contract command](../../src/server/commands/contract-handoff-portal.ts) supports the contract handoff workflow.
- [Pulse styles](../../src/designs/pulse/styles.css) and [root layout](../../src/app/layout.tsx) show the current design and typography differences.

The working directory contains substantial prior changes.
Preserve those changes and their evidence.
Isolated test counts and the October 3 audit cannot establish a current completion percentage.
Current whole-application checks and hosted acceptance remain unverified or incomplete.

### October 6 review baseline

An independent source review on October 6, 2026 confirmed the route tables, the staff home link list, the generic intake editors, the absent recovery route, and the registered documents and finance routers.
It recorded these results on the dirty worktree:

| Check or measure | Result |
|---|---|
| `npm run type-check` | Pass, exit 0 |
| `npm run lint` | Pass, exit 0 |
| Unit, integration, build, and browser checks | Not run |
| Modified tracked files | 119 |
| Untracked files | 757 |
| Commits ahead of `develop` | 123 |
| Unpushed commits | 0 |

The review also found three facts that change this plan:

- The data has three case keys. Workspaces key on the intake. Deals carry no intake link. Demo, proposal, and contract tables key on the deal, and customer routes key on the intake query parameter.
- The root layout loads Geist. Pulse specifies Geologica and Martian Mono.
- The shared UI folder holds four shadcn/ui components: button, card, input, and label.

These results are dated evidence for P0. They do not establish runtime acceptance.

## 3. Product scope by domain

“Launch” means a required part of this proposed MVP.
“Later” means retained product work after launch, subject to a separate implementation plan.
“Excluded” means outside the user's requested product scope unless the user later restores it.
Requirement groups below identify scope; they do not certify complete coverage of each group.
The Launch rows for demos, proposals, and contracts belong to Launch Candidate B. Launch Candidate A handles them through the pilot operating procedure. See Section 1.

| Domain | Launch | Later or excluded | PRD mapping |
|---|---|---|---|
| Identity and permissions | Accounts, company workspaces, required invitations, existing role controls, account support | Impersonation and expanded delegation tools later | FR-IAM |
| Public website | Approved public pages, contact and registration, consent, functioning advertised resources | Full CMS and expanded content programs later | FR-MKT |
| Customer and vendor records | Organizations, products, contacts, relationships, owners, active deals, activity, scoped search | Broad exports, advanced duplicate workflows, renewal automation later | FR-CRM |
| Intake | Guided needs questionnaire, drafts, revisions, review and submission | Configurable questionnaire builder later | FR-INT |
| Evaluation | Case stages, candidates, approved matrix, initial selections, decisions, staff guidance | Advanced collaborative scorecards and live multi-scorer tools later | FR-EVL |
| Matching integrity | Approved deterministic rules, explanations, masking, freshness, commercial independence | Additional scoring tools later | FR-MAT |
| Vendor evidence | Manual fact maintenance, source references, review, publication, version and freshness visibility | Automated acquisition and AI extraction later | FR-VND |
| RFP | Staff drafting, MMHR approval, versioned portal issue, recipients, deadline and acknowledgment | Advanced template automation later | FR-RFP |
| Responses | Structured replies, drafts, submission, staff review, clarifications, approved customer view | Inbound email parsing later; private file intake excluded | FR-RSP |
| Demos | Availability, time zones, staff-confirmed sessions, outcomes and feedback | Calendar synchronization and automatic scheduling later | FR-DMO |
| Proposals | Structured quote versions, cost assumptions, approved comparison and selection | Advanced pricing analysis later | FR-PRP |
| Contracts | Selection, introduction, reported outcome, dates, references and history | Legal negotiation and signing remain outside MMHR | FR-CTR |
| Finance | No finance workspace required for launch | Commission ledgers, invoices, payments, collections and financial reports excluded | FR-FIN; FR-RPT-01 |
| Customer success | Staff can record the next follow-up with an existing task | Onboarding plans, renewal schedules, reactivation and outcome programs later | FR-CSM |
| Tasks and communications | Owners, due dates, blockers, queues, core notifications, delivery failures and retry | Generated project plans and advanced automation later | FR-WRK; FR-CMN |
| Documents | Structured data and reference fields only | Private uploads, storage, scanning, parsing and private document search excluded | FR-DOC |
| AI | No launch dependency | Reviewed assistance after the manual workflow works | FR-AI |
| Administration | Required access, operational records, active templates, review queues and audit view | General configuration builders later | FR-ADM |
| Reporting and analytics | Active cases, stage counts, overdue work, pending reviews, basic journey events and service errors | Advanced pipeline, vendor, customer and business reporting later | FR-RPT-02 through FR-RPT-05; FR-ANL |

Do not expose excluded operations through routes, APIs, background jobs, or navigation in the launch configuration.
Removing a menu item alone is insufficient.
Preserve existing code, data, and failed evidence.
Inspect dependencies before isolating excluded modules so the core contract and proposal flows still work.

## 4. The complete launch journey

1. A visitor reads approved service information and registers with work contact details.
2. The customer verifies identity and enters the correct company workspace.
3. The customer saves a guided software-needs assessment.
4. The customer reviews and submits the assessment.
5. Staff receives a case with an owner, status, next action, and due date.
6. Staff reviews the needs and publishes an approved comparison.
7. The customer compares all published options and selects up to five initial contenders.
8. Staff discusses the requirements and records the permitted identity disclosure.
9. Staff prepares and approves the RFP before portal delivery.
10. Each invited vendor reads its issued version and submits a structured response.
11. Staff reviews responses and manages clarifications before customer publication.
12. Staff coordinates demos and records outcomes.
13. The customer compares approved proposals and records a selection.
14. Staff records the customer-to-vendor introduction.
15. Staff records the reported contract outcome and any next follow-up.

The sequence must allow valid revisions, pauses, withdrawals, and cancellations.
Existing workflow rules control allowed transitions.
Do not replace flexible evaluation with a new rigid state engine.

Vendor identities remain masked until the required discussion and recorded disclosure.
Show every published eligible option; five is the initial selection limit, not a display limit.
Keep commission information outside recommendation calculations.
MMHR approval remains mandatory for RFP issue and response publication.
Preserve the existing two-person-team policy, with separate staff approval switched off where configured.

## 5. Screen inventory and acceptance

Route patterns marked **proposed** are planning suggestions.
Confirm them against existing routing before implementation.
Reuse existing pages and links where practical.
Keep existing query parameters and case links working.

### Public website

| Surface | Route or route family | Required experience |
|---|---|---|
| Home | `/` and `/designs/pulse` | Pulse design, approved claims, clear customer entry, accurate service explanation |
| Product and services | `/platform`, `/services`, `/broker-model` | Explain the real brokerage process, customer benefits, fees and disclosures using approved wording |
| Company and help | `/about`, `/faq`, `/contact` | Clear contact route; validated form; saved lead; truthful confirmation |
| Trust and policies | `/transparency`, `/privacy`, `/terms` | Match actual ranking, sharing, consent and contract practices |
| Editorial content | `/blog`, `/blog/[slug]`, `/case-studies`, `/case-studies/[slug]` | Approved content, correct metadata, useful empty states; no invented results |
| Resources | `/resources`, `/resources/requirements-builder`, `/resources/partner-finder`, `/resources/hris-landscape-report` | Each advertised action works and follows identity, consent and lead rules |
| Partners | `/partners/software-vendors`, `/partners/brokers-consultants`, `/partners/pe-vc` | Clear audience, approved promise, working contact or registration action |
| Design gallery | `/designs`, `/designs/[slug]` | Preserve existing gallery and Pulse reference |
| Consent and newsletter | Shared public components | Record choices accurately; do not show delivery success before a real result |

Keep unfinished optional resource or newsletter actions unavailable rather than advertising an incomplete service.
Record each deferred action in the launch inventory.
A resource can link to an approved public asset without adding private file storage.
Release existing content only after the required content approval.

### Identity and shared application screens

| Surface | Route or route family | Required experience |
|---|---|---|
| Registration and sign-in | `/sign-up`, `/sign-in` | Clear fields, work-email rules, confirmation, validation, preserved input and useful recovery |
| Verification and access | `/mfa`, `/pending-access`, `/agentid/complete-registration` | Clear reason, permitted next action and return to the intended destination |
| Account recovery | **Proposed** recovery/reset and confirmation-resend screens | Use existing identity-provider flows; handle expired links and unknown addresses safely |
| Role home | `/home` | Correct role landing page and relevant next action |
| Workspace selection | `/workspaces` | Company names and role context; no prominent technical identifiers |
| Members and invitations | `/members`, `/invitations`, `/invitations/new`, `/invitations/accept` | Clear access scope, invitation state and expired or invalid invitation recovery |
| Account menu | Shared shell | Profile context, theme choice, workspace change and sign-out |

Self-service password recovery and confirmation resend are proposed launch decisions.
They replace the unresolved support choices in the earlier checklist if this roadmap is approved.
Use current provider capabilities and existing staff MFA policy.
Do not build another identity system.

### Customer portal

| Surface | Route or route family | Required experience |
|---|---|---|
| Overview | `/customer` | Active assessment or case, stage, owner, next action, due items and saved work |
| Needs assessment | Current `/customer` create/edit views | Guided sections, progress, save/resume, review, missing-field links and revision status |
| Comparison | `/customer/evaluation?intake=...` | Approved matrix, masking, evidence, unknown values, selection count and saved choices |
| RFP and responses | `/customer/rfp?intake=...` | Request version, deadlines, approved responses, clarifications and clear pending states |
| Demos | `/customer/demos` | Availability, time zone, confirmed sessions, feedback and outcomes in the current case |
| Proposals | `/customer/proposals` | Comparable approved quotes with billing basis, assumptions, unknowns and versions |
| Selection and contract | `/customer/contracts` | Selected proposal, handoff state, introduction details, reported outcome and history |

The questionnaire covers company context, current systems, requirements, constraints, customization, software budget, timing, stakeholders, and decisions.
Use domain labels, short explanations, and suitable controls.
Keep advanced fields optional unless the current rules require them.
Do not ask customers to define field names or data types.

### Vendor portal

| Surface | Route or route family | Required experience |
|---|---|---|
| Request inbox | `/vendor` | Assigned requests, response status, deadlines and clear next action |
| Request and response | `/vendor/response?recipient=...` | Correct approved request, acknowledgment, saved draft, submission and revision history |
| Clarifications | Existing response workflow | Linked question and answer, pending review, deadlines and permitted visibility |
| Demos | `/vendor/demos` | Relevant requests, confirmed sessions, time zones and results |
| Proposals | `/vendor/proposals` | Structured quote entry, versions, assumptions and submission status |
| Contract handoff | `/vendor/contracts` | Permitted selection, introduction and reported outcome information |

Vendors must not see competing submissions or unrelated customers.
Display only the information allowed by the recipient, organization, and workflow state.

### Staff and administration

| Surface | Route or route family | Required experience |
|---|---|---|
| Today | `/admin` | Assigned cases, overdue work, pending approvals, upcoming demos and failed deliveries |
| Case list | **Proposed** `/admin/cases` | Search and filter by customer, owner, stage and due date; clear empty states |
| Case workspace | **Proposed** `/admin/cases/[dealId]` | Summary, needs, candidates, RFP, responses, demos, proposals, contract, tasks and activity |
| Vendor participant invitation | Case workspace action; existing invitation procedures | Staff invite the vendor participant from the case; RFP notices require an active membership with a verified email |
| Customers and contacts | **Proposed** `/admin/customers`, `/admin/contacts` | Create, find and update permitted records; link contacts and relationships to cases |
| Vendors and products | **Proposed** `/admin/vendors` | Manage permitted organizations, products, contacts, facts and case links |
| Evaluation operations | `/admin/evaluations` | Keep existing review, publication, disclosure, RFP and clarification actions within case context |
| Evidence review | `/admin/vendor-evidence` | Source, scope, date, freshness, review decision and publication result |
| Demos, proposals, contracts | `/admin/demos`, `/admin/proposals`, `/admin/contracts` | Reuse existing operations; retain case context, ownership and history |
| Tasks | `/admin/tasks`, `/admin/tasks/[taskId]` | Assign, prioritize, set due dates, record blockers, complete and review history |
| Access and audit | Shared membership pages; `/admin/audit` | Existing permission checks, scoped event search and clear denied states |
| Essential settings | **Proposed** `/admin/settings` | Only launch-required settings; reuse existing commands and fixed templates |

The case identifier is the deal. Each submitted intake has exactly one deal. See Section 7.
The staff case list needs an authorized view across the staff member's permitted cases.
Do not use an unrestricted database connection to bypass organization rules.
Basic daily operations must not require fixture scripts, SQL edits, or technical identifiers.
Broad configuration builders are not a prerequisite for this workspace.

## 6. UI/UX design specification

### Direction and shared layout

Keep Pulse as the visual identity.
Use calm working surfaces, clear typography, restrained teal accents, and strong information hierarchy.
Make the case timeline and next-action panel the main visual feature of the logged-in application.
Keep the comparison matrix as the main decision tool.
Every status, date, count, and activity item must come from actual data.

Use Geologica for display and body text.
Use Martian Mono sparingly for labels, dates, and figures.
The root layout currently loads Geist. Replace it with Geologica and Martian Mono during the P1 shell work, and verify both Pulse routes.
Reuse the existing Tailwind, shadcn/ui, Radix, and icon foundations.
The shared UI folder holds four shadcn/ui components. Add the roughly twelve more that the component set needs through the shadcn CLI.
The radix-ui package is already installed, so this adds no production dependency.
Do not add a UI framework, decorative 3D system, or a separate design application.

| Token role | Light | Dark |
|---|---|---|
| Canvas | `#eef3f2` | `#080c11` |
| Surface | `#ffffff` | `#10161d` |
| Text | `#0a161b` | `#f3f6f8` |
| Muted text | `#4e616a` | `#8a96a3` |
| Border | `#cbd9d7` | `#1e2732` |
| Accent | `#097061` | `#2fe6c4` |

These values start from Pulse.
Verify contrast in the rendered components before accepting them.
Define shared spacing, type sizes, radii, focus styles, table density, and semantic status colors.
Keep status meaning visible in text as well as color.

All portals share the same header, workspace context, navigation behavior, account menu, feedback, and form rules.
Their navigation and actions differ by role.
Retain customer and case context when users move between workflow pages.
Use readable names in navigation and breadcrumbs.

### Components and interaction rules

Build or adapt a small shared set:

- Application shell, page header, breadcrumbs, tabs, and mobile navigation.
- Case summary, timeline, next-action panel, status label, and activity list.
- Searchable table, filters, pagination, detail panel, and record picker.
- Guided form sections, save status, validation summary, and confirmation dialog.
- Comparison matrix, selection tray, evidence panel, and quote summary.
- Loading, empty, error, denied, expired, stale, and success states.

The matrix uses vendor columns and criteria rows.
Keep labels visible during scrolling.
Contain horizontal scrolling inside the matrix on small screens.
Distinguish unknown information from unsupported requirements.
Expose evidence, version, freshness, and scoring limits without crowding the main view.

Forms retain entered values after recoverable errors.
Show the last successful save and any unsaved changes.
Prevent duplicate submissions while a request is pending.
Show revision conflicts with a clear reload or recovery action.
Use confirmation for consequential approval, issue, withdrawal, and access changes.

Check keyboard access, visible focus, labels, errors, contrast, zoom, touch targets, and reduced motion.
Target the PRD's WCAG 2.1 AA requirement for launch journeys.
Check mobile, tablet, and desktop layouts in both themes.
Avoid page overflow and controls hidden by the mobile keyboard.

### Visual acceptance checkpoints

Version 1.1 moves the component set and its first checkpoint into P1 so later screens are built once.
P1 finishes the shared component set and two representative screens: customer overview and staff case workspace.
P2 finishes the third representative screen: the comparison matrix.
Use realistic synthetic content, including long names, missing data, and many records.
Review hierarchy, density, spacing, navigation, and interaction states in the browser.
Correct the shared components before applying them to every other launch screen.
Show each checkpoint to the user during implementation.
An actual design award is not a completion criterion; observable design quality is.
A synthetic seed for design review is permitted. It is separate from the rule against fixture scripts for routine operations.

## 7. Backend work behind the screens

Keep the architecture defined in TECH_STACK.
Use the installed package versions and `package-lock.json`.
Prefer current commands and typed procedures over new service layers.
Add a schema or migration only when an approved screen needs data that cannot be represented correctly today.

| Work package | Main affected areas | Required stored result and proof |
|---|---|---|
| Account and workspace flow | Auth routes, membership and invitation procedures, current identity client | Verified identity reaches the right workspace; recovery and denied access work |
| Staff case operations | CRM commands, scoped search, deals, tasks, staff routes | Staff can create or locate a case, assign ownership, set next action, and return after refresh |
| Case identity | `deals`, `workspaces`, intake submission, staff case routes | One deal exists for each submitted intake; every case screen resolves the same deal identifier |
| Guided intake | `customer-intake-save`, `customer-intake-submit`, `intake-read`, customer forms | Existing answers survive navigation, revision, validation failure and reload |
| Catalog and comparison | Vendor evidence, publication, matching, selection and disclosure commands | Only approved facts and rules reach the customer; five-selection and masking rules hold |
| RFP and reply | `rfp-portal`, `rfp-portal-response`, `portal-clarification` | Correct version and recipient; drafts and reviews persist; retries do not duplicate issue |
| Demo and proposal | `demo-coordination`, `proposal-quotes` | Time zones, outcomes, quote versions, assumptions and customer approvals stay consistent |
| Contract handoff | `contract-handoff-portal`, existing deal follow-up | Selection, introduction, reported outcome and history work without private files or a finance ledger |
| Notifications | Existing internal communication interface and outbox | Real delivery states, failures and retry; portal delivery remains distinguishable from email delivery |
| Email provider | `EmailService`, Supabase Auth email settings, environment inventory | One decided provider delivers confirmation, recovery, invitation, and RFP notices on staging; production activation follows P5 approval |
| Daily reporting | Existing scoped queries, tasks and review records | Accurate active, overdue and pending counts; each count links to its underlying records |
| Essential administration | Existing configuration, permissions and audit commands | Required settings and reviews work through authorized screens |
| Launch surface control | Middleware, root router composition, page guards, jobs, public links and configuration | One server-side allowlist hides excluded operations; the entry-point inventory test proves it; approved core operations still work |

### Case identity

The deal is the case identifier.
Create one deal for each submitted intake, linked one-to-one, at submission time.
Backfill one deal for each existing submitted intake with a reviewed migration.
Staff case routes, the case list, and every workflow screen resolve the deal first and the intake through it.
Customer and vendor routes keep their existing query parameters and resolve the same deal on the server.
This is the one schema change version 1.1 expects. Record its forward migration and recovery method.

### Launch surface control

Use one server-side allowlist of exposed surfaces for the active launch candidate.
Middleware, root router composition, page guards, navigation, and background task registration read the same allowlist.
Excluded surfaces return not-found or denied responses and do not reveal their existence.
Extend the existing entry-point inventory test so every excluded surface is proven unavailable in the launch configuration.
Keep excluded code, tables, and failed evidence unchanged.

### Email provider

Confirmation, recovery, invitation, and RFP notices need real delivery once hosted.
TECH_STACK names Resend. The environment inventory holds its key and sender address. An AgentMail test adapter also exists.
Decide the provider for Supabase Auth email and for the internal `EmailService` in P0.
Configure it on staging at the end of P1. Production activation remains a P5 approval.

Preserve server-side authorization, RLS, consent, audit, and ranking-integrity rules.
User-authorized access must use the existing request-scoped access model.
Use verified server identity through the current `getClaims()` approach.
Do not use `getSession()` as request authorization.
Keep private data out of logs, URLs, screenshots, and public responses.

For data changes, record the forward migration and recovery method.
Test against a local database with synthetic organizations and roles.
Keep deployment changes compatible with the preceding application version where practical.
Cloud migrations and production changes require separate approval.

## 8. Ordered build phases

### P0 — Confirm the launch boundary and starting baseline

**Outcome:** One agreed scope, one current work list, a known starting condition, and the decisions that later phases depend on.

**P0 record:** [P0 baseline and launch inventory](build-mvp-p0-baseline-2026-10-07.md). Status: complete; the owner approved all nine decisions on October 7.

- Add a short supersession notice to each older scope document. Keep the full rewrites for after launch.
- Record every exposed launch route, API, job, and advertised action for Launch Candidates A and B.
- Inspect the dirty worktree and preserve unrelated changes.
- Record current application checks once and identify actual launch failures. Type check and lint passed on October 6; unit, integration, and build results remain due.
- Define shared navigation, case context, tokens, and component ownership.
- Confirm account recovery and the required provider configuration.

**Decisions required in P0:**

| Decision | Recommendation | Approval |
|---|---|---|
| Case identifier | The deal, with a one-to-one bridge from each submitted intake | Product owner |
| Launch surface mechanism | One server-side allowlist enforced by the entry-point inventory test | Product owner |
| Git checkpoint | Checkpoint commits on the current branch before P1, then one commit per work package | Explicit Git authorization from the owner |
| Email provider | Resend for Supabase Auth email and the internal service, configured on staging at the end of P1 | Product owner; production activation remains a P5 approval |
| Automated journey tests | Playwright as a development dependency with axe accessibility checks | Explicit dependency approval from the owner |
| Private staging | A Vercel preview and a staging Supabase project at the end of P1 | Owner approval for cost and provider setup |

**Exit:** Each launch workflow has a source location, gap, acceptance check, and dependency.
Each excluded surface has a concrete isolation approach.
Each decision above has a recorded answer.
Do not repeat the full 148-row platform audit before feature work.

### P1 — Make accounts, intake, and staff daily work usable

**Depends on:** P0 decisions.

- Complete registration, verification, workspace selection, and account recovery.
- Build the shared application shell, switch the fonts to Geologica and Martian Mono, and build the complete shared component set with the Pulse tokens.
- Add the case identity bridge and its backfill.
- Replace the generic intake editor with the guided questionnaire. Keep the stored shape that the matching contract validates. Define the question set as a versioned configuration mapped to those keys, and stamp the version on each intake.
- Build staff Today, the case list, and the case workspace.
- Connect customer, vendor, product, contact, owner, next-action, and task operations.
- Pass the first visual acceptance checkpoint on the customer overview and the staff case workspace.
- Stand up private staging after approval and run the first hosted smoke check.

**Exit demonstration:** A customer saves and submits needs.
Staff finds the case, corrects permitted details, assigns work, and sees saved results after reload.
The two checkpoint screens use the final component set.
No setup script substitutes for these routine actions.

### P2 — Complete comparison, RFP, and vendor response

**Depends on:** P1 and approved catalog inputs for real publication.

- Complete fact review and publication controls.
- Complete the masked matrix and initial selections.
- Connect discussion records, identity disclosure, RFP drafting, approval, and portal delivery.
- Complete vendor drafts, submission, staff review, and clarifications.
- Add vendor participant invitation as a case workspace action. RFP notices require an active vendor membership with a verified email.
- Add the required invitation and RFP notifications through the existing service boundary.
- Pass the second visual acceptance checkpoint on the comparison matrix.

**Exit demonstration:** A customer selects contenders.
Staff issues an approved request.
The correct vendor responds, and the customer sees only approved results.
Synthetic evidence supports development; actual fact approval remains a separate publication requirement.
Launch Candidate A verification can start after this phase.

### P3 — Finish demos, proposals, and contract handoff

**Depends on:** P2.
P3 ships in Launch Candidate A only when it is locally verified before Candidate A verification starts.
Otherwise P3 is the first post-launch increment, and the pilot operating procedure covers demos, proposals, selection, and contract handoff.

- Carry case context through existing demo, proposal, and contract screens.
- Complete availability, confirmed scheduling, feedback, and outcome states.
- Complete structured quotes, version comparison, and selection.
- Complete introduction, reported contract status, history, and next follow-up.
- Add basic stage, overdue, pending-review, and failed-delivery views.
- Complete essential settings and audit navigation.

**Exit demonstration:** The same case reaches a recorded contract outcome through normal customer, staff, and vendor screens.
The entire core feature sequence now works locally.
No finance or private-document module is needed for that result.
This completes Launch Candidate B.

### P4 — Complete and refine every launch interface

**Depends on:** The functional screens of the active launch candidate.

- Confirm the three representative screens still pass their checkpoints after later changes.
- Apply the accepted component system across public, account, customer, vendor, and staff screens.
- Align public copy, calls to action, resource behavior, and contact confirmations.
- Complete responsive layouts, both themes, keyboard operation, and all relevant feedback states.
- Remove broken navigation, repeated case selection, technical labels, and misleading completion messages.

**Exit demonstration:** Every exposed route of the active launch candidate passes the screen checklist in Section 5.
The application has one consistent visual and interaction system.
Source inspection alone cannot pass this phase.

### P5 — Verify, prepare hosting, and request launch approval

**Depends on:** P0, P1, P2, and P4, plus P3 when included; approved facts, content, accounts, and service configuration.

- Run focused checks, then required whole-application gates on the release candidate.
- Run the automated three-role journey tests and accessibility checks on the candidate.
- Rehearse the full three-role journey and its main recovery paths.
- Confirm staging configuration, migrations, provider settings, and rollback instructions on the staging environment from P1.
- Obtain required approval before external setup or deployment actions.
- Repeat the critical journey on the approved staging candidate.
- Complete existing release evidence and staff acceptance.
- Present the exact candidate, remaining limits, and production steps for release approval.

**Exit:** Staff accepts the MVP and all required launch evidence passes.
Production release remains a separate decision.
After approved release, complete live checks and record the result.

## 9. Work tracking and delivery discipline

Track work by usable capability, not by files changed or test totals.
Use these states: **Not started → In progress → Locally verified → Hosted verified → Accepted**.
All phases in this new plan start as **Not started**.
Existing code is reusable evidence, not automatic acceptance.

| Work package | Phase | Size | Candidate | Main requirement groups | Earlier checklist mapping |
|---|---|---|---|---|---|
| UX-01 Scope, routes, baseline and P0 decisions | P0 | S | A | All launch groups | MVP-07, MVP-15, MVP-19 |
| UX-02 Account and workspace experience | P1 | M | A | FR-IAM; FR-MKT | MVP-04, MVP-11, MVP-16 |
| UX-03 Shared shell, component set and case context | P1, P4 | L | A | FR-IAM; FR-EVL; FR-ADM | MVP-03, MVP-05, MVP-14 |
| UX-04 Guided intake | P1 | M | A | FR-INT | MVP-04, MVP-05 |
| UX-05 Staff cases, case identity, CRM and tasks | P1 | L | A | FR-CRM; FR-WRK; FR-ADM | MVP-05, MVP-07, MVP-18 |
| UX-06 Vendor facts and comparison | P2 | M | A | FR-VND; FR-MAT; FR-EVL | MVP-01, MVP-02, MVP-03 |
| UX-07 Disclosure, RFP and delivery | P2 | M | A | FR-RFP; FR-MAT; FR-CMN | MVP-05, MVP-06 |
| UX-08 Response and clarification | P2 | M | A | FR-RSP; FR-CMN | Extends MVP-06 through in-app response review |
| UX-09 Demo and proposal workflow | P3 | M | B | FR-DMO; FR-PRP | Extends the former manual pilot boundary |
| UX-10 Selection and contract handoff | P3 | M | B | FR-CTR; FR-WRK | Extends the former manual pilot boundary |
| UX-11 Daily reporting and settings | P1, P3 | S | A for Today counts; B for stage, overdue and settings views | FR-RPT; FR-ADM; FR-ANL | MVP-05, MVP-17, MVP-18 |
| UX-12 Public website and entry points | P4 | M | A | FR-MKT | MVP-08, MVP-09 |
| UX-13 Complete visual and interaction pass | P4 | L | A | All launch screens | MVP-03, MVP-13, MVP-14 |
| UX-14 Local and hosted acceptance | P5 | M | A | Launch scope and applicable NFRs | MVP-10 through MVP-19 |
| UX-15 Approved release and live checks | P5 | S | A | R0 and R9 controls | MVP-20 |
| UX-16 Automated journey and accessibility tests | P1 to P5 | M | A | Launch journeys; accessibility NFRs | MVP-12, MVP-13, MVP-14 |
| UX-17 Private staging | P1, P5 | S | A | Hosting and account access | MVP-10, MVP-11 |

Sizes are relative planning estimates, not commitments.
S is a few work sessions. M is several sessions with one main dependency. L is many sessions across more than one dependency.
P1 is the largest phase because the shell, component set, questionnaire, case list, case workspace, and CRM screens are new.
P2 and P3 mostly connect existing commands. P4 is broad but mechanical once the component set exists. P5 depends on external approvals.
The critical path for Launch Candidate A is the P0 decisions, then case identity and the shared shell in P1, then P2, then P5.

Each completed work package records changed behavior, checks, browser evidence where required, and remaining limits.
Each work period must produce a usable action or remove a demonstrated launch blocker.
Use one current blocker list.
Keep optional improvements in the post-launch list.

Diagnose failures against the existing checks first.
Do not build a new test framework, generic fixture platform, or speculative security system to delay core work.
Do not weaken assertions, extend limits without evidence, or hide required failures.
Repeat passed checks only after relevant changes or a new concern.

Prepare content decisions and provider details while related local features are built.
Do not start independent agent work without authorization.
Re-estimate the remaining effort after P1 using the actual gaps and work rate.
Set the release forecast for Launch Candidate A after the first complete P2 journey, and for Candidate B after the first complete P3 journey.
A calendar launch date before those checks would be unreliable.

## 10. Verification and release evidence

### During implementation

Run the smallest relevant existing tests for each behavior change.
Add regression checks for new behavior and practical defect cases.
Run local integration checks for database, authentication, query, RLS, and migration changes.
Verify rendered changes through the available built-in browser first.
Check for an existing healthy server on port 3000 before starting another.
Run the automated journey tests after each phase once they exist.

For each relevant screen, check loading, empty, populated, success, validation, failure, denied, stale, and expired states.
Inspect console and network failures.
Check saved results after refresh and navigation.
Mark unavailable evidence as unverified.

### Whole candidate

| Check | Existing command or evidence |
|---|---|
| Type checking | `npm run type-check` |
| Lint | `npm run lint` |
| Unit and component tests | `npm test` |
| Production build | `npm run build` |
| Local integration | `npm run test:integration` |
| Integration inventory | `npm run check:integration-matrix` |
| Dependency review | `npm run check:dependency-audit` |
| Secret scan | `npm run check:secrets` |
| Release evidence review | `npm run check:r9-evidence` |
| Required release readiness | `npm run check:r9-evidence:release` |
| Critical journeys | Customer, vendor, and staff browser evidence for the same case |
| Automated critical journeys | Playwright three-role journey tests against local Supabase in the integration workflow, after dependency approval |
| Accessibility checks | axe checks inside the journey tests, plus assisted manual checks |
| Staging smoke | The same journey on the private staging candidate from the end of P1 |
| Interface quality | Responsive, keyboard, contrast, both themes, error recovery and usability evidence |

Use `npm ci` only when the approved package state requires installation.
Do not add a production dependency without approval.
Read the relevant installed Next.js guides before changing Next.js behavior.

Retain all existing R9 evidence categories:
standard CI, integration, critical journeys, accessibility, performance, availability monitoring, deletion, restore, security review, deployment smoke, rollback, and public-release approval.
Align their scope to the approved exposed MVP through the documented scope change.
Do not silently remove or bypass a required gate.
Retain failed historical evidence and resolve applicable candidate failures before release.

Performance targets remain those in the PRD, including public LCP and INP targets.
Report measured conditions and limitations.
Laboratory results do not establish production field percentiles.

### Minimum acceptance scenarios

1. Complete the full journey from registration to a reported contract outcome.
2. Save an incomplete intake and resume it after sign-out.
3. Attempt a sixth initial selection and receive a clear limit message.
4. Confirm hidden vendor identities remain hidden before disclosure.
5. Confirm unapproved requests and responses cannot reach recipients.
6. Confirm another customer or vendor cannot read or change the case.
7. Recover from expired access, stale edits, interrupted saves, and duplicate submissions.
8. Record a failed notification and retry without duplicate issue.
9. Compare proposals with missing costs and different billing bases.
10. Record paused, cancelled, not-signed, and signed contract outcomes with history.
11. Complete the main actions with a keyboard and on a narrow screen.
12. Restore the launch data and rehearse rollback using the existing release procedure.

## 11. Dependencies, risks, and recovery

| Dependency or risk | Treatment | Recovery or fallback |
|---|---|---|
| Unapproved vendor facts or scoring inputs | Develop with labelled synthetic data; obtain real approvals before publication | Keep the comparison pending; never publish invented facts |
| Unapproved public claims | Prepare accurate copy and evidence for owner review | Keep release controls active until approval |
| Large dirty worktree | Record file ownership and inspect each task diff | Preserve unrelated work; obtain approval for any required branch action |
| Incomplete existing application checks | Establish one baseline and repair applicable failures | Keep the candidate unreleased; report the exact failed requirement |
| Excluded modules coupled to core flows | Trace route, job, query and trigger dependencies before isolation | Preserve old code and data; use compatible changes |
| Schema or authorization changes | Use minimal migrations and local multi-role integration proof | Document a compatible rollback or forward repair before application |
| Email or provider failure | Show accurate pending or failed status and support retry | Keep portal records intact; use the approved staff contact procedure |
| Account recovery limitations | Use the current provider and verify expired-link behavior | Keep a documented support route; never bypass staff MFA |
| Design expansion delays launch | Reuse Pulse and a small component set | Defer optional animation and decorative work |
| Scope grows during implementation | Compare requests with this launch boundary | Obtain a decision for material additions before starting them |
| Uncommitted worktree during long implementation | Checkpoint commits before P1 and one commit per work package, after Git authorization | Return to the last checkpoint; preserve unrelated work |
| Late hosted verification | Private staging from the end of P1 and a hosted smoke check after each phase | Fix hosted email, redirect, MFA, and cookie problems while they are small |
| New development dependency | Playwright and axe only, after approval; no production dependency | Keep manual browser evidence as the fallback |
| Case identity bridge touches existing data | Reviewed additive migration with backfill and local multi-role proof | Compatible rollback that removes the bridge and leaves intakes and deals unchanged |

The product owner supplies or approves real vendor facts, commercial disclosures, public claims, intended accounts, and provider choices.
Prepare these decisions early.
Do not use real customer data as a substitute for synthetic development tests.
No new provider activation, external message, cloud migration, or production action is authorized by this draft.

## 12. Work after launch

Use actual staff and customer feedback to set the next order.
The recommended sequence is:

1. Ship P3 if Launch Candidate A launched without it.
2. Complete the full rewrite of the scope documents listed in Section 13.
3. Remove observed workflow friction and improve the most-used screens.
4. Add customer onboarding, check-ins, renewal reminders, and repeat-deal support.
5. Add advanced CRM search, reviewed exports, collaboration, and richer reports.
6. Add content management, calendar integration, and useful workflow automation.
7. Add approved AI assistance after its manual task and review process work reliably.
8. Extend security controls according to observed exposure and a separate reviewed plan.

Finance ledgers and private document storage are excluded, not automatically scheduled for the next release.
Restore those features only if the user requests them.
Keep existing protections effective throughout every phase.

## 13. Document alignment after approval

In P0, add a short supersession notice at the top of each document below. The notice points to this plan and its launch candidates.
Complete the full rewrites after launch. The rewrites must prevent a return to the superseded delivery order:

- [PRD](../../docs/PRD.md): launch boundary, finance/private-document scope, staged requirements, and affected success measures.
- [TECH_STACK](../../docs/TECH_STACK.md): active launch services and deferred integrations, while retaining the architecture.
- [Project overview](../../docs/README.md): current priority, scope, and roadmap pointer.
- [MVP launch checklist](release-mvp-launch-checklist.md): revised launch scope, account decisions, evidence, and retained task IDs.
- [Phased development](../../docs/phased-mvp-development.md): replace the older active sequence with P0–P5.
- [Prior execution plan](build-complete-pilot-workflow.md): mark the all-platform-before-live sequence as superseded.
- [Full v2 roadmap](roadmap-v2-implementation.md): preserve later requirements and distinguish them from launch acceptance.
- [Pilot operating procedure](../../docs/mvp-pilot-operating-procedure.md): actual in-app work, external contract talks, owners, and recovery actions.
- [R0 controls](module-r0-roadmap-and-public-release-control.md): align the approved boundary without weakening public-release approval.

The October 3 audit remains a dated record.
Do not rewrite historical failures or approvals as current success.

## 14. Approval boundary and stop point

**Version 1.1 status:** The product owner approved the October 6 review modifications recorded in Section 16.
Implementation under this plan starts only on the owner's explicit start instruction for P0.
The P0 decisions in Section 8 that need Git authorization, dependency approval, or provider setup remain separate approvals.

Approval of this roadmap authorizes its scope alignment and normal local implementation work in the stated order.
It does not authorize Git writes, permission changes, new production dependencies, provider activation, external messages, cloud migrations, or deployment.
Those actions retain their existing approval requirements.
Normal reversible implementation and safe local checks need no repeated approval within the agreed scope.

**Current stop point:** Version 1.1 is saved.
No application implementation starts until the owner gives the explicit start instruction for P0.

## 15. Reference documents

- [Development document index](../../docs/README.md)
- [Canonical product requirements](../../docs/PRD.md)
- [Canonical architecture](../../docs/TECH_STACK.md)
- [October 3 audit](../../docs/code-audit-2026-10-03.md)
- [Requirement evidence matrix](../../docs/code-audit-requirements-2026-10-03.md)
- [Approved comparison implementation record](build-phase1-comparison-matrix.md)
- [Catalog and scoring decision](decision-phase1-catalog-and-scoring.md)
- [Local operation guide](../../docs/mvp-local-operation.md)
- [Notification outbox plan](build-rfp-notification-outbox.md)

## 16. Change record

| Version | Date | Change |
|---|---|---|
| 1.0 | October 6, 2026 | Initial roadmap saved for owner approval. |
| 1.1 | October 6, 2026 | Owner-approved review modifications. Launch Candidates A and B with a cut line after P2. Component set and first visual checkpoint moved to P1. P0 decisions for case identity, launch surface mechanism, Git checkpoint, email provider, journey tests, and staging. October 6 baseline evidence. Relative sizing and critical path. Shortened P0 document alignment. New risk rows. Work packages UX-16 and UX-17. |
