/**
 * Cookie-consent state for FR-MKT-09 and FR-ANL-01.
 *
 * Consent is opt-in: absence of the cookie means "no consent", never "assume
 * yes". Nothing may load a tracker before hasAnalyticsConsent() returns true.
 */
export const ANALYTICS_CONSENT_COOKIE = "mmhr_analytics_consent";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  for (const part of document.cookie.split("; ")) {
    const [key, ...rest] = part.split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function buildConsentCookie(
  name: string,
  value: string,
  protocol = typeof window === "undefined" ? "http:" : window.location.protocol,
) {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Max-Age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax${secure}`;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = buildConsentCookie(name, value);
}

export function hasAnalyticsConsent(): boolean {
  return readCookie(ANALYTICS_CONSENT_COOKIE) === "granted";
}

export function isConsentDecisionMade(): boolean {
  return readCookie(ANALYTICS_CONSENT_COOKIE) !== null;
}

export function grantAnalyticsConsent() {
  writeCookie(ANALYTICS_CONSENT_COOKIE, "granted");
}

export function denyAnalyticsConsent() {
  writeCookie(ANALYTICS_CONSENT_COOKIE, "denied");
}
