import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { ResourcesBody } from "@/designs/cobalt/pages/resources/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

// Title, description, and canonical URL for search and link previews.
// The page content itself lives in src/designs/cobalt/pages/resources/Body.tsx.
// The older Pulse pages below /resources stay blocked (src/lib/launch-surface.ts).
export const metadata = getMarketingPageMetadata(
  "/resources",
  "Resources — MatchMaker HR",
  "Guides from MatchMaker HR for teams choosing HRIS software.",
);

export default function ResourcesPage() {
  return (
    <CobaltPageTransition>
      <ResourcesBody />
    </CobaltPageTransition>
  );
}
