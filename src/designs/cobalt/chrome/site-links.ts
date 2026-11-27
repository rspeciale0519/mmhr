/**
 * The public site's page links, shared by the top menu (Nav.tsx) and the
 * footer (Footer.tsx).
 *
 * This is a plain module on purpose. Nav.tsx is a Client Component, and a
 * Server Component (such as the footer) that imports a value from a
 * "use client" file gets a client reference instead of the real array.
 * Keeping the list here lets both sides read the same data.
 *
 * Every href here must be a page that the launch surface serves
 * (src/lib/launch-surface.ts); a test checks that. `/blog` joins the menu in
 * a later change, once the blog exists and is unblocked.
 */
export type SiteLink = { readonly href: string; readonly label: string };

/** The four menu pages (owner decision, 2026-11-25), in menu order. */
export const siteMenuLinks: readonly SiteLink[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/why-its-free", label: "Why it's free" },
  { href: "/for-providers", label: "For providers" },
  { href: "/resources", label: "Resources" },
];

/** The two account actions shown at the right of the menu. */
export const siteAccountLinks = {
  signIn: { href: "/sign-in", label: "Sign in" },
  startFree: { href: "/sign-up", label: "Start free" },
} as const;

/** Footer-only links: contact and the legal pages. */
export const siteFooterLinks: readonly SiteLink[] = [
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/**
 * True when `href` is the page being viewed, or a parent of it. For example
 * `/resources` is current on `/resources` and would also be current on a
 * future `/resources/some-guide`. `/` is only current on the home page itself,
 * otherwise it would match every page.
 */
export function isCurrentPage(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
