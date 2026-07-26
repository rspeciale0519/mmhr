# mmhr brain — STATE
Updated: 2026-07-26

## Current focus
Phase 0 (foundations) is mostly done. **G3 is decided in practice: Pulse is
the locked-in frontend**, rendering at `/`. The design gallery is deliberately
**unchanged** — all 22 layouts stay in `src/designs/` and stay live at
`/designs`. Next real work is Phase 1 marketing content (FR-M2) against
Pulse's layout.

## Latest synopsis
One-line change in the end: `(marketing)/page.tsx` renders
`@/designs/pulse/Design`. Pulse stays in the gallery, so `/` and
`/designs/pulse` are the same component — one source, no drift. Gates green
(type-check, 16/16 tests, build with all 22 design routes + `/` prerendered);
browser-verified. Uncommitted. See [[journal/2026-07-26]].

## Open threads
- **Nothing from this task is committed**, and it sits on
  `codex/competitor-analysis` — the wrong branch for a frontend lock-in
  (Pulse's lineage is `feature/foundations`). Owner picks the branch first.
- **Pending:** production deploy of `3f2288b`, now compounded because `/`
  has changed too. The gallery has **no Vercel git integration** — pushing
  to GitHub deploys nothing; deploys are CLI-only (`npx vercel --prod`).
- Placeholder figures (NPS 74, 310 companies) now render at the **site
  root**, not just behind a noindex gallery. Real FR-M2 copy is Phase 1.
- Editing `src/designs/pulse/` now changes production, not just a gallery
  entry. Anyone treating `src/designs/` as a scratch area needs to know.
- `npm run lint` exits 1 on 52 pre-existing `no-require-imports` errors in
  `.claude/hooks/**` + `.codex/hooks/**` (sync-managed, not hand-editable).
  Unrelated to app code — don't mistake it for a regression.
- Port 3007 runs a **stale** `next start` from the old GALLERY_ONLY build
  (its `.next` was overwritten); it backs the owner's Tailscale review URL.
- Brain-init / knowledge-build files, `CLAUDE.md` and the `.gitignore`
  addition are still uncommitted.
- Vercel staging deploy of the app itself is still open.
- Route groups beyond `(auth)`, `/` and `/designs` are placeholders — real
  app/admin pages are Phase 1+ work.

## Active skills in play
- (none yet)

## Notes
- Knowledge docs are now `current` — trust them over re-deriving from
  scratch; re-run the knowledge-build runbook if they drift from a future
  `git log` check (see the Consolidation protocol in `mmhrbrain/CLAUDE.md`).
- dev docs are a baseline; on conflict prefer [[knowledge/superseded]].

