import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";

/** Plex for the page, as in good technical documentation; a true code face only inside code. */
export const display = IBM_Plex_Sans({ subsets: ["latin"], variable: "--query-font", axes: ["wdth"] });
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--query-mono" });
