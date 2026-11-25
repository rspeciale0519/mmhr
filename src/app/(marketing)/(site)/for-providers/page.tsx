import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { ForProvidersBody } from "@/designs/cobalt/pages/for-providers/Body";
import { getMarketingPageMetadata } from "@/lib/site-metadata";

// Title, description, and canonical URL for search and link previews.
// The page content itself lives in src/designs/cobalt/pages/for-providers/Body.tsx.
export const metadata = getMarketingPageMetadata(
  "/for-providers",
  "For providers — MatchMaker HR",
  "How HRIS providers work with MatchMaker HR: buyers bring one needs list, every match is scored against it, and the referral fee providers pay is never an input to rank.",
);

export default function ForProvidersPage() {
  return (
    <CobaltPageTransition>
      <ForProvidersBody />
    </CobaltPageTransition>
  );
}
