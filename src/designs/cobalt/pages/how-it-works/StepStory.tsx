"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { onScrollFrame } from "../../motion/frame";
import { motionAllowed } from "../../motion/media";
import { Spotlight, Tilt } from "../../motion/pointer";
import type { JourneyStep } from "./journey";
import { SceneStill } from "./SceneStill";
import { StepPicture } from "./StepPicture";
import { STEP_COUNT, activeStepAt, jumpTarget, progressFromSteps, stillProgress } from "./story-scene";

// The 3D stage and its library download only in the browser, and only once
// the story is close to the screen (see `near` below).
const StoryStage = dynamic(() => import("./StoryStage").then((module) => module.StoryStage), { ssr: false });

/**
 * When the scroll story runs: a screen wider than a phone, and no request
 * for less motion. The same widths and setting switch the layout in
 * how-it-works.css, so the CSS and this script always agree.
 */
const STORY_QUERY = "(min-width: 761px) and (prefers-reduced-motion: no-preference)";

/** Listens for the screen width or the motion setting changing. */
function watchStoryMode(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(STORY_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/** True when the scroll story should run (false when the browser cannot tell us). */
function storyModeNow() {
  return typeof window.matchMedia === "function" && window.matchMedia(STORY_QUERY).matches;
}

/**
 * The reading line, as a share of the window height from the top. A step
 * becomes active when its heading rises past this line, low on the screen,
 * so its change plays while the visitor reads it, not after it scrolls off.
 */
const READING_LINE = 0.7;

const pad = (value: number) => String(value).padStart(2, "0");

/** A CSS variable in a style object (React's types only know real properties). */
const cssVar = (name: string, value: string | number) => ({ [name]: value }) as CSSProperties;

/** The arrow inside the previous / next buttons. Points right; CSS turns it. */
function Arrow() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * The six steps of the buyer's journey as a scroll-driven story.
 *
 * The step texts are ordinary page content in an ordered list, always fully
 * readable. Beside them, on wide screens with motion allowed, one sticky
 * navy stage stays in view while the page scrolls past the steps. Where the
 * steps are on screen sets the story's progress (0 to 6), the stage draws
 * that moment, and the step under the reading line is highlighted. The
 * progress is also written as the CSS variable `--hiw-p` on the story, which
 * fills each step's timeline line and the rail's segments (how-it-works.css)
 * without React re-rendering on every frame.
 *
 * Under the stage, a step rail of real buttons (01 to 06, plus previous and
 * next) jumps to a step by scrolling the page smoothly to it. Scrolling is
 * never taken over: the page scrolls normally, the stage uses
 * `position: sticky`, the script only reads positions, and a jump is one
 * ordinary smooth `window.scrollTo`.
 *
 * Other cases, all decided by the same media query in CSS and script:
 * - Phones (760px and narrower) get no sticky stage, no rail and no 3D.
 *   Each step shows its own picture (StepPicture), which plays that step's
 *   change when it scrolls into view and replays on tap.
 * - Visitors who ask for less motion get each step's still picture.
 * - Before the 3D loads, and on devices without WebGL, the sticky stage
 *   shows the still picture of the current step.
 */
export function StepStory({ steps }: { steps: readonly JourneyStep[] }) {
  const story = useSyncExternalStore(watchStoryMode, storyModeNow, () => false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  // Progress lives in a ref: it changes on every scroll frame, and only the
  // 3D loop needs it that often. React state holds just the active step.
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  // What the polite live region says after the visitor uses the rail.
  const [announcement, setAnnouncement] = useState("");
  const readProgress = useCallback(() => progress.current, []);

  /** Each step block's top and bottom edge, from the top of the window. */
  const measureSteps = useCallback(() => {
    const items = listRef.current ? (Array.from(listRef.current.children) as HTMLElement[]) : [];
    return items.map((item) => {
      const box = item.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });
  }, []);

  // Read the progress from the step positions while the story runs, on the
  // toolkit's shared frame loop (one measurement per frame, passive).
  useEffect(() => {
    const root = rootRef.current;
    if (!story || !root) return;
    let next = 0;
    const stop = onScrollFrame({
      read: () => {
        next = progressFromSteps(measureSteps(), window.innerHeight * READING_LINE);
      },
      write: () => {
        progress.current = next;
        root.style.setProperty("--hiw-p", next.toFixed(3));
        setActive(activeStepAt(next));
      },
    });
    return () => {
      stop();
      root.style.removeProperty("--hiw-p");
    };
  }, [story, measureSteps]);

  /** Scrolls the page (smoothly) so the story lands settled on step `index`. */
  const jumpTo = useCallback(
    (index: number) => {
      const target = Math.min(STEP_COUNT - 1, Math.max(0, index));
      const top = jumpTarget(measureSteps(), target, window.innerHeight * READING_LINE, window.scrollY);
      window.scrollTo({ top, behavior: motionAllowed() ? "smooth" : "auto" });
      const step = steps[target];
      if (step) setAnnouncement(`Step ${step.n} of ${pad(STEP_COUNT)}: ${step.title}`);
    },
    [measureSteps, steps],
  );

  // Load the 3D stage only when the story is near the screen.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = stickyRef.current;
    if (!story || near || !element || typeof IntersectionObserver !== "function") return;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        watcher.disconnect();
      },
      { rootMargin: "400px" },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [story, near]);

  const current = steps[active] ?? steps[0];

  return (
    <div className="co-hiw-story" ref={rootRef}>
      <ol className="co-hiw-steps" ref={listRef}>
        {steps.map((step, index) => (
          <li
            aria-current={story && index === active ? "step" : undefined}
            className="co-hiw-step"
            id={`step-${step.n}`}
            key={step.n}
            style={cssVar("--n", index)}
          >
            {/* Phones and less motion: this step's own picture. */}
            <StepPicture index={index} n={step.n} />
            {/* Entrances (RevealAll in Body.tsx): each part arrives its own way. */}
            <span className="co-num co-hiw-num" data-co-reveal="" data-co-variant="scale">
              {step.n}
            </span>
            <h3 data-co-reveal="" data-co-variant="left" style={cssVar("--co-delay", "80ms")}>
              {step.title}
            </h3>
            <p className="co-hiw-sum" data-co-reveal="" data-co-variant="fade" style={cssVar("--co-delay", "160ms")}>
              {step.body}
            </p>
            <dl className="co-hiw-parts" data-co-reveal="" data-co-variant="group" style={cssVar("--co-delay", "220ms")}>
              {(
                [
                  ["You", step.you],
                  ["MMHR", step.mmhr],
                  ["You get", step.get],
                ] as const
              ).map(([term, text]) => (
                <Spotlight className="co-hiw-part" key={term}>
                  <dt>{term}</dt>
                  <dd>{text}</dd>
                </Spotlight>
              ))}
            </dl>
          </li>
        ))}
      </ol>

      <div className="co-hiw-rail">
        <div className="co-hiw-sticky" ref={stickyRef}>
          {/* The stage repeats what the step texts say, so screen readers
              skip it. It leans toward the mouse (Tilt), and the 3D camera
              inside leans too. Hidden by CSS on phones and with less motion. */}
          <Tilt aria-hidden="true" className="co-hiw-tilt" innerClassName="co-stage co-hiw-stage" max={3}>
            {/* Keyed by step, so each new still fades in (how-it-works.css). */}
            <SceneStill id="co-hiw-stage-still" key={active} progress={stillProgress(active)} />
            {story && near ? <StoryStage readProgress={readProgress} /> : null}
            <div className="co-hiw-caption">
              {/* Keyed by step, so the words slide in on each change. */}
              <span className="co-hiw-where" key={active}>
                Step {current.n} of {pad(STEP_COUNT)}: {current.title}
              </span>
              <span className="co-chip co-chip-n co-hiw-chip">Illustration</span>
            </div>
            <span className="co-stage-key">Middle: your needs. Closer is a closer fit. Letters stand in for names.</span>
          </Tilt>

          {/* Direct controls. Only while the story runs: they move the page
              through the story, so they mean nothing without it. */}
          {story ? (
            <nav aria-label="Story steps" className="co-hiw-ctrl">
              {/* aria-disabled (not disabled) at the ends, so keyboard focus
                  stays on the button when it reaches the first or last step. */}
              <button
                aria-disabled={active === 0}
                aria-label="Previous step"
                className="co-hiw-arrow co-hiw-prev"
                onClick={() => active > 0 && jumpTo(active - 1)}
                type="button"
              >
                <Arrow />
              </button>
              <ol className="co-hiw-dots">
                {steps.map((step, index) => (
                  <li key={step.n}>
                    <button
                      aria-current={index === active ? "step" : undefined}
                      className="co-hiw-dot"
                      onClick={() => jumpTo(index)}
                      style={cssVar("--n", index)}
                      type="button"
                    >
                      <span className="co-hiw-dot-n">{step.n}</span>{" "}
                      {/* The title pops up on hover and focus; it is also
                          the rest of the button's accessible name. */}
                      <span className="co-hiw-dot-t">{step.title}</span>
                      {/* This step's share of the story, filling as you scroll. */}
                      <span aria-hidden="true" className="co-hiw-seg" />
                    </button>
                  </li>
                ))}
              </ol>
              <button
                aria-disabled={active === STEP_COUNT - 1}
                aria-label="Next step"
                className="co-hiw-arrow co-hiw-next"
                onClick={() => active < STEP_COUNT - 1 && jumpTo(active + 1)}
                type="button"
              >
                <Arrow />
              </button>
              <p aria-live="polite" className="co-hiw-sr">
                {announcement}
              </p>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
