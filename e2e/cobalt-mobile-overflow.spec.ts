import { expect, test, type Page } from "@playwright/test";

const phoneWidths = [375, 390, 414, 430] as const;
const phoneHeight = 844;

const marketingRoutes = ["/", "/contact", "/privacy", "/terms"] as const;
const appAndAuthRoutes = [
  "/sign-in",
  "/sign-up",
  "/customer",
  "/customer/evaluation",
  "/home",
  "/vendor",
  "/admin",
  "/this-page-does-not-exist",
] as const;

type OverflowMeasurement = {
  innerWidth: number;
  visualWidth: number;
  documentScrollWidth: number;
  bodyScrollWidth: number;
  columnScrollWidth: number;
  viewport: string;
  hasGlowClip: boolean;
};

async function measureOverflow(page: Page): Promise<OverflowMeasurement> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const column = document.querySelector(".co-w");
    const visualWidth = window.visualViewport?.width ?? window.innerWidth;
    return {
      innerWidth: window.innerWidth,
      visualWidth,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      columnScrollWidth: column?.scrollWidth ?? 0,
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
      hasGlowClip: Boolean(document.querySelector(".co-glows")),
    };
  });
}

function expectNoHorizontalOverflow(measured: OverflowMeasurement, route: string, width: number) {
  const slack = 1;
  const screenWidth = Math.min(measured.visualWidth, width);
  expect(measured.viewport, `${route} @ ${width}px viewport meta`).toMatch(/width=device-width/);
  expect(measured.viewport, `${route} @ ${width}px initial-scale`).toMatch(/initial-scale=1/);
  // iOS shrink-to-fit expands window.innerWidth to the overflowing layout
  // width, so compare against the visual viewport, not innerWidth alone.
  expect(
    measured.innerWidth,
    `${route} @ ${width}px innerWidth ${measured.innerWidth} > visual ${measured.visualWidth} (shrink-to-fit)`,
  ).toBeLessThanOrEqual(screenWidth + slack);
  expect(
    measured.documentScrollWidth,
    `${route} @ ${width}px documentElement.scrollWidth ${measured.documentScrollWidth} > visual ${screenWidth}`,
  ).toBeLessThanOrEqual(screenWidth + slack);
  expect(
    measured.bodyScrollWidth,
    `${route} @ ${width}px body.scrollWidth ${measured.bodyScrollWidth} > visual ${screenWidth}`,
  ).toBeLessThanOrEqual(screenWidth + slack);
  if (measured.columnScrollWidth > 0) {
    expect(
      measured.columnScrollWidth,
      `${route} @ ${width}px .co-w.scrollWidth ${measured.columnScrollWidth} > visual ${screenWidth}`,
    ).toBeLessThanOrEqual(screenWidth + slack);
  }
}

async function openRoute(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: phoneHeight });
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} should respond`).not.toBeNull();
  await page.waitForFunction(() => document.readyState === "complete");
}

test.describe("Cobalt does not overflow phone widths", () => {
  for (const width of phoneWidths) {
    test(`landing @ ${width}px`, async ({ page }) => {
      await openRoute(page, "/", width);
      const measured = await measureOverflow(page);
      expect(measured.hasGlowClip).toBe(true);
      expectNoHorizontalOverflow(measured, "/", width);
    });
  }

  for (const route of marketingRoutes.filter((item) => item !== "/")) {
    test(`${route} @ 390px`, async ({ page }) => {
      await openRoute(page, route, 390);
      const measured = await measureOverflow(page);
      expect(measured.hasGlowClip).toBe(true);
      expectNoHorizontalOverflow(measured, route, 390);
    });
  }

  for (const route of appAndAuthRoutes) {
    test(`${route} @ 390px`, async ({ page }) => {
      await openRoute(page, route, 390);
      const measured = await measureOverflow(page);
      expectNoHorizontalOverflow(measured, route, 390);
    });
  }
});
