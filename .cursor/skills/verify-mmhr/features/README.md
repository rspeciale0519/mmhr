# MMHR verification map

This directory is the maintained source for verifying the user-facing behavior of MatchMaker HR. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch MMHR at `http://127.0.0.1:3100` with `node .cursor/skills/verify-mmhr/scripts/launch.mjs` (full stack) or `--stand-in` only when Docker/Supabase cannot run.
- Run `node .cursor/skills/verify-mmhr/scripts/doctor.mjs` and require `ready: yes`, Pulse heading present, holding page absent.
- Use `127.0.0.1`, not `localhost`.
- Never drive an instance that was not started by this verification run.
- Database seed is disabled. There are no bundled customer, vendor, or staff passwords.
- `--stand-in` can prove public Pulse pages only. Signed-in features are unverified in that mode.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or coordinates.
- Treat every command as literal.
- Dismiss `Cookie consent` with `Decline` unless the recipe is proving analytics consent.
- Restore nothing on public pages. Do not submit `/api/newsletter` or `/api/leads` unless the recipe is proving those posts against a live stack.
- Keep proof under `artifacts/verify-mmhr/<run-id>/`. Cleanup must leave that tree in place.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with MatchMaker HR visible.
- Mutation proof includes a second user-facing view of the stored value.
- Record the feature id and route with every artifact.
- Report an unreachable path with the attempted route and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Playwright` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Landing](./landing.md) covers Pulse `/`, Get access, theme, Contact, Privacy, and Terms.
- [Account access](./account-access.md) covers sign-up, sign-in, MFA, and pending access.
- [Customer intake](./customer-intake.md) covers the buyer questionnaire, save, and submit.
- [Customer evaluation](./customer-evaluation.md) covers the masked comparison matrix and five initial choices.
- [Workspace](./workspace.md) covers `/home`, workspace switching, and portal links.
