import { describe, expect, test } from "vitest";

import { galleryDesigns } from "../registry";
import { designSlugs, feedbackInputSchema, recipeInputSchema } from "./model";
import { partIds, tagParts } from "./parts";

describe("gallery review model", () => {
  test("lists the same design slugs as the registry", () => {
    expect([...designSlugs]).toEqual(galleryDesigns.map((design) => design.slug));
  });

  test("accepts a pinned comment and trims its text", () => {
    const parsed = feedbackInputSchema.parse({
      kind: "comment", design: "launch", reviewer: "  Rob ", part: "hero", body: " Bigger headline ", x: 0.25, y: 1,
    });
    expect(parsed).toEqual({ kind: "comment", design: "launch", reviewer: "Rob", part: "hero", body: "Bigger headline", x: 0.25, y: 1 });
  });

  test("accepts notes on the overview and the builder, but picks only on designs", () => {
    expect(feedbackInputSchema.safeParse({ kind: "note", design: "gallery", reviewer: "Rob", body: "Calm set" }).success).toBe(true);
    expect(feedbackInputSchema.safeParse({ kind: "note", design: "final", reviewer: "Rob", body: "Clear" }).success).toBe(true);
    expect(feedbackInputSchema.safeParse({ kind: "pick", design: "gallery", reviewer: "Rob", part: "hero" }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ kind: "pick", design: "stack", reviewer: "Rob", part: "hero" }).success).toBe(true);
  });

  test.each([
    ["an unknown design", { kind: "comment", design: "pulse", reviewer: "Rob", body: "x" }],
    ["an unknown piece", { kind: "pick", design: "stack", reviewer: "Rob", part: "pricing" }],
    ["a pick with no piece", { kind: "pick", design: "stack", reviewer: "Rob" }],
    ["an empty comment", { kind: "comment", design: "stack", reviewer: "Rob", body: "   " }],
    ["a blank name", { kind: "note", design: "stack", reviewer: " ", body: "x" }],
    ["a name longer than 80 characters", { kind: "note", design: "stack", reviewer: "a".repeat(81), body: "x" }],
    ["a comment longer than 4000 characters", { kind: "comment", design: "stack", reviewer: "Rob", body: "a".repeat(4001) }],
    ["a position outside the section", { kind: "comment", design: "stack", reviewer: "Rob", body: "x", x: 1.2, y: 0 }],
    ["an extra field", { kind: "note", design: "stack", reviewer: "Rob", body: "x", admin: true }],
    ["an unknown kind", { kind: "like", design: "stack", reviewer: "Rob", part: "hero" }],
  ])("rejects %s", (_label, input) => {
    expect(feedbackInputSchema.safeParse(input).success).toBe(false);
  });

  test("accepts a recipe with a base design, picks, and notes", () => {
    const parsed = recipeInputSchema.parse({
      reviewer: "Rob",
      baseDesign: "launch",
      selections: [{ part: "scorecard", design: "radar", note: " Keep the overlay " }, { part: "hero", design: "stack" }],
      notes: "  ",
    });
    expect(parsed.selections[0]).toEqual({ part: "scorecard", design: "radar", note: "Keep the overlay" });
    expect(parsed.selections[1]?.note).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  test("rejects an empty recipe, a repeated piece, and an unknown design", () => {
    expect(recipeInputSchema.safeParse({ reviewer: "Rob", selections: [] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({
      reviewer: "Rob",
      selections: [{ part: "hero", design: "stack" }, { part: "hero", design: "radar" }],
    }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ reviewer: "Rob", selections: [{ part: "hero", design: "pulse" }] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ reviewer: "Rob", baseDesign: "stack", selections: [] }).success).toBe(true);
  });
});

describe("tagParts", () => {
  test("finds every section of a design that follows the id conventions", () => {
    document.body.innerHTML = `
      <div data-theme="light">
        <header>Menu</header>
        <main>
          <section aria-labelledby="demo-hero-title"><h1 id="demo-hero-title">Hero</h1></section>
          <section aria-label="Our promises"></section>
          <section id="demo-scorecard"><div id="demo-inner-scorecard"></div></section>
          <section id="demo-steps"></section>
          <section id="demo-case"></section>
          <section id="demo-needs"></section>
          <section id="demo-faq"></section>
        </main>
        <section aria-labelledby="demo-closing-title"></section>
        <footer>Footer</footer>
      </div>
      <div data-review-ui><footer>Not part of the design</footer></div>`;

    const found = tagParts(document);

    expect(found.sort()).toEqual(["case", "closing", "faq", "footer", "hero", "navigation", "needs", "promises", "scorecard", "steps"]);
    expect(document.getElementById("demo-scorecard")?.dataset.part).toBe("scorecard");
    expect(document.getElementById("demo-inner-scorecard")?.dataset.part).toBeUndefined();
    expect(document.querySelector("[data-review-ui] footer")?.hasAttribute("data-part")).toBe(false);
    expect(found.every((id) => partIds.includes(id))).toBe(true);
  });

  test("is safe to run more than once", () => {
    document.body.innerHTML = `<header></header><section id="x-faq"></section>`;
    tagParts(document);
    expect(tagParts(document).sort()).toEqual(["faq", "navigation"]);
    expect(document.querySelectorAll("[data-part]")).toHaveLength(2);
  });
});
