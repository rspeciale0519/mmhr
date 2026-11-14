import localFont from "next/font/local";

/** A clean, slightly wide grotesk that stays crisp on white cards at every size. */
const haloDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/epilogue/epilogue-normal-400-700-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--halo-font",
});
export const display = haloDisplay;
