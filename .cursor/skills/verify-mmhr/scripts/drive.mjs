#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  APP_URL,
  PULSE_HEADING,
  ensureDir,
  fetchText,
  readState,
  repoRoot,
  skillRoot,
  writeJson,
  writeText,
} from "./lib.mjs";

const features = new Set(["landing"]);

function usage() {
  return `Usage: node .cursor/skills/verify-mmhr/scripts/drive.mjs <feature>

Supported features: landing
Install Playwright first:
  npm install --prefix .cursor/skills/verify-mmhr playwright@1.56.1`;
}

async function loadPlaywright() {
  const candidates = [
    path.join(skillRoot, "node_modules/playwright/index.mjs"),
    path.join(repoRoot, "node_modules/playwright/index.mjs"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return import(pathToFileURL(file).href);
  }
  throw new Error(usage());
}

async function maybeDeclineCookies(page) {
  const banner = page.getByRole("region", { name: "Cookie consent" });
  try {
    await banner.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return;
  }
  await page.getByRole("button", { name: "Decline" }).click();
  await banner.waitFor({ state: "hidden" });
}

async function capture(page, dir, stem) {
  const png = path.join(dir, `${stem}.png`);
  const ariaPath = path.join(dir, `${stem}.aria.txt`);
  await page.screenshot({ path: png, fullPage: true });
  let aria = "";
  try {
    aria = await page.locator("body").ariaSnapshot();
  } catch {
    aria = await page.locator("body").innerText();
  }
  writeText(ariaPath, aria);
  return { png, ariaPath };
}

async function driveLanding(page, dir) {
  const proof = [];
  const consoleMessages = [];
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    consoleMessages.push({ type: "pageerror", text: error.message });
  });

  const response = await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: PULSE_HEADING }).waitFor();
  await maybeDeclineCookies(page);
  proof.push(await capture(page, dir, "01-landing-dark"));
  if (response?.status() !== 200) throw new Error(`GET / returned ${response?.status()}`);

  const email = "verify-landing@example.com";
  await page.getByRole("textbox", { name: "Work email" }).first().fill(email);
  await page.getByRole("button", { name: "Get access" }).click();
  await page.getByRole("heading", { name: "Create your account" }).waitFor();
  await maybeDeclineCookies(page);
  const filledEmail = await page.getByLabel("Work email").inputValue();
  if (filledEmail !== email) throw new Error(`Sign-up email was ${filledEmail}, expected ${email}`);
  if (!page.url().includes("/sign-up")) throw new Error(`Expected /sign-up, got ${page.url()}`);
  proof.push(await capture(page, dir, "02-signup-from-landing"));

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: PULSE_HEADING }).waitFor();
  await maybeDeclineCookies(page);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Contact" }).click();
  await page.getByRole("heading", { name: "Talk to an advisor." }).waitFor();
  proof.push(await capture(page, dir, "03-contact"));

  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await page.getByRole("heading", { name: "Privacy policy" }).waitFor();
  proof.push(await capture(page, dir, "04-privacy"));

  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await page.getByRole("heading", { name: "Terms of service" }).waitFor();
  proof.push(await capture(page, dir, "05-terms"));

  await page.getByRole("link", { name: "MatchMaker HR" }).first().click();
  await page.getByRole("heading", { name: PULSE_HEADING }).waitFor();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.getByRole("button", { name: "Switch to dark theme" }).waitFor();
  const theme = await page.locator(".pu").getAttribute("data-theme");
  if (theme !== "light") throw new Error(`Expected data-theme=light, got ${theme}`);
  proof.push(await capture(page, dir, "06-landing-light"));

  const home = await fetchText(APP_URL);
  writeJson(path.join(dir, "http-home.json"), {
    status: home.status,
    pulseHeading: home.body.includes(PULSE_HEADING),
    url: home.url,
  });
  writeJson(path.join(dir, "console.json"), consoleMessages);
  const report = [
    "# Landing drive report",
    "",
    `- URL: ${APP_URL}`,
    `- GET / status: ${home.status}`,
    `- Pulse heading present: ${home.body.includes(PULSE_HEADING)}`,
    `- Sign-up prefill: ${filledEmail}`,
    `- Light theme data-theme: ${theme}`,
    `- Screenshots: ${proof.map((item) => path.basename(item.png)).join(", ")}`,
    "- Did not submit the newsletter or contact forms (those POST to /api/newsletter and /api/leads).",
    "",
  ].join("\n");
  writeText(path.join(dir, "report.md"), report);
  console.log(`verify-mmhr drive landing ok`);
  console.log(`evidence ${dir}`);
  for (const item of proof) console.log(`screenshot ${item.png}`);
}

async function main() {
  const feature = process.argv[2];
  if (!features.has(feature)) throw new Error(usage());
  const state = readState();
  if (!state || state.cleanedAt) throw new Error("No live instance. Run launch and doctor first.");
  const dir = path.join(state.evidenceDir, feature);
  ensureDir(dir);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    if (feature === "landing") await driveLanding(page, dir);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
