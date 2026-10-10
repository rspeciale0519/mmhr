import { Inter_Tight, Newsreader } from "next/font/google";

export const display = Newsreader({ subsets: ["latin"], variable: "--margin-serif", axes: ["opsz"], style: ["normal", "italic"] });
export const body = Inter_Tight({ subsets: ["latin"], variable: "--margin-sans" });
