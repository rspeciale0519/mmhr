import { Archivo } from "next/font/google";

/** One family; the width axis does the work of a second typeface. */
export const display = Archivo({ subsets: ["latin"], variable: "--shortlist-font", axes: ["wdth"] });
