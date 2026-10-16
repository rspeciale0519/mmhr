import localFont from "next/font/local";

const gridlineDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/schibsted-grotesk/schibsted-grotesk-normal-400-700-latin.woff2", weight: "400 900", style: "normal" },
  ],
  display: "swap",
  variable: "--gridline-font",
});
export const display = gridlineDisplay;
