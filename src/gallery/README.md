# MMHR design gallery

The gallery holds complete home-page designs for review. Each design shows the working parts of the platform: the vendor scorecard, case progress, forms with validation, dialogs, menus, tabs, status labels, empty and loading states, and light and dark modes.

- Overview: `/gallery`
- One design: `/gallery/<slug>`
- Move between designs with the bar at the bottom of each page, or the `[` and `]` keys.

## Structure

| Path | Purpose |
|---|---|
| `registry.ts` | The list of designs, with name, idea, palette, typefaces, review round, and a lazy import of each home page |
| `design-fonts.ts` | Display-font classes, so the overview shows each design's name in its own type |
| `switcher.tsx` | The floating bar that moves between designs |
| `kit/` | Shared behavior and sample data that every design styles in its own way |
| `designs/<slug>/` | One design: `home.tsx`, `fonts.ts`, and its CSS modules |
| `src/app/gallery/` | The overview page and the per-design route |

The kit components take a `ui` object that maps named slots to CSS module classes. Behavior, accessibility, and data stay identical across designs, and each design controls the look completely.

| Kit file | What it provides |
|---|---|
| `scorecard.tsx`, `use-scorecard.ts` | Masked vendor scorecard, evidence popovers, disclosure preview, and the up-to-five contender rule |
| `stage-trace.tsx` | Case stages as an ordered list with `data-state` on each step |
| `needs-form.tsx` | Needs assessment with inline errors, an error summary that takes focus, and a saving state |
| `overlays.tsx` | Approval dialog, case actions menu, and the mobile navigation sheet |
| `bits.tsx` | Status labels, the FAQ accordion, case activity tabs with empty and loading states, and the theme switch |
| `design-root.tsx`, `portal.ts` | The design's root element; dialogs and menus mount inside it so they inherit its tokens and theme |
| `use-in-view.ts`, `use-count-up.ts` | Start a design's signature animation when it scrolls into view |
| `use-scroll-progress.ts` | Scroll progress through a pinned section or past a line in the viewport, without React re-renders |
| `use-scramble.ts`, `use-reduced-motion.ts` | Text that decodes into place, and the visitor's motion preference |
| `weighted-fit.ts` | Fit scores from requirement weights, and the ranking they produce |
| `parts-ui.ts` | Maps a design's CSS module to every kit slot by a shared class naming convention |
| `soft-home.tsx`, `soft-page.module.css`, `soft-parts.module.css` | Round 3 page frame and part styles driven by `--t-*` tokens; a design sets the tokens, adds its hero, and extends classes with `mergeClasses` |
| `case-board.tsx` | The signed-in case view: progress, activity tabs, actions menu, and the approval dialog |
| `data.ts` | Fictional sample content |

## Add a design

1. Create `src/gallery/designs/<slug>/` with `fonts.ts` exporting `display`, and `home.tsx` with a default export marked `"use client"`.
2. Wrap the page in `DesignRoot` and pass the theme from `useDesignTheme("<slug>", "light")`.
3. Compose the kit components and style them through their `ui` slots in the design's CSS modules. Naming the classes as in `parts-ui.ts` lets `scorecardUi(p)`, `formUi(p)`, and the other helpers wire every slot.
4. Add an entry to `galleryDesigns` in `registry.ts` with the next `round` number, and the font to `design-fonts.ts`. The overview groups designs by round, newest first; add the round's heading to `src/app/gallery/page.tsx`.
5. Run `npx vitest run src/gallery`. The registry test checks the slug, palette, and required files.

Quality floor for every design: no horizontal page scroll at 375 pixels wide, visible keyboard focus, text contrast of at least 4.5:1, form control borders of at least 3:1, motion only under `prefers-reduced-motion: no-preference`, and grid items with `min-width: 0` where a child scrolls sideways.

Round 4 designs (Stack, Graph, Query, Radar, Launch) write colors in OKLCH and follow the good-css.com rules. Every 3D view, animation, and control in them answers a buying question: which vendors cover a layer, which meet a requirement, how the ranking changes, how shapes compare, and choosing from the product preview. Idle spins and pointer tilts were removed.

Round 3 designs (Lumen, Halo, Plinth, Vista, Fold) use CSS 3D transforms and layered shadows. Where a renderer ignores `backface-visibility`, the code also switches the hidden face off.

Signature effects use only browser features: WebGL2 (Mercury), CSS transforms over repeated layers (Reeded), pointer and keyboard sliders with FLIP motion (Console), Canvas 2D (Sift), and CSS variable fonts driven by scroll speed (Velocity). No animation library is installed. Each effect stops when off screen or under reduced motion, and has a still fallback.

All companies, people, and vendors in the sample data are fictional.
