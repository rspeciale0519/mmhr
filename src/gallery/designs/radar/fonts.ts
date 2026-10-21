import localFont from "next/font/local";

/** A geometric sans whose round, even shapes echo the charts. */
const radarDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/urbanist/urbanist-normal-100-900-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--radar-font",
});
export const display = radarDisplay;
