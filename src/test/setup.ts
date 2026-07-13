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
  "Geist",
  "IBM_Plex_Mono",
  "IBM_Plex_Sans",
  "Instrument_Sans",
  "Karla",
  "Manrope",
  "Newsreader",
  "Plus_Jakarta_Sans",
  "Saira_Semi_Condensed",
  "Sora",
  "Spectral",
] as const;

vi.mock("next/font/google", () => {
  const loader = () => ({
    className: "font-mock",
    variable: "--font-mock",
    style: { fontFamily: "mock" },
  });

  return Object.fromEntries(FONT_LOADERS.map((name) => [name, loader]));
});
