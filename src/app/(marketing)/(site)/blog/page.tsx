import type { Metadata } from "next";
import Link from "next/link";

import { POSTS } from "../../_site/data";
import { CTA, PageHero } from "../../_site/PageParts";

export const metadata: Metadata = {
  title: "Blog — MatchMaker HR",
  description:
    "Notes on HRIS pricing mechanics, evaluation tactics, and the incentives running underneath the market.",
};

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="How this market actually works."
        lede="Mostly about pricing mechanics and evaluation tactics — the things vendors know and buyers usually find out afterwards."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
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
        body="What moved in vendor pricing this week, in one email."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "All resources", href: "/resources" }}
      />
    </>
  );
}
