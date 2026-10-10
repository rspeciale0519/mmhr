import { Funnel_Display, Funnel_Sans } from "next/font/google";

/** A display and text pair from one family, drawn for narrowing things down. */
export const display = Funnel_Display({ subsets: ["latin"], variable: "--sift-display" });
export const body = Funnel_Sans({ subsets: ["latin"], variable: "--sift-body" });
