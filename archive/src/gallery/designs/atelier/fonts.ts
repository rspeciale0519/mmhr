import localFont from "next/font/local";

const atelierDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/gloock/gloock-normal-400-latin.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  variable: "--atelier-display",
});
export const display = atelierDisplay;
const atelierBody = localFont({
  src: [
    { path: "../../../assets/fonts/manrope/manrope-normal-400-700-latin.woff2", weight: "200 800", style: "normal" },
  ],
  display: "swap",
  variable: "--atelier-body",
});
export const body = atelierBody;
