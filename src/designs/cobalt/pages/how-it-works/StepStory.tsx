"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { JourneyStep } from "./journey";
import { SceneStill } from "./SceneStill";
import { STEP_COUNT, activeStepAt, progressFromSteps, stillProgress } from "./story-scene";

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
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
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

/**
 * The six steps of the buyer's journey as a scroll-driven story.
 *
 * The step texts are ordinary page content in an ordered list, always fully
 * readable. Beside them, on wide screens with motion allowed, one sticky
 * navy stage stays in view while the page scrolls past the steps. Where the
 * steps are on screen sets the story's progress (0 to 6), the stage draws
 * that moment, and the step under the reading line is highlighted.
 *
 * Scrolling is never taken over: the page scrolls normally, the stage uses
 * `position: sticky`, and the script only reads positions.
 *
 * Other cases, all decided by the same media query in CSS and script:
 * - Phones (760px and narrower) and visitors who ask for less motion get no
 *   sticky stage and no 3D. Each step shows its own still picture instead.
 * - Before the 3D loads, and on devices without WebGL, the sticky stage
 *   shows the still picture of the current step.
 */
export function StepStory({ steps }: { steps: readonly JourneyStep[] }) {
  const story = useSyncExternalStore(watchStoryMode, storyModeNow, () => false);
  const listRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // Progress lives in a ref: it changes on every scroll frame, and only the
  // 3D loop needs it that often. React state holds just the active step.
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const readProgress = useCallback(() => progress.current, []);

  // Read the progress from the step positions while the story runs.
  useEffect(() => {
    const list = listRef.current;
    if (!story || !list) return;
    const items = Array.from(list.children) as HTMLElement[];
    let frame = 0;
    function measure() {
      frame = 0;
      const line = window.innerHeight * READING_LINE;
      progress.current = progressFromSteps(
        items.map((item) => {
          const box = item.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom };
        }),
        line,
      );
      setActive(activeStepAt(progress.current));
    }
    // At most one measurement per drawn frame, however fast the scrolling.
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [story]);

  // Load the 3D stage only when the story is near the screen.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = stageRef.current;
    if (!story || near || !element || typeof IntersectionObserver !== "function") return;
    const watcher = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNear(true);
      watcher.disconnect();
    }, { rootMargin: "400px" });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [story, near]);

  const current = steps[active] ?? steps[0];

  return (
    <div className="co-hiw-story">
      <ol className="co-hiw-steps" ref={listRef}>
        {steps.map((step, index) => (
          <li
            aria-current={story && index === active ? "step" : undefined}
            className="co-hiw-step"
            id={`step-${step.n}`}
            key={step.n}
          >
            {/* Phones and less motion: this step's own still picture. */}
            <div className="co-hiw-step-pic">
              <SceneStill id={`co-hiw-still-${step.n}`} progress={stillProgress(index)} />
              <span className="co-chip co-chip-n co-hiw-chip">Illustration</span>
              <span className="co-stage-key">Middle: your needs. Closer is a closer fit.</span>
            </div>
            <span className="co-num co-hiw-num">{step.n}</span>
            <h3>{step.title}</h3>
            <p className="co-hiw-sum">{step.body}</p>
            <dl className="co-hiw-parts">
              <div>
                <dt>You</dt>
                <dd>{step.you}</dd>
              </div>
              <div>
                <dt>MMHR</dt>
                <dd>{step.mmhr}</dd>
              </div>
              <div>
                <dt>You get</dt>
                <dd>{step.get}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>

      {/* The sticky stage. It repeats what the step texts say, so screen
          readers skip it. Hidden by CSS on phones and with less motion. */}
      <div aria-hidden="true" className="co-hiw-rail">
        <div className="co-stage co-hiw-stage" ref={stageRef}>
          {/* Keyed by step, so each new still fades in (how-it-works.css). */}
          <SceneStill id="co-hiw-stage-still" key={active} progress={stillProgress(active)} />
          {story && near ? <StoryStage readProgress={readProgress} /> : null}
          <div className="co-hiw-caption">
            <span className="co-hiw-where">
              Step {current.n} of {String(STEP_COUNT).padStart(2, "0")}: {current.title}
            </span>
            <span className="co-chip co-chip-n co-hiw-chip">Illustration</span>
          </div>
          <span className="co-stage-key">Middle: your needs. Closer is a closer fit. Letters stand in for names.</span>
        </div>
      </div>
    </div>
  );
}
