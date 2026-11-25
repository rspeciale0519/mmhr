"use client";

import { useEffect } from "react";

/** Attribute that marks a block to reveal. Values: "" (shown), "wait", "in". */
const ATTRIBUTE = "data-co-reveal";

/**
 * Makes home page blocks settle into place as they scroll into view.
 *
 * How it works: blocks that should reveal carry `data-co-reveal=""` in the
 * server HTML, which home.css shows normally. After the page loads, this
 * component sets every block that is still below the screen to "wait"
 * (home.css hides it a little lower down), then an IntersectionObserver sets
 * each one to "in" when it comes near the screen, and home.css animates it
 * back to its normal place.
 *
 * Why it is built this way:
 * - Without JavaScript, or before this runs, every block is visible. Only
 *   blocks the visitor cannot see yet are ever hidden, so nothing flashes.
 * - Visitors who ask for reduced motion, and browsers without
 *   IntersectionObserver, get the plain page: this component does nothing.
 * - On unmount every block goes back to "" (shown), so a block can never be
 *   left hidden.
 *
 * It renders nothing. Put it once in the page body.
 */
export function ScrollReveal() {
  useEffect(() => {
    const lessMotion =
      typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (lessMotion || typeof IntersectionObserver === "undefined") return;

    const blocks = [...document.querySelectorAll<HTMLElement>(`[${ATTRIBUTE}]`)];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute(ATTRIBUTE, "in");
          // Each block reveals once; scrolling back up does not replay it.
          observer.unobserve(entry.target);
        }
      },
      // Start a little before the block's top edge reaches the bottom of the
      // screen, so it is already moving when the visitor sees it.
      { rootMargin: "0px 0px -8% 0px" },
    );

    for (const block of blocks) {
      // Blocks already on screen stay as they are.
      if (block.getBoundingClientRect().top < window.innerHeight) continue;
      block.setAttribute(ATTRIBUTE, "wait");
      observer.observe(block);
    }

    // A keyboard user can Tab to a link inside a block that is still waiting.
    // Show that block at once, so the focused link is never invisible.
    const revealFocused = (event: FocusEvent) => {
      const block = (event.target as Element | null)?.closest?.(`[${ATTRIBUTE}="wait"]`);
      if (!block) return;
      block.setAttribute(ATTRIBUTE, "in");
      observer.unobserve(block);
    };
    document.addEventListener("focusin", revealFocused);

    return () => {
      document.removeEventListener("focusin", revealFocused);
      observer.disconnect();
      for (const block of blocks) block.setAttribute(ATTRIBUTE, "");
    };
  }, []);

  return null;
}
