import { CobaltGlows } from "../Glow";
import { CobaltFooter } from "./Footer";
import { CobaltNav } from "./Nav";

/**
 * Public-site chrome: canvas glows, nav, and footer.
 *
 * The footer's `newsletter` slot is left empty on purpose until the owner
 * decides where the signup appears and the newsletter provider is configured
 * (without BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID every signup fails).
 * To show it: `<CobaltFooter newsletter={<NewsletterSignup />} />`.
 */
export function CobaltSiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="co-w">
      <CobaltGlows placement="hero" />
      <CobaltNav />
      <div id="content">{children}</div>
      <CobaltFooter />
    </div>
  );
}
