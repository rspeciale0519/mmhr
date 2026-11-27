import { expect, test, type Locator, type Page } from "@playwright/test";

const onPrimary = "rgb(255, 255, 255)";
const navy = "rgb(13, 26, 74)";

async function openLanding(page: Page) {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response, "landing should respond").not.toBeNull();
  await page.waitForFunction(() => document.readyState === "complete");
  await expect(page.locator("a.co-btn-p", { hasText: "Start your needs list" }).first()).toBeVisible();
}

function landingCtas(page: Page) {
  return {
    // The phone menu panel holds a second "Start free" link, so take the one
    // that is on screen (the header button, or the panel one when it is open).
    startFree: page.locator("a.co-btn-p:visible", { hasText: "Start free" }).first(),
    needs: page.locator("a.co-btn-p", { hasText: "Start your needs list" }).first(),
    ghost: page.locator("a.co-btn-g", { hasText: "How ranking works" }),
    accept: page.getByRole("button", { name: "Accept" }),
  };
}

async function expectOnPrimary(locator: Locator, label: string) {
  await expect(locator, label).toHaveCSS("color", onPrimary);
}

async function expectPrimaryCtas(page: Page) {
  const { startFree, needs, ghost, accept } = landingCtas(page);
  await expectOnPrimary(startFree, "Start free");
  await expectOnPrimary(needs, "Start your needs list");
  await expect(ghost, "ghost CTA stays navy").toHaveCSS("color", navy);
  if (await accept.isVisible()) {
    await expectOnPrimary(accept, "cookie Accept button");
  }

  await needs.hover();
  await expectOnPrimary(needs, "needs list hover");
  await needs.focus();
  await expectOnPrimary(needs, "needs list focus");
  await startFree.hover();
  await expectOnPrimary(startFree, "Start free hover");
  await startFree.focus();
  await expectOnPrimary(startFree, "Start free focus");

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expectOnPrimary(needs, "needs list in dark");
  await expectOnPrimary(startFree, "Start free in dark");
  await needs.hover();
  await expectOnPrimary(needs, "needs list hover in dark");
  await needs.focus();
  await expectOnPrimary(needs, "needs list focus in dark");
}

test("landing primary CTAs use white on-primary text at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLanding(page);
  await expectPrimaryCtas(page);
});

test.describe("desktop landing primary CTAs", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  test("use white on-primary text at 1440px", async ({ page }) => {
    await openLanding(page);
    await expectPrimaryCtas(page);
  });
});
