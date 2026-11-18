# Workspace

After sign-in, a user with organization access picks a workspace and lands in the areas their account allows. `/home` is a permission-checked router. `/workspaces` lists memberships. Customer, vendor, and staff portals are linked only when those permissions exist.

## Sub-features

- `workspace-home` at `/home` shows heading `Workspace` and `Your access is active. Only areas available to your account appear here.`
- `workspace-areas` nav `Workspace areas` may include `Customer portal`, `Vendor portal`, `Invite a member`, `Manage invitations`, `Manage members`, and `Administration`.
- `workspace-switch` at `/workspaces` shows heading `Choose a workspace` and list `Available workspaces`, each with `Open workspace`.
- `workspace-empty` shows status `No workspaces are available. Review your invitations or contact your organization administrator.`
- `workspace-sign-out` uses button `Sign out` and returns to `/sign-in`.

## How to get to it (user POV)

- Sign in. Destination is `/home`, `/customer`, `/vendor`, `/admin`, or `/workspaces` depending on memberships.
- Choose `Change workspace` from `/home`, customer nav, or vendor nav.
- Choose `Open workspace` on a membership row.
- Choose `Review pending invitations` (`/invitations/accept`).

## Driving it with Playwright

Preconditions:

- Full launch. Doctor `ready: yes`.
- A signed-in session. Seed data does not provide one. If sign-in cannot complete, this feature fails with that reason.
- `--stand-in` cannot prove this feature.

- **Open home.** After a successful sign-in, go to `/home` if not already there. Heading `Workspace` is visible. Screenshot the area links actually shown (do not require staff and customer links on the same account).
- **Follow a portal link.** If `Customer portal` is present, choose it and land on `/customer` with `Your software needs`. If `Vendor portal` is present, choose it and land on `/vendor` with `Vendor portal`. If only `Administration` is present, choose it and land on `/admin`. Exactly one of these is enough for a single account; record which.
- **Switch workspace.** Choose `Change workspace`. Heading `Choose a workspace` is visible. If the list `Available workspaces` has rows, choose `Open workspace` on one. The next page is `/customer`, `/vendor`, or `/home`, not an error alert `We could not load your workspaces.`
- **Sign out.** On `/home` choose `Sign out`. The next page heading is `Sign in`. A later `GET /home` redirects to sign-in.
- **Proof.** Screenshots of `/home` with its real links, `/workspaces`, the portal that opened, and `/sign-in` after sign-out.

End state that proves it works: `/home` rendered for the signed-in user, a workspace open action reached an allowed portal, and sign-out returned to `/sign-in`.

## Gotchas

- No seed memberships. An authenticated user with zero orgs will see `No workspaces are available.` That is a real empty state, not a pass for `Open workspace`.
- Candidate A hides documents, demos, proposals, and contracts. Missing those `/home` links is required, not a bug.
- Staff with `admin.access` skip `/workspaces` and go to `/admin` on sign-in. Prove workspace switching with a customer or vendor account, or by visiting `/workspaces` directly.
- `/vendor` empty inbox shows `No RFPs have been delivered to this inbox.` That is not a vendor-response pass; it only proves the portal opened.
- Never prove workspace access by setting the organization cookie by hand. Use `Open workspace`.
