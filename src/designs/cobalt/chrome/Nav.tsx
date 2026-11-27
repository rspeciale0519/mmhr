"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "../BrandMark";
import { onScrollFrame } from "../motion/frame";
import { motionAllowed } from "../motion/media";
import { Magnetic } from "../motion/pointer";
import { useScrollProgress } from "../motion/scroll";
import { isCurrentPage, siteAccountLinks, siteMenuLinks } from "./site-links";

/** The id that ties the phone menu button to the panel it opens. */
const menuPanelId = "co-site-menu";

/** Below this many px from the top the menu always shows. */
const ALWAYS_SHOWN_ABOVE = 120;
/** Px of steady downward scrolling before the menu slides away. */
const HIDE_AFTER = 28;
/** Px of upward scrolling before it comes back. */
const SHOW_AFTER = 6;

/**
 * Moves the white pill in the page links (.co-pills) to one link.
 *
 * The pill (`li.co-pills-ind`) covers the whole list and is cut down to the
 * link's shape with clip-path insets, so moving it is a paint-free CSS
 * transition. With no link (`null`) it fades out where it is.
 */
function placePill(list: HTMLUListElement, link: HTMLAnchorElement | null) {
  for (const item of list.querySelectorAll("a[data-co-hot]")) item.removeAttribute("data-co-hot");
  if (!link) {
    list.setAttribute("data-co-ind", "off");
    return;
  }
  const box = list.getBoundingClientRect();
  const spot = link.getBoundingClientRect();
  list.style.setProperty("--co-ind-t", `${spot.top - box.top}px`);
  list.style.setProperty("--co-ind-r", `${box.right - spot.right}px`);
  list.style.setProperty("--co-ind-b", `${box.bottom - spot.bottom}px`);
  list.style.setProperty("--co-ind-l", `${spot.left - box.left}px`);
  list.setAttribute("data-co-ind", "on");
  if (link.getAttribute("aria-current") !== "page") link.setAttribute("data-co-hot", "");
}

/**
 * The public site's top menu.
 *
 * Wide screens show the four page links as pills plus "Sign in" and
 * "Start free". Narrow screens (see `.co-menu-btn` in pages.css for the
 * exact width) hide the pills and "Sign in" and show a "Menu" button instead.
 * The button opens a panel with all four links and both actions.
 *
 * Motion (styles in pages.css, "Top menu"); every part has a still version:
 * - One white pill glides between the page links as you hover or Tab
 *   through them, and settles back on the current page.
 * - A thin line along the bar's bottom edge fills as you read down the page.
 * - Scrolling down slides the menu away; scrolling up brings it back. It
 *   never hides near the top, while the phone menu is open, or while focus
 *   is inside it, and never with reduced motion.
 * - "Start free" leans toward the mouse (Magnetic).
 * Without JavaScript the menu is the plain sticky bar with static pills.
 *
 * This is a Client Component because it reads the current path (to mark the
 * active link), keeps the phone menu's open/closed state and runs the motion.
 */
