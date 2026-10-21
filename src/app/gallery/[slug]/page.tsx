import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findDesign, galleryDesigns } from "@/gallery/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return galleryDesigns.map((design) => ({ slug: design.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const design = findDesign(slug);
  return {
    title: design ? `${design.name} | MMHR design gallery` : "MMHR design gallery",
    robots: { index: false, follow: false },
  };
}

/** One design's home page. The review bar comes from the gallery layout. */
export default async function GalleryDesignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const design = findDesign(slug);
  if (!design) notFound();
  const { default: Home } = await design.load();
  return <Home />;
}
