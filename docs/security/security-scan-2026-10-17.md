> **Status (2026-10-21).** This report describes the original Cursor branch
> (`cursor/security-scan-2026-10-17-cef8`, base `b1ffbe1`). The branch was
> rebuilt on `develop` after PR #10 merged. Differences from the text below:
> C1 moved `develop` from 16.3.8 (not 16.2.10) to 16.4.2, because the
> 2026-10-14 fixes shipped only in 16.4.1. M2 is superseded by the registration
> rewrite already on `develop` (generic errors, 12 to 72 character rule). L2 no
> longer forces `HttpOnly`: the browser Supabase client reads the auth cookie for
> MFA, so only `Secure` (HTTPS) and `SameSite=Lax` are applied. `src/middleware.ts`
> is now `src/proxy.ts`, which makes I7 closed. The verification figures at the
> end are the original branch's, not this rebuild's.

# Security scan — 17 October 2026

Scan of the MatchMaker HR repository on `develop` (`b1ffbe1`), then fixes on
`cursor/security-scan-2026-10-17-cef8`. Owner (Rob Speciale) approved the scan.

Method: broad sweep of auth, RLS, APIs, Server Actions, CI, cookies, headers,
dependencies, and git history; then an independent disprove pass on every
candidate; then local attack checks only. Production, live email/SMS, real cards,
and real databases were not touched. No secret values are written in this file.

**Live secrets in tracked files or reachable history:** none found. Two local
placeholder database URLs exist (well-known local Postgres credentials, not cloud
keys): `src/server/db/r1-migration-rehearsal.ts:261` and
`scripts/r1-with-local-worker.mjs:220`.

---

## Critical

### C1. The website framework was missing several 2026 security patches

The app was pinned to Next.js 16.2.10. That version is in the affected range for
the 21 July 2026 Next.js security release (Server Action CPU denial of service,
and other 16.2.11 fixes) and is behind the 14 October 2026 Active LTS floor
(16.4.1), which patches two unauthenticated remote-code-execution advisories.
This app has Server Actions (`signUp`, `signIn`, `signOut`) and App Router, so
the Server Action denial-of-service issue applied. The image-optimization and
`use cache` RCEs were vendor-critical; this repo does not use `use cache` or
`next/image`, but 16.2 is no longer on the patched LTS line.

- File: `package.json:28` (was 16.2.10)
- Proof: `npm audit` before the upgrade reported `critical:next` with those
  advisories. After upgrading to 16.4.2, `next` is absent from `npm audit`.
  Regression: `src/lib/patched-next.test.ts` requires Next.js >= 16.4.1.
- Status: **fixed in this PR** (Next.js and `eslint-config-next` 16.4.2).
- Owner still needs to **deploy** the patched build. This PR does not deploy.

---

## High

### H1. The recorded public production site may still be an older unprotected build

Project memory says the current production URL is still reachable and that the
public-release gate is not active on that deployment. Current `develop` code
does block production (`NODE_ENV=production` and no checked-in approval ID).
This scan did not probe the live site.

- File: `src/lib/public-release.ts:7` (`CHECKED_IN_PUBLIC_RELEASE_ID` is null);
  `src/middleware.ts:41`
- Proof: local `npm run start` (production mode) returned **503** for `/`,
  `/admin`, and `/api/trpc/health.ping`, with body
  `This site is not available yet.` / `{"error":"service_unavailable"}`.
- Status: **owner action**. Do not assume production is safe until old URLs and
  aliases are retired or this build is an approved production deploy.
- Recommended fix: confirm every production alias is either the gated build or
  taken down. Rotate anything that older builds may have logged. Do not deploy
  from this scan.

---

## Medium

### M1. Pages could be put in a fake frame and browsers were not given basic locks

Application responses did not send `X-Frame-Options`, a framing CSP,
`nosniff`, or HSTS. The sign-in page could be framed. Only the public-release
holding page had a tight CSP.

- File: `next.config.ts` (had no `headers()`); `src/middleware.ts:12`
- Proof: unit tests in `src/lib/security-headers.test.ts` and
  `src/middleware.test.ts`. Local production curl:

  ```
  curl -sS -D - -o /dev/null http://127.0.0.1:3000/
  ```

  now includes `x-frame-options: DENY`, `x-content-type-options: nosniff`,
  `content-security-policy: default-src 'none'; ... frame-ancestors 'none'`,
  and `strict-transport-security: max-age=31536000; includeSubDomains`.
- Status: **fixed in this PR**.
- Note: CSP is additive (`frame-ancestors` / `base-uri` / `form-action` /
  `object-src`) so Next.js, Sentry, and PostHog keep working. It is not a
  full script lockdown.

### M2. Sign-in and sign-up told the browser the provider’s exact error

A crafted Server Action could learn whether an email was already registered
(`User already registered`) and could skip the 12-character password rule by
bypassing the HTML form. The HTML `minLength` is not a security control.

- File: `src/app/(auth)/actions.ts:46` (sign-up) and `:73` (sign-in);
  parser in `src/server/auth/credentials.ts:21`
- Proof: `src/app/(auth)/actions.test.ts` — a mocked
  `User already registered` now returns the generic sign-up message; a
  5-character password is rejected **before** `createClient()` is called.
- Status: **fixed in this PR**.

