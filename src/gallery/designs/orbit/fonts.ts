import localFont from "next/font/local";

const orbitDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/bricolage-grotesque/bricolage-grotesque-normal-200-800-opsz-wdth-latin.woff2", weight: "200 800", style: "normal" },
  ],
  display: "swap",
  variable: "--orbit-display",
});
export const display = orbitDisplay;
const orbitBody = localFont({
  src: [
    { path: "../../../assets/fonts/instrument-sans/instrument-sans-normal-400-700-wdth-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--orbit-body",
});
export const body = orbitBody;
