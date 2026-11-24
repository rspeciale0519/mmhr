import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

import { cobaltTokens } from "./tokens";

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "styles.css"), "utf8");

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("class");
});

test("stylesheet on-primary token matches the shipped button text color", () => {
  const match = css.match(/--co-on-primary:\s*(#[0-9a-fA-F]{6})/);
  expect(match?.[1].toLowerCase()).toBe(cobaltTokens.buttonText.toLowerCase());
});

test("the link inherit rule excludes button-styled anchors", () => {
  expect(css).toMatch(/\.co a:not\([^)]*\.co-btn/);
  expect(css).toMatch(/a\.co-btn-p:any-link/);
  expect(css).toMatch(/a\.co-btn-p:hover/);
  expect(css).toMatch(/a\.co-btn-p:focus/);
  expect(css).toMatch(/\.dark a\.co-btn-p:any-link/);
});

test("primary button links compute on-primary white against the navy inherit rule", () => {
  document.documentElement.className = "co";
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  document.body.innerHTML = `
    <a class="co-btn co-btn-p" href="/sign-up">Start your needs list</a>
    <a class="co-btn co-btn-g" href="/#how-it-works">How ranking works</a>
    <a href="/privacy">Privacy</a>
  `;

  const primary = document.querySelector("a.co-btn-p");
  const ghost = document.querySelector("a.co-btn-g");
  const prose = document.querySelector('a[href="/privacy"]');
  expect(primary).not.toBeNull();
  expect(ghost).not.toBeNull();
  expect(prose).not.toBeNull();

  const normalize = (color: string) => color.replace(/\s/g, "").toLowerCase();
  const primaryColor = normalize(getComputedStyle(primary!).color);
  const ghostColor = normalize(getComputedStyle(ghost!).color);
  const proseColor = normalize(getComputedStyle(prose!).color);

  // jsdom does not resolve custom properties to rgb(); it still applies the
  // winning declaration, so navy inherit must not leak onto the primary CTA.
  expect(["rgb(255,255,255)", "var(--co-on-primary)", "#ffffff", "#fff"]).toContain(primaryColor);
  expect(["rgb(13,26,74)", "var(--co-navy)"]).toContain(ghostColor);
  expect(["rgb(13,26,74)", "var(--co-navy)"]).toContain(proseColor);
});
