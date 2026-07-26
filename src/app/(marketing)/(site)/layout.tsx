import Link from "next/link";

import { SiteChrome } from "../_site/SiteChrome";
// Pulse's stylesheet is the design system — tokens, canvas, nav, footer and
// section primitives all live there. site.css only adds what inner pages need.
import "@/designs/pulse/styles.css";
import "../_site/site.css";

/**
 * Chrome for the public site. Deliberately a route group so /designs stays
 * outside it — the gallery has its own review chrome and must not inherit the
 * marketing nav.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Link className="pu-skip" href="#content">
        Skip to content
      </Link>
      <SiteChrome>{children}</SiteChrome>
    </>
  );
}
