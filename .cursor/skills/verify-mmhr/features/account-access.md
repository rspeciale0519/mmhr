# Account access

A visitor creates a customer account or signs back in. Sign-up collects name, company, work email, direct company phone, password, and contact consent. Local Auth requires email confirmation before a session is usable. MFA setup lives at `/mfa`. Users without a workspace land on `/pending-access`.

## Sub-features

- `signup-form` renders `/sign-up` with labels `Full name`, `Company`, `Work email`, `Direct company phone`, `Password`, the privacy consent checkbox, and button `Sign up`.
- `signin-form` renders `/sign-in` with `Work email`, `Password`, and button `Sign in`.
- `signup-confirm` shows status `Check your email to confirm your account. Then sign in.` when Auth returns no session.
- `pending-access` shows `Confirm your email` or `Access pending` for an authenticated user without a workspace.
- `mfa-enroll` on `/mfa` offers `Enroll authenticator`, QR `Authenticator enrollment QR code`, `Six digit code`, and `Verify code`.

## How to get to it (user POV)

- Choose `Sign in` or `Get started` on Pulse.
- Submit Get access on `/` (lands on `/sign-up` with email filled).
- Open `/sign-in` or `/sign-up` directly.
- Follow the confirmation link from Inbucket (`http://127.0.0.1:57024`).
- After sign-in with no workspace, the app routes to `/pending-access` or `/workspaces`.
- Open `/mfa` while signed in (identity-only; pending users can enroll).

## Driving it with Playwright

Preconditions:

- Doctor reports `ready: yes`.
- Full launch (Docker + `supabase start` + migrations). `--stand-in` cannot prove this feature.
- Inbucket is up on port `57024`.
- No seed user exists. Use a unique `verify-*@example.com` address. Do not commit passwords; use a dummy value of 12+ characters in the browser only.

- **Open sign-up.** Go to `/sign-up`. Heading `Create your account` is visible. Capture the form.
- **Reject short password.** Fill the required fields, use an 8-character password, tick consent, choose `Sign up`. Role `alert` reads `Use a password with at least 12 characters.`
- **Submit sign-up.** Use a 12+ character dummy password and tick `I agree that MatchMaker HR may contact me about my request.` Choose `Sign up`. Role `status` reads `Check your email to confirm your account. Then sign in.` unless local Auth issued a session (it should not, because confirmations are on).
- **Confirm email.** Open Inbucket at `http://127.0.0.1:57024`, open the message to that address, follow the confirmation link to this app on `127.0.0.1:3100`.
- **Sign in.** Go to `/sign-in`. Fill `Work email` and `Password`. Choose `Sign in`. A success leaves `/sign-in`. Destination is `/admin` for staff, the customer or vendor portal when there is exactly one workspace, otherwise `/workspaces`. Wrong credentials show alert `We could not sign you in. Check your email and password, then try again.`
- **Pending access.** If the user has no organization, `/pending-access` heading is `Confirm your email` or `Access pending`.
- **Proof.** Screenshot the confirmation status and the page after sign-in. Do not screenshot password fields with a value. Record the destination path.

End state that proves it works: a unique sign-up shows the email-confirmation status, Inbucket has the message, and sign-in after confirmation leaves `/sign-in` for a documented destination.

## Gotchas

- `enable_confirmations = true` in `supabase/config.toml`. A sign-up without Inbucket confirmation is not a failed form; it is the designed pause. Report failure only if the confirmation status is missing or Inbucket has no message on a full stack.
- `--stand-in` has no Auth. Opening `/sign-in` may render the form; submitting it is not a pass.
- Origin must be `http://127.0.0.1:3100`. `localhost` trips `requireTrustedServerActionOrigin`.
- AgentID is off (`AGENTID_SIGN_IN_ENABLED=0`). The AgentID button is present but disabled. Do not treat that as a sign-in failure.
- Email send rate limit is 2/hour locally. Reusing the same address too fast looks like a hang.
- There is no seeded password. Inventing one and skipping confirmation is not verification.
- MFA is required for staff-class accounts in product rules. `/mfa` needs an existing session; it is unreachable from a cold public browser.
