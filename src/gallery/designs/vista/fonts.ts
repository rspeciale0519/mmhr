import { Red_Hat_Display, Red_Hat_Text } from "next/font/google";

/** Soft, open shapes that sit well on glass; the text cut keeps small labels clear. */
export const display = Red_Hat_Display({ subsets: ["latin"], variable: "--vista-display" });
export const body = Red_Hat_Text({ subsets: ["latin"], variable: "--vista-body" });
