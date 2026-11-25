import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { WhyItsFreeBody } from "@/designs/cobalt/pages/why-its-free/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

// Title, description, and canonical URL for search and link previews.
// The page content itself lives in src/designs/cobalt/pages/why-its-free/Body.tsx.
export const metadata = getMarketingPageMetadata(
  "/why-its-free",
  "Why it's free — MatchMaker HR",
  "Customers never pay MatchMaker HR. Providers pay MMHR a referral fee, and that fee is never an input to rank.",
);

export default function WhyItsFreePage() {
  return (
    <CobaltPageTransition>
      <WhyItsFreeBody />
    </CobaltPageTransition>
  );
}
