import localFont from "next/font/local";

/** One crisp grotesk; weight and size carry the hierarchy so the light can do the rest. */
const lumenDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/host-grotesk/host-grotesk-normal-300-800-latin.woff2", weight: "300 800", style: "normal" },
  ],
  display: "swap",
  variable: "--lumen-font",
});
export const display = lumenDisplay;
