# MMHR design gallery

The gallery holds complete home-page designs for review. Each design shows the working parts of the platform: the vendor scorecard, case progress, forms with validation, dialogs, menus, tabs, status labels, empty and loading states, and light and dark modes.

- Overview: `/gallery`
- One design: `/gallery/<slug>`
- Final design builder: `/gallery/final`
- Review inbox: `/gallery/inbox`
- Move between designs with the review bar at the bottom of each page, the `←` and `→` keys, or the `[` and `]` keys.

## Structure

| Path | Purpose |
|---|---|
| `registry.ts` | The list of designs, with name, idea, palette, typefaces, review round, and a lazy import of each home page |
| `design-fonts.ts` | Display-font classes, so the overview shows each design's name in its own type |
| `review/` | The review tools: the bottom review bar, design switcher, comments, picks, notes, final design builder, and their storage |
| `kit/` | Shared behavior and sample data that every design styles in its own way |
| `designs/<slug>/` | One design: `home.tsx`, `fonts.ts`, and its CSS modules |
| `src/app/gallery/` | The overview page, the per-design route, the final design builder, and the inbox |
| `src/app/api/gallery/` | The two review endpoints: `feedback` (comments, notes, picks) and `recipes` (final designs) |
| `public/gallery-previews/<slug>.jpg` | The preview image of each design's first screen |

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

## Review tools

Every gallery page has the review bar at the bottom. On a design page, a reviewer can:

- **Comment**: click any part of the page and leave a comment. A numbered pin marks the spot for later reviewers.
- **Pick pieces**: click a section to add it to their picks. Chips add page-wide pieces: fonts, colors, motion, and light and dark modes.
- **Write a note**: send a general note about the page.
- **Build final design**: open `/gallery/final`, choose which design each piece comes from, and send the recipe. Picks fill in the rows.

The team reads everything at `/gallery/inbox`: pick counts by piece, final designs, comments, and notes.

The pieces are listed in `review/parts.ts`. `tagParts()` finds each section in a design from the shared id and label conventions: a `header`, a hero section labelled by `<slug>-hero-title`, promises, ids that end in `-scorecard`, `-steps` (or `-how`, `-flow`, `-engagement`, `-method`, `-journey`), `-case`, `-needs`, and `-faq`, a closing section labelled by `<slug>-closing-title`, and the last `footer`. A new design that follows these conventions works with the review tools with no extra code.

### Storage

Review records live in a separate Postgres database set by `GALLERY_REVIEW_DATABASE_URL`, never in the MMHR application database. The records are reviewer names and design notes only. Without the variable, the tools show the pages and report that review storage is not set up. The store creates its tables (`review/schema.ts`) on first use, so a new database needs no setup step.

- Local: create the database with `docker exec supabase_db_mmhr psql -U postgres -c "create database gallery_review"`, then set `GALLERY_REVIEW_DATABASE_URL` in `.env.development.local` to the `DB URL` that `supabase status` prints, with the database name changed from `postgres` to `gallery_review`. The tracked-file secret scan rejects a URL that contains a user and password, so do not write the full URL here.
- Vercel: a Neon database connected to the project for the Preview environment only, with the variable prefix `GALLERY_REVIEW_`. The prefix keeps it from replacing the application's `DATABASE_URL`.

On Vercel, the release gate opens the gallery pages and the two review endpoints only on preview deployments (`isGalleryPreviewRequest` in `src/lib/public-release.ts`). Production stays closed. Saves must come from the same host, as JSON.

### Preview images

The overview and the design switcher show `public/gallery-previews/<slug>.jpg`. To refresh an image, capture the design at 1280 by 1000 pixels with headless Chrome, for example `chrome --headless=new --hide-scrollbars --window-size=1280,1000 --virtual-time-budget=9000 --screenshot=<file>.png http://127.0.0.1:3100/gallery/<slug>`. Then crop the top 1280 by 800 pixels and save it as a JPEG at quality 80 (`sharp` is installed with Next.js). The crop removes the review bar and the cookie banner. Without an image, the overview shows the palette instead.

## Add a design

1. Create `src/gallery/designs/<slug>/` with `fonts.ts` exporting `display`, and `home.tsx` with a default export marked `"use client"`. Fonts are self-hosted: add the files to `src/assets/fonts` and load them with `next/font/local` (see `src/assets/fonts/README.md`).
2. Wrap the page in `DesignRoot` and pass the theme from `useDesignTheme("<slug>", "light")`.
3. Compose the kit components and style them through their `ui` slots in the design's CSS modules. Naming the classes as in `parts-ui.ts` lets `scorecardUi(p)`, `formUi(p)`, and the other helpers wire every slot.
4. Add an entry to `galleryDesigns` in `registry.ts` with the next `round` number, and the font to `design-fonts.ts`. The overview groups designs by round, newest first; add the round's heading to `src/app/gallery/page.tsx`.
5. Add the slug to `designSlugs` in `review/model.ts`, and capture its preview image.
6. Run `npx vitest run src/gallery`. The registry test checks the slug, palette, and required files. The review test checks that `designSlugs` matches the registry.

Quality floor for every design: no horizontal page scroll at 375 pixels wide, visible keyboard focus, text contrast of at least 4.5:1, form control borders of at least 3:1, motion only under `prefers-reduced-motion: no-preference`, and grid items with `min-width: 0` where a child scrolls sideways.

Round 4 designs (Stack, Graph, Query, Radar, Launch) write colors in OKLCH and follow the good-css.com rules. Every 3D view, animation, and control in them answers a buying question: which vendors cover a layer, which meet a requirement, how the ranking changes, how shapes compare, and choosing from the product preview. Idle spins and pointer tilts were removed.

Round 3 designs (Lumen, Halo, Plinth, Vista, Fold) use CSS 3D transforms and layered shadows. Where a renderer ignores `backface-visibility`, the code also switches the hidden face off.

Signature effects use only browser features: WebGL2 (Mercury), CSS transforms over repeated layers (Reeded), pointer and keyboard sliders with FLIP motion (Console), Canvas 2D (Sift), and CSS variable fonts driven by scroll speed (Velocity). No animation library is installed. Each effect stops when off screen or under reduced motion, and has a still fallback.

All companies, people, and vendors in the sample data are fictional.
