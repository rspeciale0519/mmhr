import { Doto, Geist } from "next/font/google";

/** Geist for every label and paragraph; Doto only inside the dot-matrix screen. */
export const body = Geist({ subsets: ["latin"], variable: "--console-body" });
export const display = Doto({ subsets: ["latin"], variable: "--console-lcd", weight: "variable", axes: ["ROND"] });
