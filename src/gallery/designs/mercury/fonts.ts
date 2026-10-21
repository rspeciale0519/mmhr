import localFont from "next/font/local";

/** A wide, rounded display face for liquid forms; a clear grotesk for reading. */
const mercuryDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/unbounded/unbounded-normal-600-800-latin.woff2", weight: "200 900", style: "normal" },
  ],
  display: "swap",
  variable: "--mercury-display",
});
export const display = mercuryDisplay;
const mercuryBody = localFont({
  src: [
    { path: "../../../assets/fonts/onest/onest-normal-100-900-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--mercury-body",
});
export const body = mercuryBody;
