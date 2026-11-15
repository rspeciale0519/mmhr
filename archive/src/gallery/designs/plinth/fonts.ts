import localFont from "next/font/local";

/** A calm museum-label serif for names and headings; a plain public sans for reading. */
const plinthDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/hedvig-letters-serif/hedvig-letters-serif-normal-400-opsz-latin.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  variable: "--plinth-display",
});
export const display = plinthDisplay;
const plinthBody = localFont({
  src: [
    { path: "../../../assets/fonts/public-sans/public-sans-normal-400-700-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--plinth-body",
});
export const body = plinthBody;
