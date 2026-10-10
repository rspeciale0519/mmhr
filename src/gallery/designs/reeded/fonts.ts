import { Bodoni_Moda, Hanken_Grotesk } from "next/font/google";

/** Hairline Didone strokes refract beautifully behind fluted glass; a plain grotesk carries the reading. */
export const display = Bodoni_Moda({ subsets: ["latin"], variable: "--reeded-display", axes: ["opsz"] });
export const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--reeded-body" });
