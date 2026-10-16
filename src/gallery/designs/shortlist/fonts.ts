import localFont from "next/font/local";

/** One family; the width axis does the work of a second typeface. */
const shortlistDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/archivo/archivo-normal-100-900-wdth-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--shortlist-font",
});
export const display = shortlistDisplay;
