---
kind: knowledge
slug: superseded
status: current
updated: 2026-07-15
layer: reference
sources:
  - docs/ROADMAP.md
  - src/server/trpc/root.ts
  - src/app/(marketing)/page.tsx
---

# Superseded — doc-vs-code deltas

No genuine doc-vs-truth contradictions found in this pass. Every `[x]` in
`docs/ROADMAP.md`'s Phase 0 section checked out against actual code
(re-verified by re-opening the cited files, not just trusting a first read).

One granularity nuance worth flagging (not a contradiction, since the
checkmark's literal claim is true — just coarser than a reader might assume):

- **"Next.js scaffold with route groups" `[x]`** — true: all four route
  groups exist and render. But three of four ((marketing) minus /designs,
  (app), (admin)) are single-line placeholders, not real pages. Read the
  checkmark as "scaffold exists," not "pages are built."
- **"tRPC wiring" `[x]`** — true: the plumbing (router → API route → client
  provider) is fully wired end-to-end. But `appRouter` holds only a `health`
  check — no business logic router exists yet. Read the checkmark as "the
  pipe is connected," not "there's water in it."

If a future pass finds a real contradiction (doc claims X, code shows
not-X), record it here with both citations and which one wins, then correct
the losing side.

