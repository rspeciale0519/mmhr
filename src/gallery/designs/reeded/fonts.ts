import localFont from "next/font/local";

/** Hairline Didone strokes refract beautifully behind fluted glass; a plain grotesk carries the reading. */
const reededDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/bodoni-moda/bodoni-moda-normal-400-900-opsz-latin.woff2", weight: "400 900", style: "normal" },
  ],
  display: "swap",
  variable: "--reeded-display",
});
export const display = reededDisplay;
const reededBody = localFont({
  src: [
    { path: "../../../assets/fonts/hanken-grotesk/hanken-grotesk-normal-400-700-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--reeded-body",
});
export const body = reededBody;
