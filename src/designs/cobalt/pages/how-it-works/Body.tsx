import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";

/**
 * Body of /how-it-works. The route file
 * (src/app/(marketing)/(site)/how-it-works/page.tsx) only sets the metadata
 * and renders this, so all page content lives here.
 *
 * Shared blocks for this page are in src/designs/cobalt/pages/:
 * PageHero (the one h1), PageSection, QuestionsAndAnswers, CtaBand, JsonLd.
 */
export function HowItWorksBody() {
  return (
    <>
      <PageHero
        title="How MatchMaker HR works"
        lede="Answer one needs list and every match is scored against it. Vendor names stay masked until you review your requirements with an advisor. You pick up to five contenders, MMHR sends one approved RFP, and you sign directly with the provider you choose."
      />
      <CtaBand
        title="Start with your needs list."
        body="Free for buyers. Customers never pay MMHR."
      />
    </>
  );
}
