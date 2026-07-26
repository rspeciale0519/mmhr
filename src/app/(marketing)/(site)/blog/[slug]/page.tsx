import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { POSTS, getPost } from "../../../_site/data";
import { CTA } from "../../../_site/PageParts";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Blog — MatchMaker HR" };
  return { title: `${post.title} — MatchMaker HR`, description: post.excerpt };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <>
      <section className="pu-phero">
        <div className="pu-wrap pu-phero-in">
          <div className="pu-eye">
            {post.category} · {post.date}
          </div>
          <h1 className="pu-h1-p">{post.title}</h1>
          <p className="pu-lede-p">{post.excerpt}</p>
        </div>
      </section>

      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-prose">
            {post.body.map((para) => (
              <p key={para.slice(0, 40)}>{para}</p>
            ))}
          </div>

          <p style={{ marginTop: 30 }}>
            <Link className="pu-pcard-more" href="/blog">
              ← All posts
            </Link>
          </p>
        </div>
      </section>

      <CTA
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "Read the FAQ", href: "/faq" }}
      />
    </>
  );
}
