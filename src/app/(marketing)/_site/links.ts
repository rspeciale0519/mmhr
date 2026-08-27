/**
 * Every route on the public site, in one place.
 *
 * The nav and footer both read from here, so adding a page means adding it
 * once. The canonical route requirement is FR-MKT-01 in PRD section 5.1.
 */

export const PRIMARY_NAV = [
  { label: "Platform", href: "/platform" },
  { label: "Broker model", href: "/broker-model" },
  { label: "Case studies", href: "/case-studies" },
  { label: "Resources", href: "/resources" },
] as const;

export const FOOTER_COLUMNS = [
  {
    heading: "For buyers",
    links: [
      { label: "HRIS Marketplace", href: "/platform" },
      { label: "Requirements Builder", href: "/resources/requirements-builder" },
      { label: "Advisory services", href: "/services" },
      { label: "Case studies", href: "/case-studies" },
    ],
  },
  {
    heading: "Why us",
    links: [
      { label: "Broker model", href: "/broker-model" },
      { label: "How we make money", href: "/transparency" },
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "HRIS Landscape Report", href: "/resources/hris-landscape-report" },
      { label: "Partner finder", href: "/resources/partner-finder" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Partners",
    links: [
      { label: "Software vendors", href: "/partners/software-vendors" },
      { label: "Brokers & consultants", href: "/partners/brokers-consultants" },
      { label: "PE & VC firms", href: "/partners/pe-vc" },
    ],
  },
] as const;

export const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Commission disclosure", href: "/transparency" },
] as const;
