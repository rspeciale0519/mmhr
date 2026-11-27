/**
 * The home page's scroll reveal, now one implementation shared with every
 * page: the motion toolkit's RevealAll (src/designs/cobalt/motion/).
 *
 * Usage is unchanged: blocks carry `data-co-reveal=""` in the server HTML
 * and `<ScrollReveal />` is rendered once in the page body. After the page
 * loads, blocks still below the screen are set to "wait" (hidden a little
 * lower down), then to "in" as they arrive; home.css and motion-kit.css play
 * the entrance. Without JavaScript, with reduced motion, or after unmount,
 * every block is shown. See motion/reveal-observer.ts for the rules.
 *
 * The home page itself no longer renders it: its blocks use Reveal,
 * RevealGroup and SplitText directly. Kept for markup that cannot be
 * wrapped, and covered by ScrollReveal.test.tsx.
 */
export { RevealAll as ScrollReveal } from "../motion/Reveal";
