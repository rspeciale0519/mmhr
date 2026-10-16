import type { ReactNode } from "react";

import { ReviewDock } from "@/gallery/review/dock";
import { reviewDesigns } from "@/gallery/review/designs";

/** Every gallery page carries the review bar: switch designs, comment, pick, and build. */
export default function GalleryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ReviewDock designs={reviewDesigns} />
    </>
  );
}
