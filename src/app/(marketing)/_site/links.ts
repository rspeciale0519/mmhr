/**
 * Every route on the public site, in one place.
 *
 * The nav and footer both read from here, so adding a page means adding it
 * once. The canonical route requirement is FR-MKT-01 in PRD section 5.1.
 *
 * At launch only `/`, `/contact`, `/privacy`, and `/terms` are public
 * (docs/LAUNCH.md). Link only to those pages or to the sign-in pages; the
 * launch surface hides the other marketing pages.
 */

export const PRIMARY_NAV = [
  { label: "Contact", href: "/contact" },
] as const;

export const FOOTER_COLUMNS = [
  {
    heading: "Resources",
    links: [
      { label: "Contact", href: "/contact" },
    ],
  },
] as const;

export const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;
