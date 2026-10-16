import localFont from "next/font/local";

const marginDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/newsreader/newsreader-italic-200-800-opsz-latin.woff2", weight: "200 800", style: "italic" },
    { path: "../../../assets/fonts/newsreader/newsreader-normal-200-800-opsz-latin.woff2", weight: "200 800", style: "normal" },
  ],
  display: "swap",
  variable: "--margin-serif",
});
export const display = marginDisplay;
const marginBody = localFont({
  src: [
    { path: "../../../assets/fonts/inter-tight/inter-tight-normal-100-900-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--margin-sans",
});
export const body = marginBody;
