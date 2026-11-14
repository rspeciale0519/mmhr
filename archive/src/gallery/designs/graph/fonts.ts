import localFont from "next/font/local";

/** A product-UI family: a confident display cut and a text cut built for interfaces. */
const graphDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/wix-madefor-display/wix-madefor-display-normal-400-800-latin.woff2", weight: "400 800", style: "normal" },
  ],
  display: "swap",
  variable: "--graph-display",
});
export const display = graphDisplay;
const graphBody = localFont({
  src: [
    { path: "../../../assets/fonts/wix-madefor-text/wix-madefor-text-normal-400-800-latin.woff2", weight: "400 800", style: "normal" },
  ],
  display: "swap",
  variable: "--graph-body",
});
export const body = graphBody;
