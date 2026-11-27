import { motionAllowed } from "./media";

/**
 * The one scroll-reveal engine. Reveal, RevealGroup, RevealAll, SplitText
 * (trigger "view") and the home page's ScrollReveal all use it.
 *
 * The attribute `data-co-reveal` holds the state:
 * - ""     shown (server HTML, no JavaScript, reduced motion, after unmount)
 * - "wait" hidden, waiting below the screen (motion-kit.css hides it)
 * - "in"   on its way in (motion-kit.css plays the entrance)
 *
 * Rules that keep it safe:
 * - Only elements that are still below the screen when the page has loaded
 *   are hidden, so nothing the visitor can already see ever flashes away.
 * - Visitors who ask for less motion, and browsers without
 *   IntersectionObserver, get the plain page: nothing is hidden.
 * - If keyboard focus lands inside a waiting element, it is shown at once.
 * - Stopping a watch shows the element again, so nothing stays hidden.
 *
 * Works in every current browser: it does not rely on CSS scroll-driven
 * animations (`animation-timeline`), which Firefox and older Safari lack.
 */

export const REVEAL_ATTRIBUTE = "data-co-reveal";

const watched = new Set<Element>();
let observer: IntersectionObserver | null = null;

function reveal(element: Element) {
  element.setAttribute(REVEAL_ATTRIBUTE, "in");
  observer?.unobserve(element);
}

// A keyboard user can Tab to a link inside an element that is still waiting.
// Show it (and any waiting element around it) at once.
function revealFocused(event: FocusEvent) {
  let node = event.target instanceof Element ? event.target.closest(`[${REVEAL_ATTRIBUTE}="wait"]`) : null;
  while (node) {
    reveal(node);
    node = node.parentElement?.closest(`[${REVEAL_ATTRIBUTE}="wait"]`) ?? null;
  }
}

function start() {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    },
    // Start a little before the element's top reaches the bottom of the
    // screen, so it is already moving when the visitor sees it.
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.addEventListener("focusin", revealFocused);
}

function stop() {
  observer?.disconnect();
  observer = null;
  document.removeEventListener("focusin", revealFocused);
}

/**
 * Starts watching one element. Returns the function that stops (and shows it
 * again). Watching an element twice is harmless: the second call does nothing
 * and returns a no-op.
 */
export function watchReveal(element: Element | null): () => void {
  if (!element || watched.has(element)) return () => {};
  if (!motionAllowed() || typeof IntersectionObserver === "undefined") return () => {};
  // Already on screen (or above it): leave it exactly as the server drew it.
  if (element.getBoundingClientRect().top < window.innerHeight) return () => {};

  watched.add(element);
  if (!observer) start();
  element.setAttribute(REVEAL_ATTRIBUTE, "wait");
  observer!.observe(element);

  return () => {
    if (!watched.delete(element)) return;
    observer?.unobserve(element);
    element.setAttribute(REVEAL_ATTRIBUTE, "");
    if (watched.size === 0) stop();
  };
}
