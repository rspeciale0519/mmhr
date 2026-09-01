# R9 Local Browser Evidence

Updated: 2026-08-31

This record covers a local development-server smoke test. It does not prove staging, production, authenticated journeys, accessibility conformance, or performance percentiles.

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

## 2026-09-01 production-mode smoke

The built application was started locally with Next.js 16.3.4 at
`http://localhost:3033`. The checked-in public-release gate remained locked.

The tested routes (`/`, `/platform`, `/privacy`, `/transparency`, `/sign-in`,
`/customer`, `/vendor`, and `/designs/pulse`) each returned the intentional
503 quarantine page with the heading `This site is not available yet.`.
Each route had a main landmark and zero browser console errors. This is local
evidence that the public-release block is active. It does not prove target or
production deployment, authenticated journeys, accessibility, or performance.
