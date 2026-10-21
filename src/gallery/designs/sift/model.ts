import { vendors } from "../../kit/data";

/**
 * A sample market for the scroll story. Each dot is one approved platform.
 * Each filter sets some dots aside until six fits remain. The numbers are
 * illustrative, and the page labels them as a sample.
 */
export const MARKET_SIZE = 120;
export const SURVIVOR_IDS = vendors.map((vendor) => vendor.id);

export type StoryStep = { title: string; body: string; remaining: number };

export const storySteps: StoryStep[] = [
  { title: "Every approved platform starts in the running.", body: "This sample market has 120 HR platforms. Comparing them yourself means months of demos and sales calls.", remaining: 120 },
  { title: "You run payroll in three states.", body: "Platforms that cannot pay people in all three states are set aside. 74 remain.", remaining: 74 },
  { title: "Benefits and ACA reporting are must-haves.", body: "Platforms without verified benefits administration or ACA reporting are set aside. 31 remain.", remaining: 31 },
  { title: "You need to be live in 90 days, for 240 people.", body: "Platforms that cannot launch in time at your size are set aside. Six fits remain.", remaining: 6 },
  { title: "Six fits. Names hidden.", body: "Each fit is scored on evidence, and the names stay masked so the brand cannot sway you. A bigger circle means a better fit.", remaining: 6 },
  { title: "You choose up to five.", body: "Pick your contenders in the scorecard below. Your advisor reveals their names after you talk your needs through.", remaining: 6 },
];

/** Step at which a dot is set aside: 1, 2, or 3. Survivors never are, shown as 0. */
export type Dot = { out: 0 | 1 | 2 | 3; vendor: string | null };

function random(seed: number) {
  // Mulberry32: small, fast, and repeatable, so the server and client agree.
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDots(): Dot[] {
  const counts = storySteps.slice(0, 4).map((step) => step.remaining);
  const dots: Dot[] = [];
  for (let step = 1; step <= 3; step += 1) {
    for (let index = 0; index < counts[step - 1]! - counts[step]!; index += 1) dots.push({ out: step as 1 | 2 | 3, vendor: null });
  }
  SURVIVOR_IDS.forEach((id) => dots.push({ out: 0, vendor: id }));
  const next = random(7);
  for (let index = dots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [dots[index], dots[swap]] = [dots[swap]!, dots[index]!];
  }
  return dots;
}

/** How many dots are still in the running at a story step. */
export function remainingAt(dots: readonly Dot[], step: number): number {
  return dots.filter((dot) => dot.out === 0 || dot.out > step).length;
}
