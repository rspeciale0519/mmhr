import localFont from "next/font/local";

/** Geist for every label and paragraph; Doto only inside the dot-matrix screen. */
const consoleBody = localFont({
  src: [
    { path: "../../../assets/fonts/geist/geist-normal-100-900-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--console-body",
});
export const body = consoleBody;
const consoleDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/doto/doto-normal-100-900-rond-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--console-lcd",
});
export const display = consoleDisplay;