export function CobaltNav() {
  const pathname = usePathname();

  // The phone menu remembers the path it was opened on. When the route
  // changes, `openOn` no longer matches `pathname`, so the menu is closed on
  // the new page without any extra effect or timer.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;

  const headerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pillsRef = useRef<HTMLUListElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  // Read by the scroll loop, which outlives renders.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  useScrollProgress(progressRef, { page: true });

  // While the menu is open: Escape closes it and puts focus back on the
  // button (so keyboard users are not left on a hidden link), and a tap or
  // click anywhere outside the menu bar closes it too.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && headerRef.current?.contains(event.target)) return;
      setOpenOn(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // The gliding pill. It rests on the current page's link and follows the
  // hovered or focused link. Measured only on these events, never per frame.
  useEffect(() => {
    const list = pillsRef.current;
    if (!list) return;
    const current = () => list.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    const rest = () => placePill(list, current());
    rest();
    // Turn the glide on after the first placement, so the pill appears in
    // place instead of sliding in from the left edge.
    const frame = requestAnimationFrame(() => list.setAttribute("data-co-ind-ready", ""));

    const onOver = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a") : null;
      if (link && list.contains(link)) placePill(list, link);
    };
    const onLeave = () => {
      if (!list.contains(document.activeElement)) rest();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node && list.contains(event.relatedTarget))) rest();
    };
    list.addEventListener("pointerover", onOver);
    list.addEventListener("focusin", onOver);
    list.addEventListener("pointerleave", onLeave);
    list.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", rest);
    // Web fonts change the links' widths once they load.
    document.fonts?.ready.then(rest).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener("pointerover", onOver);
      list.removeEventListener("focusin", onOver);
      list.removeEventListener("pointerleave", onLeave);
      list.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", rest);
      list.removeAttribute("data-co-ind");
      list.removeAttribute("data-co-ind-ready");
    };
  }, [pathname]);

  // Scroll: mark the bar as scrolled (frosted background, progress line) and
  // hide it on the way down, show it on the way up.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    header.setAttribute("data-co-js", "");
    const canHide = motionAllowed();
    let y = 0;
    let lastY = window.scrollY;
    let down = 0;
    let up = 0;
    let hidden = false;

    const show = () => {
      hidden = false;
      header.removeAttribute("data-co-hide");
    };
    const stop = onScrollFrame({
      read: () => {
        y = window.scrollY;
      },
      write: () => {
        const delta = y - lastY;
        lastY = y;
        header.toggleAttribute("data-co-scrolled", y > 8);
        if (delta > 0) {
          down += delta;
          up = 0;
        } else if (delta < 0) {
          up -= delta;
          down = 0;
        }
        const mustShow = !canHide || y < ALWAYS_SHOWN_ABOVE || openRef.current || header.contains(document.activeElement);
        if (mustShow || up > SHOW_AFTER) {
          if (hidden) show();
        } else if (down > HIDE_AFTER && !hidden) {
          hidden = true;
          header.setAttribute("data-co-hide", "");
        }
      },
    });
    // Tabbing into the hidden menu brings it straight back.
    header.addEventListener("focusin", show);
    return () => {
      stop();
      header.removeEventListener("focusin", show);
      header.removeAttribute("data-co-js");
      header.removeAttribute("data-co-hide");
    };
  }, []);

  // Any link in the panel closes it. This matters when the visitor taps the
  // page they are already on: the route does not change, so the menu would
  // otherwise stay open.
  const close = () => setOpenOn(null);

  return (
    <header className="co-nav" ref={headerRef}>
      <BrandMark />

      <nav aria-label="Primary navigation" className="co-nav-main">
        <ul className="co-pills" ref={pillsRef}>
          {siteMenuLinks.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isCurrentPage(pathname, item.href) ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
          {/* The gliding pill (decoration, so hidden from screen readers). */}
          <li className="co-pills-ind" aria-hidden="true" />
        </ul>
      </nav>

      <div className="co-nav-actions">
        <Link className="co-btn co-btn-g co-btn-s co-nav-signin" href={siteAccountLinks.signIn.href}>
          {siteAccountLinks.signIn.label}
        </Link>
        <Magnetic>
          <Link className="co-btn co-btn-p co-btn-s" href={siteAccountLinks.startFree.href}>
            {siteAccountLinks.startFree.label}
          </Link>
        </Magnetic>
        {/* Phone only (hidden by CSS on wide screens). A real button, so it
            works with the keyboard and screen readers out of the box. */}
        <button
          ref={buttonRef}
          type="button"
          className="co-btn co-btn-g co-btn-s co-menu-btn"
          aria-expanded={open}
          aria-controls={menuPanelId}
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          {/* Three bars that turn into a cross while open (pages.css). */}
          <span className="co-menu-icon" aria-hidden="true"><i /><i /><i /></span>
          Menu
        </button>
      </div>

      {/* Reading progress along the bottom of the bar (pages.css). */}
      <span className="co-nav-progress" ref={progressRef} aria-hidden="true" />

      {/* The phone menu panel. `hidden` removes it from view and from the
          accessibility tree while closed. It sits right after the button in
          the page order, so Tab moves from the button straight into it. */}
      <div id={menuPanelId} className="co-gl co-menu" hidden={!open}>
        <nav aria-label="Site menu">
          <ul>
            {siteMenuLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={isCurrentPage(pathname, item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="co-menu-actions">
          <Link className="co-btn co-btn-g" href={siteAccountLinks.signIn.href} onClick={close}>
            {siteAccountLinks.signIn.label}
          </Link>
          <Link className="co-btn co-btn-p" href={siteAccountLinks.startFree.href} onClick={close}>
            {siteAccountLinks.startFree.label}
          </Link>
        </div>
      </div>
    </header>
  );
}
