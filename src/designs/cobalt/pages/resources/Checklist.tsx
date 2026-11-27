"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { motionAllowed } from "../../motion/media";
import { Spotlight } from "../../motion/pointer";
import { Reveal, type RevealVariant } from "../../motion/Reveal";
import { Parallax } from "../../motion/scroll";
import { useChecklist } from "./checklist-store";
import type { ChecklistStep } from "./content";

/** A stable id for a step, from its title (kept if steps are reordered). */
export function stepId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Starts fast and lands softly, like the rest of Cobalt motion. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * A whole number that counts to its new value when it changes (CountUp
 * style), instead of jumping. The real value is rendered by React; this
 * only changes the text node's value while it counts. Reduced motion: it
 * simply changes.
 */
function RollingNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  // Before paint, so the new value never flashes before the count starts.
  useLayoutEffect(() => {
    const text = ref.current?.firstChild;
    const from = shown.current;
    shown.current = value;
    if (!(text instanceof Text) || from === value || !motionAllowed()) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      text.nodeValue = String(Math.round(from + (value - from) * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    text.nodeValue = String(from);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      text.nodeValue = String(value);
    };
  }, [value]);
  return (
    <span className="co-res-roll" ref={ref}>
      {value}
    </span>
  );
}

/** Circumference of the progress ring (radius 26), for its dash length. */
const RING = 2 * Math.PI * 26;

/** Entrances: the left column slides in, the right column rises. */
const variants: readonly RevealVariant[] = ["left", "rise"];

/**
 * The buyer's checklist on /resources, made checkable.
 *
 * - Each step has a real checkbox (named by the step's title; the title is
 *   its label too, so clicking it ticks the box). Ticking draws a tick and
 *   strikes the title through.
 * - A progress ring and "n of m done" above the list follow along; the
 *   number counts to its new value. Screen readers hear the new count
 *   (polite live region) only after the visitor ticks or resets.
 * - Ticks are kept in this browser (./checklist-store.ts) and restored on
 *   the next visit; "Reset checklist" clears them.
 * - The server HTML has every step, title, and text, all unticked, so it is
 *   fully readable without JavaScript (the checkboxes still tick natively).
 */
export function Checklist({ steps }: { steps: readonly ChecklistStep[] }) {
  const baseId = useId();
  const [ids] = useState(() => steps.map((step) => stepId(step.title)));
  const { done, toggle, reset } = useChecklist(ids);
  // What the live region says. Empty until the visitor changes something,
  // so restoring saved ticks on load is not announced.
  const [message, setMessage] = useState("");
  const count = done.size;
  const total = steps.length;
  const say = (next: number) => setMessage(`${next} of ${total} done`);

  return (
    <div className="co-res-check" data-all={count === total ? "" : undefined} data-some={count > 0 ? "" : undefined}>
      <Parallax aria-hidden="true" className="co-res-deco co-res-deco-a" max={80} speed={0.22} />

      <div className="co-res-prog">
        <svg aria-hidden="true" className="co-res-ring" height="64" viewBox="0 0 64 64" width="64">
          <circle className="co-res-ring-bg" cx="32" cy="32" r="26" />
          <circle
            className="co-res-ring-fg"
            cx="32"
            cy="32"
            r="26"
            style={{ strokeDasharray: RING, "--off": `${(RING * (1 - count / total)).toFixed(2)}` } as CSSProperties}
          />
        </svg>
        <p aria-hidden="true" className="co-res-count">
          <RollingNumber value={count} /> of {total} done
        </p>
        {/* One pip per step, lit when that step is ticked. */}
        <span aria-hidden="true" className="co-res-pips">
          {ids.map((id) => (
            <i data-on={done.has(id) ? "" : undefined} key={id} />
          ))}
        </span>
        <p className="co-res-sr" role="status">
          {message}
        </p>
        <button
          className="co-btn co-btn-g co-btn-s co-res-reset"
          disabled={count === 0}
          onClick={() => {
            reset();
            say(0);
          }}
          type="button"
        >
          Reset checklist
        </button>
      </div>

      <ol className="co-res-steps">
        {steps.map((step, index) => {
          const id = ids[index];
          const checkId = `${baseId}-${id}`;
          const titleId = `${checkId}-title`;
          const ticked = done.has(id);
          return (
            <Reveal as="li" index={Math.floor(index / 2) % 4} key={id} variant={variants[index % 2]}>
              <Spotlight className="co-res-step" data-done={ticked ? "" : undefined}>
                <span className="co-res-tickbox">
                  <input
                    aria-labelledby={titleId}
                    checked={ticked}
                    className="co-res-cb"
                    id={checkId}
                    onChange={() => {
                      toggle(id);
                      say(ticked ? count - 1 : count + 1);
                    }}
                    type="checkbox"
                  />
                  <span aria-hidden="true" className="co-res-box">
                    <svg fill="none" height="16" viewBox="0 0 16 16" width="16">
                      <path d="m3.5 8.4 3 3 6-6.6" pathLength={1} />
                    </svg>
                  </span>
                </span>
                <span aria-hidden="true" className="co-res-n">{String(index + 1).padStart(2, "0")}</span>
                <div className="co-res-step-text">
                  <h3 id={titleId}>
                    <label htmlFor={checkId}>
                      <span className="co-res-strike">{step.title}</span>
                    </label>
                  </h3>
                  <p>{step.body}</p>
                </div>
              </Spotlight>
            </Reveal>
          );
        })}
      </ol>
    </div>
  );
}
