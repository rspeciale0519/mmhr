import Link from "next/link";

import { BrandMark } from "../BrandMark";
import { siteFooterLinks, siteMenuLinks } from "./site-links";

/**
 * The public site footer (a Server Component: it has no state).
 *
 * Left: the brand and one plain sentence on how MMHR is paid. Right: the
 * four menu pages, then contact and the legal pages.
 *
 * `newsletter` is an optional slot shown as a full-width row under the links.
 * ./SiteChrome passes `<NewsletterSignup />` here only when the newsletter is
 * configured. Nothing is shown when it is left out, so the footer never offers
 * a signup the site cannot deliver.
 */
export function CobaltFooter({ newsletter }: { newsletter?: React.ReactNode }) {
  return (
    <footer className="co-foot">
      <div className="co-foot-main">
        <div className="co-foot-about">
          <BrandMark />
          <p>
            MMHR is a free HRIS software brokerage. Customers never pay MMHR. Providers pay a
            referral fee, and it is never an input to rank.
          </p>
        </div>
        <nav aria-label="Footer" className="co-foot-links">
          <ul>
            {siteMenuLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
          <ul>
            {siteFooterLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {newsletter ? <div className="co-foot-news">{newsletter}</div> : null}
    </footer>
  );
}
