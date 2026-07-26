# mmhr brain — STATE
Updated: 2026-07-25

## Current focus
Phase 0 (foundations) is mostly done. Owner gate **G3** is still formally
open, but **Pulse** is now the front-runner and is being iterated on
directly — the owner asked for changes to it rather than picking from the
22 options cold.

## Latest synopsis
Modified Pulse per owner request: a bottom-left → top-right wash in the
existing accent green, plus a full dark/light theme pair on a nav toggle.
Wash is a viewport-fixed pseudo-element (a page-attached diagonal degrades
to vertical on a ~4.9k px page). Light theme required two real inversions,
not a colour flip — bands deepen instead of lifting, and separation comes
from shadow instead of hairlines. See [[journal/2026-07-25]].

## Open threads
- G3 (design direction) is the actual next decision — see
  [[knowledge/roadmap]]. Pulse is approved in substance, not yet ratified.
- **Pending:** production deploy of `3f2288b`. The gallery has **no Vercel
  git integration** — pushing to GitHub deploys nothing; deploys are
  CLI-only (`npx vercel --prod`). See [[journal/2026-07-26]].
- Brain-init / knowledge-build files, `CLAUDE.md` and the `.gitignore`
  addition are still uncommitted.
- Vercel staging deploy of the app itself (distinct from the already-live
  design gallery) is still open.
- Route groups beyond `(auth)` and `/designs` are placeholders — real
  marketing/app/admin pages are Phase 1+ work.

## Active skills in play
- (none yet)

## Notes
- Knowledge docs are now `current` — trust them over re-deriving from
  scratch; re-run the knowledge-build runbook if they drift from a future
  `git log` check (see the Consolidation protocol in `mmhrbrain/CLAUDE.md`).
- dev docs are a baseline; on conflict prefer [[knowledge/superseded]].

