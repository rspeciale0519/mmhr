import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { CobaltBody } from "@/designs/cobalt/landing/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

export const metadata = getMarketingPageMetadata(
  "/",
  "MatchMaker HR",
  "Buyer-side HRIS brokerage.",
);

export default function Home() {
  return (
    <CobaltPageTransition>
      <CobaltBody />
    </CobaltPageTransition>
  );
}
