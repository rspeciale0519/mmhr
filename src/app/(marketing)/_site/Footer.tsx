import Link from "next/link";

import { FOOTER_COLUMNS, LEGAL_LINKS } from "./links";

/** Site footer. Shared by every page and by the gallery's standalone Pulse. */
export function Footer() {
  return (
    <footer className="pu-foot">
      <div className="pu-wrap">
        <div className="pu-fgrid">
          <div>
            <div className="pu-logo">
              <span className="pu-mark" aria-hidden="true" />
              MatchMaker HR
            </div>
            <p>
              Buyer-side HRIS brokerage. Free to buyers. Providers pay us under
              commission or referral arrangements, and we say so when we&rsquo;re one
              of them.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div className="pu-fcol" key={col.heading}>
              <h2>{col.heading}</h2>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pu-fbot">
          <span>© 2026 MatchMaker HR</span>
          <span className="pu-fbot-links">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
