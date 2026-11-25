import { describe, expect, test } from "vitest";

import { activeStepAt, progressFromSteps, radiusFor, sceneAt, stillProgress } from "./story-scene";

/** The tagged providers (the five contenders) at one moment. */
const tags = (progress: number) => sceneAt(progress).providers.flatMap((p) => (p.tag ? [p.tag] : []));

describe("reading progress from the step positions", () => {
  // Three steps, 100px tall, one after another, starting 200px down.
  const steps = [
    { top: 200, bottom: 300 },
    { top: 300, bottom: 400 },
    { top: 400, bottom: 500 },
  ];

  test("is 0 above the first step and the step count below the last", () => {
    expect(progressFromSteps(steps, 150)).toBe(0);
    expect(progressFromSteps(steps, 520)).toBe(3);
    expect(progressFromSteps([], 100)).toBe(0);
  });

  test("is the step plus how far through it the reading line is", () => {
    expect(progressFromSteps(steps, 200)).toBe(0);
    expect(progressFromSteps(steps, 250)).toBe(0.5);
    expect(progressFromSteps(steps, 325)).toBe(1.25);
    expect(progressFromSteps(steps, 490)).toBeCloseTo(2.9);
  });

  test("names the active step, never past the last one", () => {
    expect(activeStepAt(0)).toBe(0);
    expect(activeStepAt(2.99)).toBe(2);
    expect(activeStepAt(6)).toBe(5);
    expect(activeStepAt(-1)).toBe(0);
  });
});

describe("the story scene", () => {
  test("starts with the needs outside and no providers", () => {
    const scene = sceneAt(0);
    expect(scene.needsPull).toBe(0);
    expect(scene.providers.every((p) => p.opacity === 0)).toBe(true);
  });

  test("step 01 pulls the needs in; step 02 shows providers scored and masked", () => {
    expect(sceneAt(stillProgress(0)).needsPull).toBe(1);
    const scene = sceneAt(stillProgress(1));
    expect(scene.needsOpacity).toBe(0);
    for (const provider of scene.providers) {
      expect(provider.opacity).toBeGreaterThan(0.9);
      // A higher score sits closer to the middle.
      expect(provider.radius).toBeCloseTo(radiusFor(provider.score));
    }
    expect(tags(stillProgress(1)).map((tag) => tag.name)).toEqual(Array(5).fill("Masked"));
  });

  test("names stay masked until the advisor review, then show as letters", () => {
    expect(tags(1.99).every((tag) => tag.name === "Masked")).toBe(true);
    expect(tags(stillProgress(2)).map((tag) => tag.name)).toEqual([
      "Provider A",
      "Provider B",
      "Provider C",
      "Provider D",
      "Provider E",
    ]);
  });

  test("step 04 picks exactly five contenders", () => {
    const picked = sceneAt(stillProgress(3)).providers.filter((p) => p.picked > 0.9);
    expect(picked).toHaveLength(5);
    expect(sceneAt(stillProgress(2)).providers.some((p) => p.picked > 0)).toBe(false);
  });

  test("step 05 sends one RFP to each contender and no one else", () => {
    expect(sceneAt(4.3).providers.filter((p) => p.packet !== null)).toHaveLength(5);
    const sent = sceneAt(stillProgress(4)).providers;
    expect(sent.filter((p) => p.link > 0.9)).toHaveLength(5);
    expect(tags(stillProgress(4)).every((tag) => tag.note === "RFP sent")).toBe(true);
  });

  test("step 06 signs one provider directly", () => {
    const scene = sceneAt(stillProgress(5));
    expect(scene.providers.filter((p) => p.chosen > 0.9)).toHaveLength(1);
    const visibleTags = tags(stillProgress(5)).filter((tag) => tag.opacity > 0.5);
    expect(visibleTags).toEqual([expect.objectContaining({ note: "Signed direct" })]);
  });
});