### M3. Local auth allowed a new confirmation or reset email every second

`supabase/config.toml` set `[auth.email] max_frequency = "1s"`. If this local
template is copied to a project with real SMTP, an attacker can flood an inbox.
Local Inbucket does not send real mail.

- File: `supabase/config.toml` (email `max_frequency`, previously `"1s"`)
- Proof: `src/server/auth/local-auth-config.test.ts` requires `"60s"` in the
  `[auth.email]` block.
- Status: **fixed in this PR** for the local config only.
- Owner still needs to confirm the **cloud** Auth settings match: password
  length 12, email confirmations on, and a sane email throttle. This scan did
  not change cloud Auth.

---

## Low (fixed in this PR unless noted)

### L1. Analytics consent cookie had no `Secure` flag — **fixed**

`src/lib/analytics/consent.ts`. HTTPS now adds `Secure`. Proof:
`src/lib/analytics/consent.test.ts`.

### L2. Session cookies did not force HttpOnly / Lax / Secure — **fixed**

`src/lib/session-cookie.ts`, applied in `src/middleware.ts` and
`src/lib/supabase/server.ts`. Proof: `src/lib/session-cookie.test.ts` and the
middleware cookie-refresh test (HTTPS responses include `HttpOnly`,
`SameSite=Lax`, `Secure`).

### L3. GitHub Actions token was not limited to read-only contents — **fixed**

`.github/workflows/ci.yml:14-15` now has `permissions: contents: read`.
Proof: `src/server/auth/ci-permissions.test.ts`.

### L4. Private helper SQL functions granted EXECUTE to `anon` — **not changed**

`drizzle/0002_r1_request_scoped_access.sql:92-94`. `mmhr_private` is not in the
Data API schemas (`supabase/config.toml` exposes `public` and `graphql_public`
only) and `USAGE` on that schema was revoked from `PUBLIC`, so this is not
reachable through the API. A later migration can revoke those EXECUTE grants.
No migration was added in this PR.

---

## Info

| ID | Summary | Status |
|---|---|---|
| I1 | No Stripe/webhooks/uploads/cron routes exist yet, so those attack classes have no current entry point. | Watch future PRs. |
| I2 | RLS deny-all plus field-safe functions already have local A/B tests in `src/server/auth/rls.integration.test.ts`. This session could not start Supabase, so those tests were not re-run. | Re-run `npm run test:integration` on a machine with the local stack. |
| I3 | `/admin` still identity-then-`forbidden()`. `/home` is pending-access only. tRPC has no mutations. `health.whoami` is identity-only. | Current contract. |
| I4 | Open registration is intentional for the auth round-trip. Cloud `enable_signup` should stay reviewed until the real registration gate ships. | Owner product decision. |
| I5 | `createRequestScopedClient` compares `identities.id` to the JWT `sub` (auth user id). Those IDs are different unless inserted equal, so the helper fail-closes. Not a bypass. | Later identity work should compare `auth_user_id`. |
| I6 | Remaining `npm audit` critical after the Next upgrade is `proxy-addr`, pulled by the unused `shadcn` CLI (`express`), not the Next request path. | Owner: consider moving `shadcn` to `devDependencies`. |
| I7 | Next.js 16.4.2 warns that `middleware.ts` is deprecated in favor of `proxy`. Behavior is unchanged. | Follow-up refactor, not a vuln. |
| I8 | No `getSession()` authorization, no `dangerouslySetInnerHTML`, no open redirects, no `Math.random` for secrets, no `pull_request_target`, no CORS `*`. | Disproved this pass. |
| I9 | Sentry `tracesSampleRate: 1` if a public DSN is set. Replay is off. | Owner: lower sample rate before a busy launch. |
| I10 | App-level login rate limits are not implemented; local GoTrue allows 30 sign-in/sign-up requests per IP per 5 minutes. | Owner: confirm cloud rate limits and captcha before public sign-up. |

---

## Local attack checks (test data / local server only)

Accounts A/B/admin against a live local Supabase stack were **not** created in
this session (no local stack). Existing integration tests already cover:

- anonymous clients cannot read tables or fixed functions
- cross-organization IDs return no rows
- viewers cannot read member lists; org admins can
- raw table insert/update/delete fail closed

This session’s local HTTP checks (production `next start`, placeholder env,
loopback only):

| Check | Result |
|---|---|
| Unauthenticated `/` | 503 holding page |
| Unauthenticated `/admin` | 503 holding page (gate before the 403) |
| `/api/trpc/health.ping` | 503 `{ "error": "service_unavailable" }` |
| POST Server Action with `origin: https://evil.example` | 403 |
| GET with `next-action` | 403 |
| Framing / sniffing headers | present (see M1) |

Unit stand-ins for impersonation and privilege:

- `health.whoami` rejects `{ user: null }` (`src/server/trpc/health.test.ts`)
- `/admin` always `forbidden()` after identity (`src/app/(admin)/admin/page.test.tsx`)
- source contract forbids actor-override headers and `getSession()` auth
  (`src/server/auth/security-source-contract.test.ts`)

---

## Verification run

```
npm run type-check   # pass
npm run lint         # pass
npm test             # 117 passed / 26 files
npm run build        # Next.js 16.4.2, 55 pages
```

`npm run test:integration` was not run (no local Supabase).
