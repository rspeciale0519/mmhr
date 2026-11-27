import { CobaltPageTransition } from "@/designs/cobalt/chrome/PageTransition";
import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { PageHero } from "../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/privacy",
  "Privacy policy — MatchMaker HR",
  "What personal data MatchMaker HR collects, why, who it is shared with, and how to exercise your rights over it.",
);

export default function PrivacyPage() {
  return (
    <CobaltPageTransition>
      <PageHero
        eyebrow="Legal"
        title="Privacy policy"
        lede="What we collect, why we collect it, and who it goes to. Written to be read rather than to be defensible."
      />

      <section>
        <div className="co-prose">
            <p className="co-lbl">
              <strong>Draft pending legal review.</strong> This document describes
              our intended practice and has not yet been reviewed by counsel. It
              is not the final published policy.
            </p>

            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Registration details</strong> — full name, company name,
                company email address and direct company phone number. All four are
                required to access vendor data.
              </li>
              <li>
                <strong>Evaluation data</strong> — the requirements you tag, the
                scores you and your team record, and the proposals you send us for
                benchmarking.
              </li>
              <li>
                <strong>Usage data</strong> — pages viewed and features used,
                collected only after you accept analytics cookies.
              </li>
            </ul>

            <h2>Why we require a work email and phone number</h2>
            <p>
              Vendor pricing is commercially sensitive and is shared with us on the
              basis that it reaches genuine buyers rather than competitors.
              Verifying that you are who you say you are is the condition on which
              we hold that data.
            </p>

            <h2>Who we share it with</h2>
            <p>
              We share your details with a vendor <strong>only</strong> when you
              ask us to introduce you, or when you request a quote that requires
              it. We tell you before it happens.
            </p>
            <p>
              We do not sell your contact details, and we do not pass them to
              vendors as leads.
            </p>
            <p>
              We use processors for hosting, product analytics, error monitoring
              and email delivery. They act on our instructions and may not use your
              data for their own purposes.
            </p>

            <h2>Cookies</h2>
            <p>
              Strictly necessary cookies keep you signed in. Analytics cookies are
              off until you accept them, and nothing is tracked before that point.
              You can change your choice at any time from the banner.
            </p>

            <h2>How long we keep it</h2>
            <p>
              Evaluation data is retained for the life of your account and for
              twelve months afterwards, so a stalled selection can be resumed.
              Delete your account and we remove it inside 30 days, except where we
              are required to retain records.
            </p>

            <h2>Your rights</h2>
            <ul>
              <li>Access a copy of the personal data we hold about you.</li>
              <li>Correct anything inaccurate.</li>
              <li>Delete your account and associated data.</li>
              <li>Object to processing, or withdraw analytics consent.</li>
            </ul>
            <p>
              To exercise any of these, <a href="/contact">contact us</a>. We
              respond within 30 days.
            </p>

            <h2>Changes</h2>
            <p>
              If we change this policy materially we will say so on this page and
              notify account holders by email before it takes effect.
            </p>
        </div>
      </section>
    </CobaltPageTransition>
  );
}
