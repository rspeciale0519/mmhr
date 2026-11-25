/**
 * The pure "what is on stage" logic for the /how-it-works scroll story.
 *
 * Both pictures of the story use this file: the 3D stage (StoryStage.tsx)
 * and the flat still pictures (SceneStill.tsx) shown to phones, to visitors
 * who ask for less motion, and to devices without WebGL. Keeping the logic
 * here, with no drawing code, means both pictures always tell the same
 * story, and the story can be unit tested without a browser.
 *
 * The story runs on one number, `progress`, from 0 to 6:
 * - 0 to 1 is step 01 (needs go in), 1 to 2 is step 02 (providers appear
 *   masked and get scored), and so on up to step 06 (sign direct).
 * - Each change happens in the first half of its step, so the picture
 *   settles while the visitor is still reading that step's text.
 *
 * Nothing here is a real provider or a real score. The page labels the
 * picture "Illustration" and "Sample data". Letters stand in for names.
 */

/** Number of steps in the story (matches sixSteps on the home page). */
export const STEP_COUNT = 6;

/** Labels for the needs that fly into the middle in step 01. */
export const sceneNeeds = ["Size", "Modules", "Must-haves", "Timeline"] as const;

// Directions of the four needs (degrees): two behind the middle, two in
// front, spread to the sides so their tags never overlap, even on a phone.
const NEED_ANGLES = [330, 210, 150, 30];

/**
 * Where need number `index` is on the field, given how far the needs have
 * been pulled in (0 = far out, 1 = gathered around the middle).
 */
export function needPlace(index: number, pull: number) {
  return { radius: 3.2 + (1.6 - 3.2) * pull, angle: (NEED_ANGLES[index] * Math.PI) / 180 };
}

/**
 * Sample providers. `angle` is the fixed direction from the middle, in
 * degrees, hand-placed so the five best fits sit apart and their tags do
 * not overlap. The list is in score order, best first, so the first five
 * are the contenders picked in step 04.
 */
const sampleProviders = [
  { letter: "A", score: 93, angle: 200 },
  { letter: "B", score: 86, angle: 330 },
  { letter: "C", score: 78, angle: 135 },
  { letter: "D", score: 71, angle: 265 },
  { letter: "E", score: 64, angle: 30 },
  { letter: "F", score: 58, angle: 95 },
  { letter: "G", score: 52, angle: 300 },
  { letter: "H", score: 47, angle: 60 },
  { letter: "I", score: 41, angle: 170 },
  { letter: "J", score: 36, angle: 5 },
] as const;

/** How many contenders the buyer picks (the real limit is also five). */
const PICKS = 5;
/**
 * The provider the buyer signs with in step 06. It is deliberately not the
 * top score: the score informs the choice, the buyer makes it.
 */
const CHOSEN = 1;

/** Scores that get a guide ring drawn on the field. */
export const RING_SCORES = [90, 75, 60] as const;
/** Where providers wait before they are scored, and the edge of the field. */
const OUTER = 3.6;

/**
 * Turns a fit score into a distance from the middle. A higher score sits
 * closer to "your needs". Distance means fit, as on the home page.
 */
export function radiusFor(score: number) {
  return 0.75 + ((100 - score) / 55) * 2.9;
}

/**
 * How far `value` has moved through the window from `start` to `end`, as 0
 * to 1, with a soft landing (the same feel as --co-ease in motion.css).
 */
function phase(value: number, start: number, end: number) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return 1 - (1 - t) ** 3;
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

/** One sample provider, as the picture should draw it right now. */
export type SceneProvider = {
  letter: string;
  score: number;
  /** Direction from the middle, in radians. */
  angle: number;
  /** Small height offset so the field does not look flat. */
  height: number;
  /** Distance from the middle. */
  radius: number;
  /** 0 to 1: how visible the dot is. */
  opacity: number;
  /** 0 to 1: how far it has turned into a picked contender (mint). */
  picked: number;
  /** 0 to 1: how far it has turned into the provider the buyer signs with. */
  chosen: number;
  /** 0 to 1: how lit the line from the middle to this dot is. */
  link: number;
  /**
   * Where the RFP "packet" is on its way to this provider, 0 (at the
   * middle) to 1 (arrived), or null when no packet is travelling.
   */
  packet: number | null;
  /** The text tag over the dot, or null when this dot has no tag. */
  tag: { name: string; note: string; opacity: number; on: boolean } | null;
};

