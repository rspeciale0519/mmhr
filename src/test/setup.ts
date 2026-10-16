import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * next/font/local is a build-time transform: outside `next build` the loader
 * does not exist, so importing any component that loads a font throws. Every
 * typeface is self-hosted under src/assets/fonts and loads through this one
 * default export.
 */
vi.mock("next/font/local", () => ({
  default: () => ({
    className: "font-mock",
    variable: "--font-mock",
    style: { fontFamily: "mock" },
  }),
}));
