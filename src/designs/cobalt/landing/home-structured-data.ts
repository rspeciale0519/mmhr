import type { JsonLdValue } from "../pages/JsonLd";

/** One plain sentence that describes MMHR, used in the structured data. */
export const HOME_DESCRIPTION =
  "A free HRIS software brokerage for buyers. Buyers answer one needs list, compare every matching option scored on fit, and MMHR sends one approved RFP to each provider they pick.";

/**
 * Organization and WebSite structured data (JSON-LD) for the home page.
 *
 * Search engines read this to learn the site's name and who runs it. It
 * holds only facts that are true today: the brand name, the site address,
 * and the description above. No logo, address, phone, or social profiles,
 * because none are approved yet.
 *
 * `origin` is the site's address (for example "https://example.com"), from
 * NEXT_PUBLIC_APP_URL through getSiteMetadataBase(). When it is not set,
 * the URL fields are left out instead of guessing one.
 */
export function homeStructuredData(name: string, origin?: string): JsonLdValue {
  // "@id" values let the two entries point at each other (the website is
  // published by the organization). They only make sense with a real URL.
  const organization: Record<string, JsonLdValue> = { "@type": "Organization" };
  const site: Record<string, JsonLdValue> = { "@type": "WebSite" };
  if (origin) {
    Object.assign(organization, { "@id": `${origin}/#organization`, url: `${origin}/` });
    Object.assign(site, { "@id": `${origin}/#website`, url: `${origin}/` });
  }
  Object.assign(organization, { name, description: HOME_DESCRIPTION });
  Object.assign(site, { name, description: HOME_DESCRIPTION });
  if (origin) site.publisher = { "@id": `${origin}/#organization` };

  return { "@context": "https://schema.org", "@graph": [organization, site] };
}
