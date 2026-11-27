"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { motionAllowed, useReducedMotion } from "../../motion/media";
import { useInView } from "../../motion/scroll";
import { SceneStill } from "./SceneStill";
import { stillProgress } from "./story-scene";

/** Length of one step's little film, in milliseconds. */
const PLAY_MS = 2200;

/** Gentle start, soft landing, so the step's change reads as one movement. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** True when the element is laid out (CSS shows it), not display: none. */
const shown = (element: HTMLElement) => element.getClientRects().length > 0;

/**
 * One step's own picture, used where the sticky 3D stage is not: on phones
 * (760px and narrower) and for visitors who ask for less motion. CSS hides
 * it while the scroll story runs.
 *
 * Phones get a light, animated version: when the picture scrolls into view
 * it plays that step's change (the needs fly in, five turn mint while
 * still masked, the picks' names unmask...) by redrawing the flat
 * picture for under two seconds, then stops. "Replay" plays it again.
 * Nothing loops, nothing runs off screen.
 *
 * Less motion: the settled still, no Replay button. The server HTML (and
 * every visitor without JavaScript) also gets the settled still. Only a
 * picture that is still below the screen when the page loads is rewound to
 * the step's start, so a visible picture never jumps backwards.
 */
export function StepPicture({ index, n }: { index: number; n: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { threshold: 0.45 });
  const settled = stillProgress(index);
  const [progress, setProgress] = useState(settled);
  // "ready": rewound, waiting to play on arrival; "done": played (or never needed).
  const state = useRef<"idle" | "ready" | "done">("idle");
  const frame = useRef(0);

  /** Plays the step's change from its start to the settled picture. */
  const play = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const begin = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / PLAY_MS);
      setProgress(index + (settled - index) * easeInOut(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [index, settled]);

  // On load: rewind a picture that is shown and still below the screen.
  useEffect(() => {
    const element = ref.current;
    if (!element || !motionAllowed() || !shown(element)) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    state.current = "ready";
    // Waiting for the visitor to scroll down to it: show the step's start.
    // (Set from an effect on purpose: only the browser knows it is below.)
    setProgress(index);
  }, [index]);

  // On arrival: play once.
  useEffect(() => {
    if (!inView || state.current !== "ready") return;
    state.current = "done";
    play();
  }, [inView, play]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div className="co-hiw-step-pic" data-co-reveal="" data-co-variant="scale" ref={ref}>
      <SceneStill id={`co-hiw-still-${n}`} progress={progress} />
      <span className="co-chip co-chip-n co-hiw-chip">Illustration</span>
      <span className="co-stage-key">Middle: your needs. Closer is a closer fit.</span>
      {reduced ? null : (
        <button
          aria-label={`Replay the step ${n} picture`}
          className="co-hiw-replay"
          onClick={() => {
            state.current = "done";
            setProgress(index);
            play();
          }}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
            <path
              d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2.5v3.2h3.2"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
          Replay
        </button>
      )}
    </div>
  );
}
