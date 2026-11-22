import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CobaltPreviewScreens } from "@/designs/cobalt/preview/screens";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Development-only screens so the Cobalt UI can be photographed without a
 * signed-in workspace. The production build always 404s this route.
 */
export default function CobaltPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CobaltPreviewLoader searchParams={searchParams} />;
}

async function CobaltPreviewLoader({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const query = await searchParams;
  const view = typeof query.view === "string" ? query.view : "questionnaire";
  return <CobaltPreviewScreens view={view} />;
}
