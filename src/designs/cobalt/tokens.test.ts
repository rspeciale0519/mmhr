import { expect, test } from "vitest";

import { cobaltTokens, contrastRatio } from "./tokens";

test("primary button white text meets WCAG AA 4.5:1 on both gradient stops", () => {
  const start = contrastRatio(cobaltTokens.buttonText, cobaltTokens.buttonStart);
  const end = contrastRatio(cobaltTokens.buttonText, cobaltTokens.buttonEnd);
  expect(start).toBeGreaterThanOrEqual(4.5);
  expect(end).toBeGreaterThanOrEqual(4.5);
});

test("the mockup light stop is darker in the shipped button", () => {
  const mockup = contrastRatio(cobaltTokens.buttonText, cobaltTokens.mockupButtonStart);
  const shipped = contrastRatio(cobaltTokens.buttonText, cobaltTokens.buttonStart);
  expect(shipped).toBeGreaterThan(mockup);
});
