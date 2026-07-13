import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * next/font/google is a build-time transform: outside `next build` the exported
 * loaders don't exist, so importing any component that loads a font throws.
 *
 * Vitest validates a mock's exports against the real module, so each loader has
 * to be named explicitly — a catch-all Proxy is rejected. If a new typeface is
 * introduced and a test starts failing with "No <Font> export is defined", add
 * it here.
 */
const FONT_LOADERS = [
  "Archivo",
  "Barlow_Condensed",
  "Chivo_Mono",
  "Courier_Prime",
  "DM_Sans",
  "Epilogue",
  "Fraunces",
  "Geist",
  "IBM_Plex_Mono",
  "IBM_Plex_Sans",
  "Inter",
  "Instrument_Sans",
  "Instrument_Serif",
  "JetBrains_Mono",
  "Karla",
  "Libre_Franklin",
  "Literata",
  "Manrope",
  "Newsreader",
  "Plus_Jakarta_Sans",
  "Public_Sans",
  "Roboto_Mono",
  "Saira_Semi_Condensed",
  "Schibsted_Grotesk",
  "Sora",
  "Source_Serif_4",
  "Space_Grotesk",
  "Space_Mono",
  "Special_Elite",
  "Spectral",
  "Syne",
  "Work_Sans",
] as const;

vi.mock("next/font/google", () => {
  const loader = () => ({
    className: "font-mock",
    variable: "--font-mock",
    style: { fontFamily: "mock" },
  });

  return Object.fromEntries(FONT_LOADERS.map((name) => [name, loader]));
});
