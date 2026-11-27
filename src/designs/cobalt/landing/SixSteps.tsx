"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Reveal, Spotlight, useInView, useReducedMotion } from "../motion";
import { StepGlyph } from "./StepGlyphs";

/** One step of the buyer journey (sample-ranking.ts `sixSteps`). */
export type Step = { readonly n: string; readonly title: string; readonly body: string };

/** How long each step stays selected while the stepper plays on its own. */
export const STEP_MS = 5200;

/**
 * The home page's six steps as an interactive stepper.
 *
 * - Each step is a real button (inside its <h3>, like an accordion row) and
 *   the whole tile is its click area. The selected one has
 *   `aria-current="step"`. Arrow keys, Home and End move between steps.
 * - The panel under the row shows the selected step large, with a line
 *   drawing, "Step n of 06", what comes next, and previous/next buttons.
 * - While the section is on screen, it moves on by itself every few seconds:
 *   a thin bar fills along the top of the selected tile and, when it is
 *   full (its CSS animation ends), the next step is selected. Pointing at
 *   the stepper or focusing inside it pauses the bar; a hidden tab pauses
 *   it too. The first click or key press stops it for good: from then on
 *   the visitor is in charge. Reduced motion: it never moves on its own.
 * - Every step's number, title and text are always in the server HTML, so
 *   the page reads fully without JavaScript.
 *
 * The row is the `.co-six` grid from styles.css, wrapped in Reveal, so
 * motion.css draws each tile's top line and lights each number in order
 * when it scrolls into view.
 */
export function SixSteps({ steps }: { steps: readonly Step[] }) {
  const [active, setActive] = useState(0);
  // True once the visitor has chosen a step themselves.
  const [touched, setTouched] = useState(false);
  // Pointer over the stepper, or keyboard focus inside it.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hiddenTab, setHiddenTab] = useState(false);
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const inView = useInView(rootRef, { rootMargin: "-12% 0px -12% 0px" });

  useEffect(() => {
    const onVisibility = () => setHiddenTab(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const playing = !touched && !reduced && inView;
  const paused = hovered || focused || hiddenTab;
  const last = steps.length - 1;

  /** The visitor picks a step: select it and stop playing on our own. */
  function choose(index: number, moveFocus = false) {
    const next = (index + steps.length) % steps.length;
    setTouched(true);
    setActive(next);
    if (moveFocus) buttons.current[next]?.focus();
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last };
    if (!(event.key in moves)) return;
    event.preventDefault();
    choose(moves[event.key], true);
  }

  const step = steps[active];
  const then = active < last ? steps[active + 1] : null;

  return (
    <div
      className="co-steps"
      data-paused={playing && paused ? "" : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onFocus={() => setFocused(true)}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      ref={rootRef}
    >
      <Reveal className="co-six" variant="fade">
        {steps.map((item, index) => {
          const current = index === active;
          return (
            // --i tells motion.css which step this is, so the tiles' lines
            // draw and the numbers light up one after another.
            <div className="co-step" data-active={current ? "" : undefined} key={item.n} style={{ ["--i" as string]: index }}>
              <span aria-hidden="true" className="co-step-glow" />
              <span className="co-num">{item.n}</span>
              <h3>
                <button
                  aria-controls="six-steps-detail"
                  aria-current={current ? "step" : undefined}
                  className="co-step-btn"
                  onClick={() => choose(index)}
                  onKeyDown={(event) => onKey(event, index)}
                  ref={(element) => {
                    buttons.current[index] = element;
                  }}
                  type="button"
                >
                  {item.title}
                </button>
              </h3>
              <p>{item.body}</p>
              {/* The timer bar: fills while this step plays, then moves on. */}
              <span aria-hidden="true" className="co-step-bar">
                <i
                  className={current && playing ? "co-step-run" : undefined}
                  key={current && playing ? `run-${active}` : "still"}
                  onAnimationEnd={() => setActive((shown) => (shown === index ? (index + 1) % steps.length : shown))}
                  style={{ ["--co-step-ms" as string]: `${STEP_MS}ms` }}
                />
              </span>
            </div>
          );
        })}
      </Reveal>

      <Reveal delay={240} variant="rise">
        <Spotlight className="co-gl co-steps-detail">
          <div aria-hidden="true" className="co-steps-art">
            <StepGlyph index={active} key={active} />
          </div>
          <div aria-live={touched ? "polite" : "off"} className="co-steps-text" id="six-steps-detail" key={active}>
            <span className="co-steps-of">
              Step {step.n} of {steps[last].n}
            </span>
            <p className="co-steps-title">{step.title}</p>
            <p className="co-steps-body">{step.body}</p>
            {then ? <p className="co-steps-then">Then: {then.title}</p> : null}
          </div>
          <div className="co-steps-nav">
            <button aria-label="Previous step" className="co-steps-arrow" disabled={active === 0} onClick={() => choose(active - 1)} type="button">
              <Arrow flip />
            </button>
            <button aria-label="Next step" className="co-steps-arrow" disabled={active === last} onClick={() => choose(active + 1)} type="button">
              <Arrow />
            </button>
          </div>
        </Spotlight>
      </Reveal>
    </div>
  );
}

/** A right-pointing arrow (left with `flip`). */
function Arrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18" style={flip ? { rotate: "180deg" } : undefined}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