export type Scene = {
  /** 0 to 1: how far the needs have flown into the middle. */
  needsPull: number;
  /** 0 to 1: how visible the need tags are. */
  needsOpacity: number;
  /** 0 to 1: how visible the score rings are. */
  rings: number;
  /** The advisor review sweep: a ring that grows out from the middle. */
  sweep: { radius: number; opacity: number };
  providers: SceneProvider[];
};

/** Works out everything on stage for one moment of the story. */
export function sceneAt(progress: number): Scene {
  const p = Math.min(STEP_COUNT, Math.max(0, progress));

  // Step 01: the needs fly in, then fade as the providers appear.
  const needsPull = phase(p, 0.05, 0.6);
  const needsFade = phase(p, 1, 1.3);
  // Step 02: providers appear on the outer edge, then glide in by score.
  const appear = phase(p, 1, 1.25);
  const scored = phase(p, 1.2, 1.6);
  // Step 03: the advisor review sweep runs from the middle outward.
  const review = Math.min(1, Math.max(0, (p - 2) / 0.55));
  const sweepRadius = review * (OUTER + 0.4);
  // Step 04: the five contenders turn mint; the rest step back.
  const pick = phase(p, 3, 3.45);
  // Step 05: one RFP travels out to each contender.
  const sendRaw = Math.min(1, Math.max(0, (p - 4) / 0.6));
  const send = phase(p, 4, 4.6);
  // Step 06: the buyer signs with one provider.
  const sign = phase(p, 5, 5.45);

  const providers = sampleProviders.map((sample, index): SceneProvider => {
    const contender = index < PICKS;
    const chosenOne = index === CHOSEN;
    const target = radiusFor(sample.score);
    // Providers that were not picked drift outward a little in step 04.
    const radius = mix(OUTER, target, scored) + (contender ? 0 : pick * 0.5);

    // A name is shown once the advisor sweep has passed the dot.
    const revealed = review > 0 && sweepRadius >= radius;

    let opacity = appear * (0.55 + 0.45 * scored);
    if (!contender) opacity *= mix(1, 0.3, pick) * mix(1, 0.5, send);
    else if (!chosenOne) opacity *= mix(1, 0.45, sign);

    const picked = contender ? pick : 0;
    const chosen = chosenOne ? sign : 0;
    const link = contender ? send * mix(1, chosenOne ? 1 : 0.25, sign) : 0;
    const packet = contender && sendRaw > 0 && sendRaw < 1 ? send : null;

    let tag: SceneProvider["tag"] = null;
    if (contender) {
      let note = String(sample.score);
      if (chosenOne && sign > 0.5) note = "Signed direct";
      else if (send > 0.95) note = "RFP sent";
      const tagOpacity = appear * (chosenOne ? 1 : mix(1, 0, sign));
      tag = {
        name: revealed ? `Provider ${sample.letter}` : "Masked",
        note,
        opacity: tagOpacity,
        on: pick > 0.5,
      };
    }

    return {
      letter: sample.letter,
      score: sample.score,
      angle: (sample.angle * Math.PI) / 180,
      height: (((index * 37) % 7) - 3) * 0.08,
      radius,
      opacity,
      picked,
      chosen,
      link,
      packet,
      tag,
    };
  });

  return {
    needsPull,
    needsOpacity: (1 - needsFade) * Math.min(1, 0.35 + needsPull),
    rings: scored,
    sweep: { radius: sweepRadius, opacity: review > 0 && review < 1 ? Math.sin(review * Math.PI) : 0 },
    providers,
  };
}

/**
 * The moment of the story used for a step's still picture: late in the
 * step, once its change has settled. `stepIndex` counts from 0.
 */
export function stillProgress(stepIndex: number) {
  return stepIndex + 0.8;
}

/** Which step (0 to 5) a story progress value falls in. */
export function activeStepAt(progress: number) {
  return Math.min(STEP_COUNT - 1, Math.max(0, Math.floor(progress)));
}

/**
 * Reads the story progress from where the step texts are on screen.
 *
 * `steps` holds each step block's top and bottom edge, in pixels from the
 * top of the window, in page order. `line` is a reading line across the
 * window (for example 45% of its height). Progress is the step the line is
 * in, plus how far through that step the line is. Above the first step it
 * is 0; below the last it is 6.
 */
export function progressFromSteps(steps: readonly { top: number; bottom: number }[], line: number) {
  if (steps.length === 0 || line < steps[0].top) return 0;
  for (let index = 0; index < steps.length; index += 1) {
    const start = steps[index].top;
    // A step ends where the next one begins, so gaps count as the step.
    const end = index + 1 < steps.length ? steps[index + 1].top : steps[index].bottom;
    if (line < end) return index + (line - start) / Math.max(1, end - start);
  }
  return steps.length;
}
