import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { WhyItsFreeBody } from "@/designs/cobalt/pages/why-its-free/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

// Title, description, and canonical URL for search and link previews.
// The page content itself lives in src/designs/cobalt/pages/why-its-free/Body.tsx.
export const metadata = getMarketingPageMetadata(
  "/why-its-free",
  "Why it's free — MatchMaker HR",
  "MatchMaker HR is free for buyers. When you sign with a provider, that provider pays MMHR a referral fee, and the fee is never an input to your ranking.",
);

export default function WhyItsFreePage() {
  return (
    <CobaltPageTransition>
      <WhyItsFreeBody />
    </CobaltPageTransition>
  );
}
