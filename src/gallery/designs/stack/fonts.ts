import localFont from "next/font/local";

/** A precise, friendly grotesk that reads like good product documentation. */
const stackDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/rethink-sans/rethink-sans-normal-400-800-latin.woff2", weight: "400 800", style: "normal" },
  ],
  display: "swap",
  variable: "--stack-font",
});
export const display = stackDisplay;
