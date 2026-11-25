import { isNewsletterConfigured } from "@/server/workflows/resend-newsletter-service";

import { CobaltGlows } from "../Glow";
import { CobaltFooter } from "./Footer";
import { CobaltNav } from "./Nav";
import { NewsletterSignup } from "./NewsletterSignup";

/**
 * Public-site chrome: canvas glows, nav, and footer (a Server Component).
 *
 * The footer shows the newsletter signup only when the newsletter can work:
 * `isNewsletterConfigured()` is true only when RESEND_API_KEY and
 * RESEND_NEWSLETTER_SEGMENT_ID are both set. Otherwise the footer renders
 * without it, so visitors never see a form that can only fail.
 *
 * The marketing pages are static, so this check runs when the site is built,
 * not on every visit. After changing those variables, deploy again.
 */
export function CobaltSiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="co-w">
      <CobaltGlows placement="hero" />
      <CobaltNav />
      <div id="content">{children}</div>
      <CobaltFooter newsletter={isNewsletterConfigured() ? <NewsletterSignup /> : undefined} />
    </div>
  );
}
