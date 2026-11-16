# MMHR Launch Scope

Owner-approved on 2026-11-14. This page is the single authority for launch scope, task order, and the work rule until launch.
Where an older plan, roadmap, or checklist conflicts with this page on those points, use this page.
Product rules in [PRD.md](./PRD.md) and architecture rules in [TECH_STACK.md](./TECH_STACK.md) stay in force.

## The launch path

Before the path starts, staff enter the vendors (owner decision, 2026-11-16). A Super Admin lists each vendor at
`/admin/vendors`. Staff open its workspace and enter its products, evidence, and approvals.
No vendor user signs in for this. See [vendor-entry.md](./vendor-entry.md).

1. A customer creates a free account and gets a private workspace.
2. The customer enters software needs and submits them.
3. The customer sees all published vendor options in the comparison matrix. Vendor names are hidden.
4. The customer selects a maximum of five options.
5. Staff talk with the customer and record the disclosure of vendor names.
6. Staff approve the RFP. For each selected vendor that has no user yet, staff invite its first user at `/admin/vendors`
   and wait until that user joins. The invitation expires after 72 hours. The app sends no email yet, so staff send the
   steps to the person. When the vendor has joined, staff issue the RFP. The response deadline starts at delivery.
7. Each vendor reads the RFP in the portal and submits a response.

Launch is ready when one customer, one vendor, and staff complete this path on hosted staging.
Demos, proposals, contract handoff, and account recovery are manual work at launch. Use [the pilot operating procedure](./mvp-pilot-operating-procedure.md).

## Five protections that must hold

1. One customer cannot see the data of a different customer.
2. One vendor cannot see the replies of a competitor.
3. Vendor names stay hidden until staff record the disclosure.
4. Commission amounts stay hidden and do not change a score.
5. Staff logins have strong protection.

New work needs two checks only: the user is logged in, and the data belongs to the user's organization.
Add more control only when the work touches one of the five protections.

## Pages

| Area | Pages that stay |
|---|---|
| Public | `/`, `/contact`, `/privacy`, `/terms` |
| Sign-in | `/sign-up`, `/sign-in`, `/mfa`, `/pending-access`, `/invitations/accept` |
| Shared | `/home`, `/workspaces`, `/members`, `/invitations` |
| Customer | `/customer` (needs), `/customer/evaluation` (matrix), `/customer/rfp` |
| Vendor | `/vendor`, `/vendor/response` |
| Staff | `/admin`, `/admin/evaluations`, `/admin/tasks`, `/admin/vendors`, `/admin/vendor-evidence`, `/admin/audit` |

Blocked now by [`src/lib/launch-surface.ts`](../src/lib/launch-surface.ts) and `src/proxy.ts`:
finance, documents, demos, proposals, and contracts, with their API routes.

To block in trim tasks 6 and 7: the other 17 public pages, `/designs`, and `/gallery`.
`/agentid/complete-registration` needs a review in task 4.

## What does not change

- The database keeps all 175 migrations and all tables.
- Login and access rules stay. One exception: a simple staff reset will replace the two-admin recovery process.
- Pulse stays as the design. The name stays MatchMaker HR.
- Unused code moves to `archive/` at the project root. It is not deleted.

## Work rule

- Run the four checks: `npm run type-check`, `npm run lint`, `npm test`, `npm run build`.
- Do one browser check when a screen changes.
- Write one short journal entry for each task.
- Do not write hash records, cleanup proofs, or rollback rehearsals unless a change touches saved production data.
- The full integration suite runs on hosted staging before go-live.
- Opus 5.5 subagents write the code. The main session plans, reviews, checks, and does Git work.

## Trim tasks

| # | Task | Status |
|---|---|---|
| 1 | Merge the handoff branch into `develop` | Done, PR #18 |
| 2 | Write this page | Done |
| 3 | Run the launch path in a browser on the local stack; record each failure | Open |
| 4 | Confirm the pages that stay | Open |
| 5 | Block finance, documents, demos, proposals, and contracts | Done before the trim (allowlist) |
| 6 | Reduce the public site to four pages | Open |
| 7 | Block the two design galleries | Open |
| 8 | Archive the 20 candidate designs and the older gallery; keep Pulse | Open |
| 9 | Archive the file reader; remove `pdfjs-dist`, `mammoth`, `sharp`, and `braces` | Open |
| 10 | Archive server code and tests for finance, customer success, demos, proposals, and contracts | Open |
| 11 | Make CI and the release check run launch tests only | Open |
| 12 | Leave the database as it is | No work |
| 13 | Leave access rules as they are; replace two-admin recovery with a staff reset | Open |
| 14 | Archive old plans and documents | Open |
| 15 | One-page state file and a new board | Open |
| 16 | Use the work rule above | In force |

## Launch tasks after the trim

1. Repair each failure from trim task 3.
2. Create hosted staging: Supabase project, migrations, Vercel preview, and email.
3. Run the three-role path and the full integration suite on staging.
4. Give the owner the candidate, the known limits, and the results. Production release is a separate decision.

## Owner decisions that stay open

- Approval of the Gusto and Rippling draft records. Until then, launch uses the eight approved products.
- Removal of one expired local worker login, which task 3 needs before the local server starts.
- Each external staging action and each production action.
