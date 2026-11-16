# Landing

The Pulse homepage at `/` is the public MatchMaker HR site. A visitor can read the launch pitch, request access with a work email, switch theme, open Contact, and read Privacy and Terms. This is the only mapped feature that does not need a signed-in user.

## Sub-features

- `landing-hero` shows heading `Compare HR software options with vendor names hidden.` and the Get access form.
- `landing-get-access` sends the typed work email to `/sign-up` as a GET.
- `landing-nav` opens `/contact` from Primary navigation.
- `landing-legal` opens `/privacy` and `/terms` from the footer.
- `landing-theme` toggles `data-theme` on `.pu` between `dark` (default) and `light`.

## How to get to it (user POV)

- Open `http://127.0.0.1:3100/`.
- Choose `Get started` in the header (goes to `/sign-up` without an email).
- Choose `Sign in` in the header (goes to `/sign-in`).
- Choose `Contact` in Primary navigation.
- Choose `Privacy` or `Terms` in the footer.

## Driving it with Playwright

Preconditions:

- Doctor reports `ready: yes` at `http://127.0.0.1:3100`.
- `GET /` is not the holding page `This site is not available yet.`
- Automated path: `node .cursor/skills/verify-mmhr/scripts/drive.mjs landing`.

- **Open Pulse.** Go to `/`. Wait for heading `Compare HR software options with vendor names hidden.` If region `Cookie consent` is visible, choose `Decline`. Screenshot `01-landing-dark.png`. The logo text `MatchMaker HR` is visible.
- **Request access.** Fill textbox `Work email` with `verify-landing@example.com`. Choose `Get access`. The next page heading is `Create your account`, the URL contains `/sign-up`, and label `Work email` shows `verify-landing@example.com`. Screenshot `02-signup-from-landing.png`.
- **Open contact.** Return to `/` (auth pages do not use Pulse chrome). From Primary navigation choose `Contact`. Heading `Talk to an advisor.` is visible. Do not submit `Send`. Screenshot `03-contact.png`.
- **Open privacy.** From the footer choose `Privacy`. Heading `Privacy policy` is visible. Screenshot `04-privacy.png`.
- **Open terms.** From the footer choose `Terms`. Heading `Terms of service` is visible. Screenshot `05-terms.png`.
- **Toggle theme.** Return to `/`. Choose `Switch to light theme`. The button becomes `Switch to dark theme` and `.pu` has `data-theme="light"`. Screenshot `06-landing-light.png`.
- **Proof.** `artifacts/verify-mmhr/<run-id>/landing/report.md` records the GET `/` status, prefilled email, and theme. Console errors are in `console.json`.

End state that proves it works: Pulse heading on `/`, Get access lands on `/sign-up` with the same email, Contact/Privacy/Terms headings render, and the light theme attribute is set.

## Gotchas

- `npm run start` serves `This site is not available yet.` until a checked-in public release id exists. That is not a Pulse failure; it is the production gate. Relaunch with `next dev` via the launch helper.
- Use `127.0.0.1`, not `localhost`.
- Two `Work email` fields exist on `/` (hero and newsletter). Use `.first()` for Get access. Do not submit The Weekly Signal; that POSTs `/api/newsletter`.
- Contact `Send` POSTs `/api/leads` and needs a live database. Skipping Send is not a contact-submit pass.
- `--stand-in` is enough for this feature's public pages. It does not prove Auth or lead persistence.
- Unapproved marketing routes (`/about`, `/blog`, `/platform`, and the rest in `src/lib/launch-surface.ts`) rewrite to a not-in-launch page. Do not treat those as landing failures.
