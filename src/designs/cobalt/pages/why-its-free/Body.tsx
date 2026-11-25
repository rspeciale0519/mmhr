import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";

/**
 * Body of /why-its-free. The route file
 * (src/app/(marketing)/(site)/why-its-free/page.tsx) only sets the metadata
 * and renders this, so all page content lives here.
 *
 * Shared blocks for this page are in src/designs/cobalt/pages/:
 * PageHero (the one h1), PageSection, QuestionsAndAnswers, CtaBand, JsonLd.
 */
export function WhyItsFreeBody() {
  return (
    <>
      <PageHero
        title="Why it's free"
        lede="Customers never pay MMHR. Providers pay MMHR a referral fee, and that fee is never an input to rank."
      />
      <CtaBand
        title="Start with your needs list."
        body="Free for buyers. You sign directly with the provider you choose."
      />
    </>
  );
}
