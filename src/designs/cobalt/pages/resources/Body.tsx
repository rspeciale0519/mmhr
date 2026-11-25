import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";

/**
 * Body of /resources. The route file
 * (src/app/(marketing)/(site)/resources/page.tsx) only sets the metadata and
 * renders this, so all page content lives here.
 *
 * Pages below /resources (for example /resources/some-guide) stay blocked by
 * src/lib/launch-surface.ts until the owner approves each one. Do not link to
 * one from here before that, or the link leads to a not-found page.
 *
 * Shared blocks for this page are in src/designs/cobalt/pages/:
 * PageHero (the one h1), PageSection, QuestionsAndAnswers, CtaBand, JsonLd.
 * A newsletter signup is in src/designs/cobalt/chrome/NewsletterSignup.tsx.
 */
export function ResourcesBody() {
  return (
    <>
      <PageHero
        title="Resources"
        lede="Guides for teams choosing HRIS software will be published here."
      />
      <CtaBand
        title="Start with your needs list."
        body="Free for buyers. Customers never pay MMHR."
      />
    </>
  );
}
