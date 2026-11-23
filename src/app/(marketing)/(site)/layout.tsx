import Link from "next/link";

import { CobaltSiteChrome } from "@/designs/cobalt/chrome/SiteChrome";
import "@/designs/pulse/styles.css";
import "../_site/site.css";

/**
 * Chrome for the public site. Cobalt is the live direction; Pulse CSS stays
 * imported so blocked marketing pages that still use those classes do not break.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Link className="co-skip" href="#content">
        Skip to content
      </Link>
      <CobaltSiteChrome>{children}</CobaltSiteChrome>
    </>
  );
}
