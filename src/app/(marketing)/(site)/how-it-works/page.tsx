import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { HowItWorksBody } from "@/designs/cobalt/pages/how-it-works/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

// Title, description, and canonical URL for search and link previews.
// The page content itself lives in src/designs/cobalt/pages/how-it-works/Body.tsx.
export const metadata = getMarketingPageMetadata(
  "/how-it-works",
  "How it works — MatchMaker HR",
  "Answer one needs list, see every HRIS match scored against it with vendor names masked, pick up to five contenders, and MMHR sends one approved RFP.",
);

export default function HowItWorksPage() {
  return (
    <CobaltPageTransition>
      <HowItWorksBody />
    </CobaltPageTransition>
  );
}
