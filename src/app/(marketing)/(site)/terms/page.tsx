import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { PageHero } from "../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/terms",
  "Terms of service — MatchMaker HR",
  "The terms covering use of the MatchMaker HR platform, the vendor data within it, and the advisory services we provide.",
);

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Terms of service"
        lede="What you can expect from us, what we ask of you, and the limits on both."
      />

      <section>
        <div className="co-prose">
            <p className="co-lbl">
              <strong>Draft pending legal review.</strong> This document describes
              our intended terms and has not yet been reviewed by counsel. It is
              not the final published agreement.
            </p>

            <h2>What the service is</h2>
            <p>
              MatchMaker HR is a buyer-side brokerage for HR information systems.
              We provide a marketplace of vendor data, tools for running an
              evaluation, and access to advisors. Use of all of it is free to
              buyers.
            </p>

            <h2>How we are paid</h2>
            <p>
              The provider you select pays us under a commission or referral
              arrangement. Customers do not pay MMHR a fee or subscription. We
              also resell one system, CBIZ Centrally HR, which is labelled wherever
              it appears.
            </p>

            <h2>Your account</h2>
            <ul>
              <li>
                Registration details must be accurate. Accounts created with false
                company information may be closed.
              </li>
              <li>
                You are responsible for activity under your account and for the
                teammates you invite.
              </li>
              <li>
                Accounts are for evaluating systems for your own organisation.
              </li>
            </ul>

            <h2>Vendor data</h2>
            <p>
              Pricing and capability data is provided for your internal evaluation.
              You may share it within your organisation and with advisors acting
              for you. You may not republish it, resell it, or use it to build a
              competing dataset.
            </p>
            <p>
              We verify pricing on a schedule and show the date of last
              verification. We do not warrant that any figure matches what a
              vendor will quote you on a given day — a benchmark is evidence for a
              negotiation, not a binding price.
            </p>

            <h2>Advice</h2>
            <p>
              Our advisors give commercial guidance on software selection. They do
              not provide legal, tax, accounting or employment-law advice, and
              nothing in a proposal review constitutes legal review of a contract.
              Have your counsel review anything you sign.
            </p>
            <p>
              Decisions remain yours. We do not sign contracts on your behalf or
              negotiate as your agent.
            </p>

            <h2>Availability</h2>
            <p>
              We aim to keep the platform available continuously but do not
              guarantee uninterrupted service, and we may change or withdraw
              features.
            </p>

            <h2>Liability</h2>
            <p>
              Because the service is provided to you free of charge, our liability
              to you is limited to the maximum extent permitted by law. Nothing
              here limits liability for fraud, death or personal injury caused by
              negligence, or anything else that cannot lawfully be limited.
            </p>

            <h2>Ending it</h2>
            <p>
              You may close your account at any time. We may suspend accounts that
              breach these terms, and will tell you why.
            </p>

            <h2>Questions</h2>
            <p>
              <a href="/contact">Contact us</a> and a person will answer.
            </p>
        </div>
      </section>
    </>
  );
}
