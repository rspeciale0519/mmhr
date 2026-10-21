import localFont from "next/font/local";

/** A clean optical-size sans: tight and confident at display sizes, open at text sizes. */
const launchDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/dm-sans/dm-sans-normal-100-1000-opsz-latin.woff2", weight: "100 1000", style: "normal" },
  ],
  display: "swap",
  variable: "--launch-font",
});
export const display = launchDisplay;
