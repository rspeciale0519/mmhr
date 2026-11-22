import { CobaltGlows } from "../Glow";
import { CobaltFooter } from "./Footer";
import { CobaltNav } from "./Nav";

/**
 * Public-site chrome: canvas glows, nav, and footer.
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
