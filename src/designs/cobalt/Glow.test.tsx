import { readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { CobaltGlows } from "./Glow";

test("glows render inside a paint-clipped layer", () => {
  const { container } = render(<CobaltGlows />);
  const layer = container.querySelector(".co-glows");
  expect(layer).not.toBeNull();
  expect(layer?.getAttribute("aria-hidden")).toBe("true");
  expect(layer?.querySelectorAll(".co-glow")).toHaveLength(2);
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
