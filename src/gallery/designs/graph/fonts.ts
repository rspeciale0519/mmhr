import { Wix_Madefor_Display, Wix_Madefor_Text } from "next/font/google";

/** A product-UI family: a confident display cut and a text cut built for interfaces. */
export const display = Wix_Madefor_Display({ subsets: ["latin"], variable: "--graph-display" });
export const body = Wix_Madefor_Text({ subsets: ["latin"], variable: "--graph-body" });
