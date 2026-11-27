/**
 * Cobalt motion toolkit. Import from "@/designs/cobalt/motion".
 *
 * Every export works in every current browser (no CSS scroll-timeline
 * needed), keeps the server HTML fully readable without JavaScript, and has a
 * still version for `prefers-reduced-motion: reduce`. Styles live in
 * ./motion-kit.css (loaded once by src/app/layout.tsx); button and link
 * upgrades are global in ../motion.css. All components are Client Components
 * but can be rendered from Server Components with server-rendered children.
 *
 * ENTRANCES
 *   Reveal        Plays an entrance when it scrolls into view. Only elements
 *                 still below the screen after load are hidden first.
 *                 <Reveal variant="rise|fade|scale|left|right|clip" index={i} delay={120} as="li">...</Reveal>
 *   RevealGroup   The wrapper stays; its direct children rise in one by one.
 *                 <RevealGroup as="ul" className="my-grid" stagger={70}>{items}</RevealGroup>
 *   RevealAll     For Server Component markup: put data-co-reveal="" (and
 *                 optional data-co-variant="fade" etc., style --i for order)
 *                 on elements, render this once per page.
 *                 <li data-co-reveal="" data-co-variant="scale" style={{ "--i": 2 }}>...</li>  +  <RevealAll />
 *   SplitText     Headline whose words rise one after another, masked.
 *                 Text stays real, once, with real spaces (a11y, SEO, find).
 *                 <SplitText as="h2" id="x-title" text="Names stay masked." />           (on scroll)
 *                 <SplitText as="h1" className="co-pt" text={title} trigger="load" />  (on paint)
 *   class co-enter  CSS-only entrance on first paint, for above-the-fold bits.
 *                 <p className="co-lede co-enter" style={{ "--co-delay": "260ms" }}>...</p>
 *
 * POINTER (mouse/trackpad only; touch gets press states; off with reduced motion)
 *   Spotlight     Surface with a soft light under the cursor and a border
 *                 that glows nearest it. Put the card classes on it.
 *                 <Spotlight className="co-gl co-card" as="article">...</Spotlight>
 *   Tilt          3D tilt toward the cursor, springs back. Outer box stays
 *                 still (stable hover area); the card look goes on the inner.
 *                 <Tilt innerClassName="co-gl co-card" max={6} spotlight>...</Tilt>
 *   Magnetic      One button/link leans toward the cursor (max 8px).
 *                 <Magnetic><Link className="co-btn co-btn-p" href="/sign-up">Start free</Link></Magnetic>
 *
 * NUMBERS AND SCROLL
 *   CountUp       Counts to `value` when it scrolls into view; the real value
 *                 is in the HTML; no layout shift (reserved width).
 *                 <CountUp value={5} />   <CountUp value={1200} prefix="$" suffix="/mo" decimals={0} />
 *   Parallax      Decorative layer moving at another rate than the page.
 *                 <Parallax speed={0.2} max={80} className="my-glow" aria-hidden="true" />
 *   useScrollProgress(ref, { page?, onChange? })
 *                 Writes --co-progress (0..1) on ref's element: progress
 *                 through that element (or the whole page). Drive CSS with it.
 *                 useScrollProgress(ref);  ->  .bar { scale: var(--co-progress, 0) 1; }
 *   useInView(ref, { once?, rootMargin?, threshold? }) -> boolean
 *                 Start/pause your own loops (canvas, timers) off screen.
 *   onScrollFrame({ read, write }) -> stop
 *                 Low level: the shared scroll/resize frame loop. Measure in
 *                 read, write styles in write. Call stop() in effect cleanup.
 *   useReducedMotion() / useFinePointer() -> boolean   (false on the server)
 *
 * DISCLOSURE
 *   AccordionItem Expandable row: <hN><button aria-expanded> + panel with an
 *                 animated height and a plus-to-minus icon. Server HTML has it
 *                 open; closed panels keep their content (hidden="until-found").
 *                 <AccordionItem title="Do customers pay?" defaultOpen headingLevel={3}><p>No.</p></AccordionItem>
 *
 * GLOBAL CSS YOU GET FOR FREE (../motion.css, ../pages.css)
 *   .co-btn       sheen sweep on hover (.co-btn-p), press squash, an end
 *                 svg or .co-btn-icon nudges right on hover, animated focus ring.
 *   .co-link      stand-alone link whose underline draws in on hover.
 *   Links inside .co-prose, .co-page-copy, AccordionItem: underline turns cobalt.
 *   Variables:    --co-ease (fast out, soft landing), --co-spring (overshoot),
 *                 --co-delay (ms, entrance wait), --i (position in a row),
 *                 --co-stagger (ms between rows).
 *
 * DO
 *   - Keep text in the DOM; animate translate/scale/rotate/opacity/clip-path.
 *   - Put hover effects on a child of Reveal, not on the Reveal element: the
 *     entrance owns the wrapper's animation, opacity, translate and scale.
 *   - Use `translate`/`scale` (not `transform`) for your own hover moves on
 *     buttons, so they combine with Magnetic and the press squash.
 *   - Give every new effect a reduced-motion branch and a touch alternative.
 * DON'T
 *   - Don't nest Spotlight inside Tilt; use <Tilt spotlight>.
 *   - Don't wrap the h1 in Reveal (it is above the fold: use SplitText
 *     trigger="load" or co-enter), and don't Reveal text people must read
 *     before they scroll.
 *   - Don't use Magnetic inside stretched grid cells (the wrapper is
 *     inline-flex) or on form fields.
 *   - Don't add scroll listeners of your own; use onScrollFrame or the hooks.
 */

export { AccordionItem } from "./Accordion";
export { CountUp } from "./CountUp";
export { onScrollFrame } from "./frame";
export { useFinePointer, useReducedMotion } from "./media";
export { Magnetic, Spotlight, Tilt } from "./pointer";
export { Reveal, RevealAll, RevealGroup, type RevealVariant } from "./Reveal";
export { Parallax, useInView, useScrollProgress } from "./scroll";
export { SplitText } from "./SplitText";
