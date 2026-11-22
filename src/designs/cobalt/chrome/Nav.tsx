"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "../BrandMark";

const landingLinks = [
  { href: "/", label: "Buyers" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#ranking-policy", label: "Ranking policy" },
  { href: "/contact", label: "Providers" },
] as const;

export function CobaltNav() {
  const pathname = usePathname();
  const current = pathname === "/contact" ? "/contact" : pathname === "/" ? "/" : undefined;
  return (
    <header className="co-nav">
      <BrandMark />
      <nav aria-label="Primary navigation">
        <ul className="co-pills">
          {landingLinks.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={item.href === current ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="co-nav-actions">
        <Link className="co-btn co-btn-g co-btn-s" href="/sign-in">Sign in</Link>
        <Link className="co-btn co-btn-p co-btn-s" href="/sign-up">Start free</Link>
      </div>
    </header>
  );
}
