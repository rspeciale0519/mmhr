import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";

/**
 * Body of /for-providers. The route file
 * (src/app/(marketing)/(site)/for-providers/page.tsx) only sets the metadata
 * and renders this, so all page content lives here.
 *
 * Shared blocks for this page are in src/designs/cobalt/pages/:
 * PageHero (the one h1), PageSection, QuestionsAndAnswers, CtaBand, JsonLd.
 */
export function ForProvidersBody() {
  return (
    <>
      <PageHero
        title="For HRIS providers"
        lede="Buyers come to MatchMaker HR with one needs list, and every match is scored against it. Providers pay MMHR a referral fee. It is never an input to rank."
      />
      <CtaBand
        title="Talk to the MMHR team."
        body="Ask how providers work with MatchMaker HR."
        action={{ href: "/contact", label: "Contact MMHR" }}
      />
    </>
  );
}
