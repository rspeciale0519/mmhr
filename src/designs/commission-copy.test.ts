import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const retainedDesigns = [
  "advocate",
  "aperture",
  "beacon",
  "blueprint",
  "bureau",
  "calibrate",
  "console",
  "dossier",
  "grid",
  "harbor",
  "itinerary",
  "lattice",
  "ledger",
  "marquee",
  "memo",
  "redline",
  "report",
  "scorecard",
  "specimen",
  "sticker",
  "terminal",
] as const;

const unsupportedRateClaims = [
  /same rate/i,
  /identical rate/i,
  /same commission/i,
  /same either way/i,
  /rate from every vendor/i,
  /rate whichever/i,
  /same from every vendor/i,
];

describe("retained design commission copy", () => {
  test.each(retainedDesigns)("%s states the provider payment model", (design) => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "designs", design, "Design.tsx"),
      "utf8",
    );

    expect(source).toMatch(/commission or referral fee/i);
    for (const claim of unsupportedRateClaims) {
      expect(source).not.toMatch(claim);
    }
  });
});
