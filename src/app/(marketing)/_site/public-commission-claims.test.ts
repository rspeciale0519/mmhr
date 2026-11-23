import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const PUBLIC_SOURCES = [
  "src/app/(marketing)/_site/data.ts",
  "src/app/(marketing)/_site/PageParts.tsx",
  "src/app/(marketing)/_site/Footer.tsx",
  "src/app/(marketing)/(site)/broker-model/page.tsx",
  "src/app/(marketing)/(site)/transparency/page.tsx",
  "src/app/(marketing)/(site)/terms/page.tsx",
  "src/app/(marketing)/(site)/contact/page.tsx",
  "src/app/(marketing)/(site)/partners/brokers-consultants/page.tsx",
  "src/app/(marketing)/(site)/partners/software-vendors/page.tsx",
  "src/app/(marketing)/(site)/resources/partner-finder/page.tsx",
  "src/designs/_content.ts",
  "src/designs/pulse/Body.tsx",
  "src/designs/cobalt/landing/Body.tsx",
].map((relativePath) => ({
  relativePath,
  source: readFileSync(join(process.cwd(), relativePath), "utf8"),
}));

const EQUAL_RATE_CLAIM =
  /same rate|identical commission|flat commission|flat rate|same commission|paid the same|same no matter|no commission on implementation/i;

describe("public commission claims", () => {
  test("does not publish equal-rate or unsupported commission claims", () => {
    const offenders = PUBLIC_SOURCES.filter(({ source }) => EQUAL_RATE_CLAIM.test(source)).map(
      ({ relativePath }) => relativePath,
    );

    expect(offenders).toEqual([]);
  });

  test("states the customer and provider payment roles", () => {
    const data = PUBLIC_SOURCES.find(({ relativePath }) => relativePath.endsWith("_site/data.ts"))?.source;
    const shared = PUBLIC_SOURCES.find(({ relativePath }) => relativePath.endsWith("_site/PageParts.tsx"))?.source;

    expect(data).toContain("Customers do not pay MMHR a fee");
    expect(data).toContain("Providers pay us under commission or referral arrangements");
    expect(shared).toContain("Providers pay us under commission or referral arrangements");
  });
});
