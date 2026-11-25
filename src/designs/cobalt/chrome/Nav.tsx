"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "../BrandMark";
import { isCurrentPage, siteAccountLinks, siteMenuLinks } from "./site-links";

/** The id that ties the phone menu button to the panel it opens. */
const menuPanelId = "co-site-menu";

/**
 * The public site's top menu.
 *
 * Wide screens show the four page links as pills plus "Sign in" and
 * "Start free". Narrow screens (see `.co-menu-btn` in pages.css for the
 * exact width) hide the pills and "Sign in" and show a "Menu" button instead.
 * The button opens a panel with all four links and both actions.
 *
 * Sticking to the top and turning compact on scroll are pure CSS
 * (pages.css, "Top menu"), so this component holds only the phone menu state.
 *
 * This is a Client Component because it reads the current path (to mark the
 * active link) and keeps the phone menu's open/closed state.
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

  // Any link in the panel closes it. This matters when the visitor taps the
  // page they are already on: the route does not change, so the menu would
  // otherwise stay open.
  const close = () => setOpenOn(null);

  return (
    <header className="co-nav" ref={headerRef}>
      <BrandMark />

      <nav aria-label="Primary navigation" className="co-nav-main">
        <ul className="co-pills">
          {siteMenuLinks.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isCurrentPage(pathname, item.href) ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="co-nav-actions">
        <Link className="co-btn co-btn-g co-btn-s co-nav-signin" href={siteAccountLinks.signIn.href}>
          {siteAccountLinks.signIn.label}
        </Link>
        <Link className="co-btn co-btn-p co-btn-s" href={siteAccountLinks.startFree.href}>
          {siteAccountLinks.startFree.label}
        </Link>
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
