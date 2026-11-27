import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { ForProvidersBody } from "@/designs/cobalt/pages/for-providers/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

// Title, description, and canonical URL for search and link previews.
// The page content itself lives in src/designs/cobalt/pages/for-providers/Body.tsx.
export const metadata = getMarketingPageMetadata(
  "/for-providers",
  "For HRIS providers — MatchMaker HR",
  "HRIS providers do not need to join MatchMaker HR. When a buyer shortlists your product, MMHR emails you one RFP with the buyer's real requirements. Rank depends on fit, never on fees.",
);

export default function ForProvidersPage() {
  return (
    <CobaltPageTransition>
      <ForProvidersBody />
    </CobaltPageTransition>
  );
}
