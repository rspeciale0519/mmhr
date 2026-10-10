import { DM_Sans } from "next/font/google";

/** A clean optical-size sans: tight and confident at display sizes, open at text sizes. */
export const display = DM_Sans({ subsets: ["latin"], variable: "--launch-font", axes: ["opsz"] });
