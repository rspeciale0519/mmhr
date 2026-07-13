import { describe, expect, test } from "vitest";

import { DESIGNS, ROUNDS, getDesign } from "@/designs/registry";

describe("design registry", () => {
  test("slugs are unique and URL-safe", () => {
    const slugs = DESIGNS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test("every design is reachable by slug", () => {
    for (const d of DESIGNS) {
      expect(getDesign(d.slug)?.name).toBe(d.name);
    }
    expect(getDesign("does-not-exist")).toBeUndefined();
  });

  // The directory groups by round, so a design in an unlisted round would
  // silently vanish from the page rather than error.
  test("every design's round is listed in ROUNDS", () => {
    const known = new Set(ROUNDS.map((r) => r.n));
    for (const d of DESIGNS) {
      expect(known, `round ${d.round} missing from ROUNDS`).toContain(d.round);
    }
  });

  test("each design carries what the directory card renders", () => {
    for (const d of DESIGNS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.line.length).toBeGreaterThan(0);
      expect(d.hero.length).toBeGreaterThan(0);
      expect(d.note.length).toBeGreaterThan(0);
      expect(d.type.length).toBeGreaterThan(0);
      expect(d.swatch.length).toBeGreaterThanOrEqual(2);
      for (const c of d.swatch) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(typeof d.Component).toBe("function");
    }
  });
});
