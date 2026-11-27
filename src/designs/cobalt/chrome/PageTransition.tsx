/// <reference types="react/canary" />
// ^ Loads the type of React's <ViewTransition>. Next.js 16 renders the App
// Router with its bundled React canary, which exports ViewTransition at run
// time; the installed @types/react only declares it in its "canary" types.

import { ViewTransition } from "react";

/**
 * Makes a move between public pages glide instead of blink.
 *
 * How it works: Next.js runs every route change inside a React transition.
 * React sees this <ViewTransition> leave with the old page and a new one
 * arrive with the new page, and asks the browser's View Transitions API to
 * animate between the two snapshots. The animation itself (a short fade and
 * rise) is CSS: see "Movement" in src/designs/cobalt/pages.css.
 *
 * Rules that keep it safe:
 * - Wrap each page's content in its page.tsx, not in the layout. Layouts stay
 *   mounted across navigations, so "enter" and "exit" would never fire there
 *   (Next.js docs: guides/view-transitions).
 * - `default="none"` means nothing animates for other updates on the page,
 *   such as a form changing state; only entering and leaving a page do.
 * - Browsers without the View Transitions API simply swap the page as before.
 * - Visitors who ask for reduced motion get the plain swap (pages.css).
 *
 * The nav and footer sit outside this wrapper, so they stay put while the
 * page content changes.
 */
export function CobaltPageTransition({ children }: { children: React.ReactNode }) {
  // One wrapping element, so the browser takes one snapshot of the whole
  // page body instead of one per top-level section.
  const page = <div className="co-page">{children}</div>;

  // Vitest loads the installed stable React (19.2), which has no
  // ViewTransition export. There the page renders without the wrapper, so
  // page tests see the same markup. In the app, Next.js always supplies it.
  if (!ViewTransition) return page;

  return (
    <ViewTransition enter="co-page-in" exit="co-page-out" default="none">
      {page}
    </ViewTransition>
  );
}
