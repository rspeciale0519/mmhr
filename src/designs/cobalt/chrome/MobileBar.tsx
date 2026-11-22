"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AppNavItem } from "./AppNav";

/**
 * Phone-only workspace bar. Hidden in tests and on desktop so duplicate
 * links never appear in the accessibility tree.
 */
export function MobileBar({ items, currentHref }: { items: readonly AppNavItem[]; currentHref?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setShow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (!show) return null;

  return (
    <nav className="co-gl co-mbar" aria-label="Mobile workspace">
      {items.slice(0, 4).map((item) => (
        <Link key={item.href} href={item.href} prefetch={false} aria-current={item.href === currentHref ? "page" : undefined}>
          <i aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
