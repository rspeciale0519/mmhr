import localFont from "next/font/local";

/** Soft, open shapes that sit well on glass; the text cut keeps small labels clear. */
const vistaDisplay = localFont({
  src: [
    { path: "../../../assets/fonts/red-hat-display/red-hat-display-normal-300-900-latin.woff2", weight: "300 900", style: "normal" },
  ],
  display: "swap",
  variable: "--vista-display",
});
export const display = vistaDisplay;
const vistaBody = localFont({
  src: [
    { path: "../../../assets/fonts/red-hat-text/red-hat-text-normal-300-700-latin.woff2", weight: "300 700", style: "normal" },
  ],
  display: "swap",
  variable: "--vista-body",
});
export const body = vistaBody;
