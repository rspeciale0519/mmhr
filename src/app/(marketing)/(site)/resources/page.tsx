import type { Metadata } from "next";
import Link from "next/link";

import { POSTS } from "../../_site/data";
import { CTA, PageHero, SectionHead } from "../../_site/PageParts";

export const metadata: Metadata = {
  title: "Resources — MatchMaker HR",
  description:
    "The HRIS Landscape Report, the Requirements Builder, the HR service partner finder, and writing on pricing and evaluation.",
};

const RESOURCES = [
  {
    href: "/resources/hris-landscape-report",
    k: "REPORT",
    h: "HRIS Landscape Report",
    p: "The whole market in one document: who serves which segment, where pricing sits, and which platforms are consolidating.",
  },
  {
    href: "/resources/requirements-builder",
    k: "TOOL",
    h: "Requirements Builder",
    p: "Tag around 200 HRIS capabilities as must-have, nice-to-have or irrelevant. Drives every match score you see, and exports for your RFP.",
  },
  {
    href: "/resources/partner-finder",
    k: "DIRECTORY",
    h: "HR service partner finder",
    p: "Implementation partners, benefits brokers and fractional HR support, filtered by system and region.",
  },
  {
    href: "/blog",
    k: "WRITING",
    h: "Blog",
    p: "Notes on pricing mechanics, evaluation tactics, and the incentives running underneath this market.",
  },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Everything useful that does not require an account."
        lede="The marketplace itself is gated because vendor pricing is commercially sensitive. Everything on this page is not."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-cards pu-cards-2">
            {RESOURCES.map((r) => (
              <Link className="pu-pcard" href={r.href} key={r.href}>
                <div className="pu-cell-k">{r.k}</div>
                <h3>{r.h}</h3>
                <p>{r.p}</p>
                <div className="pu-pcard-more">Open →</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Latest writing"
            title="From the blog"
          />
          <div className="pu-posts">
            {POSTS.map((p) => (
              <Link className="pu-post" href={`/blog/${p.slug}`} key={p.slug}>
                <div className="pu-post-meta">
                  {p.category} · {p.date}
                </div>
                <h3>{p.title}</h3>
                <p>{p.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTA
        title="The Weekly Signal"
        body="What moved in vendor pricing this week, in one email. No account required."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "Read the blog", href: "/blog" }}
      />
    </>
  );
}
