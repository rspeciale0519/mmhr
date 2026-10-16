import localFont from "next/font/local";

/** Plex for the page, as in good technical documentation; a true code face only inside code. */
const queryDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/ibm-plex-sans/ibm-plex-sans-normal-100-700-wdth-latin.woff2", weight: "100 700", style: "normal" },
  ],
  display: "swap",
  variable: "--query-font",
});
export const display = queryDisplay;
const queryMono = localFont({
  src: [
    { path: "../../../assets/fonts/jetbrains-mono/jetbrains-mono-normal-100-800-latin.woff2", weight: "100 800", style: "normal" },
  ],
  display: "swap",
  variable: "--query-mono",
});
export const mono = queryMono;
