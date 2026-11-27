import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { CobaltGlows } from "./Glow";
import { flushFrames, installMotionDoubles, setMedia } from "./motion/test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("glows render inside a paint-clipped layer", () => {
  const { container } = render(<CobaltGlows />);
  const layer = container.querySelector(".co-glows");
  expect(layer).not.toBeNull();
  expect(layer?.getAttribute("aria-hidden")).toBe("true");
  expect(layer?.querySelectorAll(".co-glow")).toHaveLength(2);
});

test("live glows follow scroll and the mouse through CSS variables, and pause off screen", () => {
  installMotionDoubles();
  vi.stubGlobal("scrollY", 300);
  const { container } = render(<CobaltGlows live />);
  const layer = container.querySelector<HTMLElement>(".co-glows")!;
  expect(layer).toHaveAttribute("aria-hidden", "true");
  expect(layer).toHaveAttribute("data-co-live");
  flushFrames();
  expect(layer.style.getPropertyValue("--co-sy")).toBe("300");

  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 800);
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: 750, clientY: 200 }));
  flushFrames();
  expect(layer.style.getPropertyValue("--co-px")).toBe("0.500");
  expect(layer.style.getPropertyValue("--co-py")).toBe("-0.500");
});

test("live glows stay still with reduced motion", () => {
  installMotionDoubles();
  setMedia({ reduce: true });
  const { container } = render(<CobaltGlows live />);
  expect(container.querySelector(".co-glows")).not.toHaveAttribute("data-co-live");
});

test("cobalt CSS clips glow overflow without trapping fixed chrome on .co-w", () => {
  const css = readFileSync(path.join(__dirname, "styles.css"), "utf8");
  expect(css).toMatch(/\.co-glows\s*\{[^}]*overflow:\s*hidden/);
  expect(css).toMatch(/overflow-x:\s*clip/);
  expect(css).toMatch(/overflow-y:\s*auto/);
  const columnRule = css.match(/\.co-w\s*\{[^}]+\}/)?.[0] ?? "";
  expect(columnRule).toMatch(/min-width:\s*0/);
  expect(columnRule).not.toMatch(/overflow(?:-x)?:\s*(?:hidden|clip)/);
});

test("root layout exports a device-width viewport", () => {
  const src = readFileSync(path.join(__dirname, "../../app/layout.tsx"), "utf8");
  expect(src).toMatch(/export const viewport/);
  expect(src).toMatch(/width:\s*"device-width"/);
  expect(src).toMatch(/initialScale:\s*1/);
});
