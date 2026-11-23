import Link from "next/link";

import { BrandMark } from "../BrandMark";

export type AppNavItem = { href: string; label: string };

export function AppNav({
  items,
  currentHref,
  label,
}: {
  items: readonly AppNavItem[];
  currentHref?: string;
  label: string;
}) {
  return (
    <header className="co-appnav">
      <BrandMark href="/home" />
      <nav aria-label={label}>
        <ul className="co-pills">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} prefetch={false} aria-current={item.href === currentHref ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="co-nav-actions">
        <span className="co-chip co-chip-n co-hide-m">Signed in</span>
      </div>
    </header>
  );
}
