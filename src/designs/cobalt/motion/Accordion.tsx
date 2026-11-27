"use client";

import { createElement, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { motionAllowed } from "./media";

/** False on the server and during hydration, true once the page is live. */
const noSubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/**
 * The value for a collapsed panel's `hidden` attribute. "until-found" keeps
 * the text searchable: find-in-page can match it, and the browser then fires
 * `beforematch` so the row opens itself. Browsers without it use plain
 * `hidden`.
 */
function hiddenValue() {
  return "onbeforematch" in document.body ? "until-found" : "";
}

type AccordionItemProps = {
  /** The row's label (the question). Becomes the button inside the heading. */
  title: ReactNode;
  /** The panel content (the answer). It is always in the HTML. */
  children: ReactNode;
  /** Open when the page loads. Default false. */
  defaultOpen?: boolean;
  /** Heading level that holds the button. Default 3. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

/**
 * One expandable row: a heading with a button (`aria-expanded`), and a panel
 * that opens with an animated height and a plus that turns into a minus.
 *
 * What stays true for readers, search and assistive tech:
 * - The server HTML has every panel open. Without JavaScript nothing is ever
 *   collapsed. After the page loads, rows that are not `defaultOpen` close.
 * - Closed panels stay in the HTML with `hidden="until-found"`, so search
 *   engines read them and find-in-page still finds (and opens) them.
 * - The button is a real <button> inside the heading (WAI-ARIA accordion
 *   pattern): Tab reaches it, Enter or Space toggles it.
 * - Reduced motion: opens and closes at once, no height animation.
 */
export function AccordionItem({ title, children, defaultOpen = false, headingLevel = 3, className }: AccordionItemProps) {
  const id = useId();
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;
  const hydrated = useHydrated();
  // null until the visitor toggles: the row then follows `defaultOpen`.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = hydrated ? (toggled ?? defaultOpen) : true;
  const panelRef = useRef<HTMLDivElement>(null);
  // The panel's first close happens right after hydration: do it at once.
  const settled = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const instant = !settled.current || !motionAllowed();
    settled.current = true;
    if (open) {
      panel.removeAttribute("hidden");
      return;
    }
    const hide = () => panel.setAttribute("hidden", hiddenValue());
    if (instant) {
      hide();
      return;
    }
    // Let the height animation finish, then hide. The timer is a backstop in
    // case `transitionend` never fires (for example the row is off screen).
    const timer = window.setTimeout(hide, 450);
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== panel) return;
      window.clearTimeout(timer);
      hide();
    };
    panel.addEventListener("transitionend", onEnd);
    return () => {
      window.clearTimeout(timer);
      panel.removeEventListener("transitionend", onEnd);
    };
  }, [open]);

  // Find-in-page matched text inside the closed panel: open the row.
  useEffect(() => {
    const panel = panelRef.current;
    const onMatch = () => setToggled(true);
    panel?.addEventListener("beforematch", onMatch);
    return () => panel?.removeEventListener("beforematch", onMatch);
  }, []);

  const heading = createElement(
    `h${headingLevel}`,
    { className: "co-acc-h" },
    <button
      type="button"
      id={buttonId}
      className="co-acc-btn"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setToggled(!open)}
    >
      <span className="co-acc-label">{title}</span>
      <span className="co-acc-icon" aria-hidden="true" />
    </button>,
  );

  return (
    <div className={className ? `co-acc ${className}` : "co-acc"} data-open={open}>
      {heading}
      <div ref={panelRef} id={panelId} className="co-acc-panel">
        {/* body clips during the height animation; inner holds the spacing,
            so a closed row really is 0px tall. */}
        <div className="co-acc-body">
          <div className="co-acc-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
