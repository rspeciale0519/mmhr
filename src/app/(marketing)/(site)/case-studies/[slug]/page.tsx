import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CASE_STUDIES, getCaseStudy } from "../../../_site/data";
import { CTA } from "../../../_site/PageParts";

export function generateStaticParams() {
  return CASE_STUDIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study) {
    return getMarketingPageMetadata(
      "/case-studies",
      "Case studies — MatchMaker HR",
      "How buying committees used verified pricing and shared scorecards to shorten evaluations and renegotiate contracts.",
    );
  }
  return getMarketingPageMetadata(
    `/case-studies/${slug}`,
    `${study.title} — MatchMaker HR`,
    study.summary,
  );
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study) notFound();

  return (
    <>
      <section className="pu-phero">
        <div className="pu-wrap pu-phero-in">
          <div className="pu-eye">Case study · {study.industry}</div>
          <h1 className="pu-h1-p">{study.title}</h1>
          <p className="pu-lede-p">{study.summary}</p>
        </div>
      </section>

      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-g3" style={{ marginBottom: 44 }}>
            <div className="pu-cell">
              <div className="pu-cell-k">HEADLINE RESULT</div>
              <h3>
                {study.stat} {study.statLabel}
              </h3>
            </div>
            <div className="pu-cell">
              <div className="pu-cell-k">COMPANY SIZE</div>
              <h3>{study.size}</h3>
            </div>
            <div className="pu-cell">
              <div className="pu-cell-k">OUTCOME</div>
              <h3>{study.outcome}</h3>
            </div>
          </div>

          <div className="pu-prose">
            <h2>The challenge</h2>
            <p>{study.challenge}</p>

            <h2>What we did</h2>
            <ul>
              {study.approach.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>

            <h2>The result</h2>
            <p>{study.result}</p>
          </div>

          <p className="pu-fine" style={{ marginTop: 30 }}>
            This case study is an illustrative placeholder while the site is in
            build. The company and figures are not real.
          </p>

          <p style={{ marginTop: 26 }}>
            <Link className="pu-pcard-more" href="/case-studies">
              ← All case studies
            </Link>
          </p>
        </div>
      </section>

      <CTA
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "Talk to an advisor", href: "/contact" }}
      />
    </>
  );
}
