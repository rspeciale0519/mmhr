import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { CobaltBody } from "@/designs/cobalt/landing/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

// Title, description, and canonical URL for search and link previews.
// The page content itself lives in src/designs/cobalt/landing/Body.tsx.
export const metadata = getMarketingPageMetadata(
  "/",
  "MatchMaker HR — Compare HRIS software free, ranked on fit",
  "Free for buyers: answer one needs list, see every HRIS match scored on fit, pick up to five providers, and MMHR sends one approved RFP. Fees never change rank.",
);

export default function Home() {
  return (
    <CobaltPageTransition>
      <CobaltBody />
    </CobaltPageTransition>
  );
}
