import { Albert_Sans, Literata } from "next/font/google";

/** A bookish serif for headings on paper; a clean, open sans for everything you read quickly. */
export const display = Literata({ subsets: ["latin"], variable: "--fold-display", axes: ["opsz"] });
export const body = Albert_Sans({ subsets: ["latin"], variable: "--fold-body" });
