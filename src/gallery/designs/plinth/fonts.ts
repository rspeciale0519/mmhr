import { Hedvig_Letters_Serif, Public_Sans } from "next/font/google";

/** A calm museum-label serif for names and headings; a plain public sans for reading. */
export const display = Hedvig_Letters_Serif({ subsets: ["latin"], variable: "--plinth-display", axes: ["opsz"] });
export const body = Public_Sans({ subsets: ["latin"], variable: "--plinth-body" });
