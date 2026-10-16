import localFont from "next/font/local";

/** A display and text pair from one family, drawn for narrowing things down. */
const siftDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/funnel-display/funnel-display-normal-300-800-latin.woff2", weight: "300 800", style: "normal" },
  ],
  display: "swap",
  variable: "--sift-display",
});
export const display = siftDisplay;
const siftBody = localFont({
  src: [
    { path: "../../../assets/fonts/funnel-sans/funnel-sans-normal-300-800-latin.woff2", weight: "300 800", style: "normal" },
  ],
  display: "swap",
  variable: "--sift-body",
});
export const body = siftBody;
