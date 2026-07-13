import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DESIGNS, getDesign } from "@/designs/registry";
import "../gallery.css";

export function generateStaticParams() {
  return DESIGNS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const design = getDesign(slug);
  return {
    title: design ? `${design.name} — design option` : "Design option",
    robots: { index: false, follow: false },
  };
}

export default async function DesignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const design = getDesign(slug);
  if (!design) notFound();

  const i = DESIGNS.findIndex((d) => d.slug === slug);
  const prev = DESIGNS[(i - 1 + DESIGNS.length) % DESIGNS.length];
  const next = DESIGNS[(i + 1) % DESIGNS.length];

  const { Component } = design;

  return (
    <>
      {/* Review chrome. Sits above the design so you can move through the whole
          set without going back to the directory each time. */}
      <div className="gv-bar">
        <Link className="gv-back" href="/designs">
          ← All layouts
        </Link>
        <span className="gv-name">{design.name}</span>
        <span className="gv-round">
          Round {design.round} · {design.scope} · placeholder content
        </span>
        <nav className="gv-nav">
          <Link className="gv-link" href={`/designs/${prev.slug}`}>
            ← {prev.name}
          </Link>
          <Link className="gv-link" href={`/designs/${next.slug}`}>
            {next.name} →
          </Link>
        </nav>
      </div>

      <Component />
    </>
  );
}
