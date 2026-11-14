import { galleryDesigns } from "../registry";
import type { ReviewDesign } from "./design-switcher";

/** Plain design summaries for the review tools, in registry order. */
export const reviewDesigns: ReviewDesign[] = galleryDesigns.map((design, index) => ({
  slug: design.slug,
  number: index + 1,
  round: design.round,
  name: design.name,
  idea: design.idea,
  palette: design.palette.map((color) => color.hex),
}));
