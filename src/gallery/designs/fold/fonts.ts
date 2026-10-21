import localFont from "next/font/local";

/** A bookish serif for headings on paper; a clean, open sans for everything you read quickly. */
const foldDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/literata/literata-normal-200-900-opsz-latin.woff2", weight: "200 900", style: "normal" },
  ],
  display: "swap",
  variable: "--fold-display",
});
export const display = foldDisplay;
const foldBody = localFont({
  src: [
    { path: "../../../assets/fonts/albert-sans/albert-sans-normal-400-800-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--fold-body",
});
export const body = foldBody;
