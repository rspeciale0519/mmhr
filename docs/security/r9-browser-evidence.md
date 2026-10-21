# R9 Local Browser Evidence

Updated: 2026-09-03

This record covers local development-server smoke tests. It does not prove staging,
production, authenticated journeys, manual accessibility conformance, or
performance percentiles.

## Environment

- Server: Next.js 16.3.4 at `http://localhost:3000`
- Browser: Codex in-app Browser
- Method: direct navigation, DOM snapshot, route assertion, and console-error check

## Results

| Route | Final URL | Title | Main landmark | Console errors |
|---|---|---|---:|---:|
| `/` | `/` | MatchMaker HR | yes | 0 |
| `/platform` | `/platform` | Platform — MatchMaker HR | yes | 0 |
| `/privacy` | `/privacy` | Privacy policy — MatchMaker HR | yes | 0 |
| `/transparency` | `/transparency` | How we make money — MatchMaker HR | yes | 0 |
| `/sign-in` | `/sign-in` | MatchMaker HR | yes | 0 |
| `/customer` | `/sign-in` | MatchMaker HR | yes | 0 |
| `/vendor` | `/sign-in` | MatchMaker HR | yes | 0 |

The protected customer and vendor routes redirected to sign-in before protected content appeared.

Public snapshots included headings, links, form labels, and landmarks.

Remaining coverage includes authenticated journeys, keyboard and screen-reader checks, responsive checks, performance measurements, target-environment checks, and production smoke tests.

## 2026-09-03 local route and theme smoke

The local Next.js development server was checked with headless Chromium through
the installed Playwright runtime after the in-app browser daemon was unavailable.

| Route | HTTP status | Final URL | Title | H1 | Page errors |
|---|---:|---|---|---:|---:|
| `/` | 200 | `/` | MatchMaker HR | 1 | 0 |
| `/designs/pulse` | 200 | `/designs/pulse` | Pulse — design option | 1 | 0 |
| `/sign-in` | 200 | `/sign-in` | MatchMaker HR | 1 | 0 |
| `/home` | 200 | `/sign-in` | MatchMaker HR | 1 | 0 |
| `/admin` | 200 | `/sign-in` | MatchMaker HR | 1 | 0 |

The Pulse theme control changed from dark to light and updated its accessible
label. The 390px viewport had no horizontal overflow. No console or page errors
occurred during the interaction check.

Keyboard traversal on `/` placed focus on the skip link first, then moved through
the logo, primary links, theme control, calls to action, forms, and footer links.
The automated axe-core scan reported zero violations and zero incomplete checks
for `/`, `/designs/pulse`, and `/sign-in` at desktop and mobile sizes.

A second desktop scan covered all 21 public marketing and gallery routes. All 21
returned HTTP 200 with zero axe-core violations and zero incomplete checks.

The Chromium accessibility tree reported zero unnamed links, buttons, textboxes,
or checkboxes on `/`, `/designs/pulse`, and `/sign-in`. The primary and gallery
navigation landmarks expose accessible names.

One external Sentry telemetry request failed during the route scan. It did not
affect page rendering or navigation.

This remains local evidence only. Target, authenticated, accessibility,
performance, recovery, deployment, and production checks remain open.

## 2026-09-03 HTTP-only fallback check

The existing local Next.js server was checked without a browser runtime because
the dev-browser Chromium installation was unavailable in this environment.
Direct requests returned HTTP 200 for `/`, `/robots.txt`, and `/designs/pulse`.
The root page title was `MatchMaker HR`, the Pulse title was `Pulse — design
option`, and `/robots.txt` returned the development allow rule.

This fallback checks server responses only. It does not replace browser,
accessibility, interaction, target-environment, or production evidence.

## 2026-09-03 production-mode quarantine check

The built application was started with Next.js 16.3.4 at
`http://localhost:3033`. The release lock returned HTTP 503 for `/`,
`/designs/pulse`, `/sign-in`, `/home`, `/admin`, `/customer`, and `/vendor`.
Each route showed the heading `This site is not available yet.` and passed the
axe-core scan with zero violations and zero incomplete checks.

This confirms the local public-release quarantine remains active. It does not
prove a staging or production deployment, authenticated journeys, or live
availability.

## 2026-09-03 Vercel preview delivery check

The current Vercel preview deployment `dpl_BrXV6CNPSc1bHNm2ZLovurggWZ79` is
READY. A direct HTTPS request to
`https://mmhr-8mklivw0r-robs-projects-c72886ba.vercel.app` returned HTTP 200
with the Vercel authentication page. Direct requests to `/`, `/platform`,
`/privacy`, `/sign-in`, and `/designs/pulse` also returned the protected
authentication page, so the application routes were not verified.

This proves only that the protected preview deployment responds. It does not
prove public route delivery, target configuration, authenticated journeys,
accessibility, performance, availability monitoring, deletion or recovery
drills, rollback, or production approval.

## 2026-09-01 production-mode smoke

The built application was started locally with Next.js 16.3.4 at
`http://localhost:3033`. The checked-in public-release gate remained locked.

The tested routes (`/`, `/platform`, `/privacy`, `/transparency`, `/sign-in`,
`/customer`, `/vendor`, and `/designs/pulse`) each returned the intentional
503 quarantine page with the heading `This site is not available yet.`.
Each route had a main landmark and zero browser console errors. This is local
evidence that the public-release block is active. It does not prove target or
production deployment, authenticated journeys, accessibility, or performance.
