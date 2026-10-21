import localFont from "next/font/local";

/** One family; the width axis stretches with scroll speed and sets the hierarchy. */
const velocityDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/mona-sans/mona-sans-normal-200-900-wdth-latin.woff2", weight: "200 900", style: "normal" },
  ],
  display: "swap",
  variable: "--velocity-font",
});
export const display = velocityDisplay;
