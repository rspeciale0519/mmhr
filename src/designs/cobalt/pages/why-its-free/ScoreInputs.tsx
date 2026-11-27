"use client";

import { useMemo, useRef, useState } from "react";

import { Spotlight, useInView, useReducedMotion } from "@/designs/cobalt/motion";

import { rankOnFit, sampleNeeds, sampleProviders } from "./money-flow";

/*
 * "Try an input": a small hands-on panel under "Why the fee cannot change
 * your ranking". The visitor tries to feed scoring an input:
 *
 * - "Your needs list" goes in: its line flows, scoring glows, the sample
 *   ranking is scored again and comes out the same.
 * - "Referral fee" and "Who pays, and how much" bounce off a lock in front
 *   of scoring. The ranking rows stay exactly where they are; their locks
 *   pulse to show it, and a counter keeps "Ranking moved: 0".
 *
 * Every sentence it shows is copy that already appears on the page (the
 * three ranking reasons in Body.tsx). The ranking is the page's sample data
 * (money-flow.ts): masked, made-up providers, labelled "Illustration". No
 * fee amount appears anywhere.
 *
 * Accessibility: the inputs are real buttons; the result sentence is a
 * polite live region. Reduced motion: the same states, no travel.
 */

type InputId = "needs" | "fee" | "payer";

type ScoreInput = {
  readonly id: InputId;
  readonly label: string;
  /** Whether scoring takes it. Only the needs list does. */
  readonly accepted: boolean;
  /** Shown (and announced) after a try. Existing copy from Body.tsx. */
  readonly message: string;
};

export const scoreInputs: readonly ScoreInput[] = [
  {
    id: "needs",
    label: "Your needs list",
    accepted: true,
    message: "Scoring has one input: your needs list.",
  },
  {
    id: "fee",
    label: "Referral fee",
    accepted: false,
    message: "The referral fee is not part of the calculation at any point, so there is nothing for it to push.",
  },
  {
    id: "payer",
    label: "Who pays, and how much",
    accepted: false,
    message: "Who pays MMHR, and how much, never changes your results.",
  },
];

/** Plays a Web Animation if the browser has the API (tests and old browsers skip). */
function play(element: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  if (element && typeof element.animate === "function") element.animate(keyframes, options);
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** A drawn padlock. */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="7" rx="1.6" stroke="currentColor" strokeWidth="1.5" width="10" x="3" y="7" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

/** One small drawn icon per input. */
function InputIcon({ id }: { id: InputId }) {
  const paths: Record<InputId, string> = {
    // A list with check marks.
    needs: "M3 4.5l1.2 1.2L6.5 3.5M3 10.5l1.2 1.2 2.3-2.2M9 5h5M9 11h5",
    // A coin.
    fee: "M9 2.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM9 5.5v7M11 7H8.2a1.2 1.2 0 0 0 0 2.4h1.6a1.2 1.2 0 0 1 0 2.4H7",
    // Two people.
    payer: "M6 8a2.3 2.3 0 1 0 0-4.6A2.3 2.3 0 0 0 6 8ZM1.8 14.5a4.2 4.2 0 0 1 8.4 0M12 8a2 2 0 1 0 0-4M13.2 10.5a3.6 3.6 0 0 1 2.9 4",
  };
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
      <path d={paths[id]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function ScoreInputs() {
  const still = useReducedMotion();
  // The last input tried, and how many tries of a fee input were blocked.
  const [tried, setTried] = useState<InputId | null>(null);
  const [blocked, setBlocked] = useState(0);
  // Bumped on every try, so the result sentence replays its entrance.
  const [tries, setTries] = useState(0);

  // The sample ranking. It never changes: nothing a visitor can try here is
  // an input to rankOnFit.
  const ranked = useMemo(() => rankOnFit(sampleNeeds, sampleProviders), []);

  const panel = useRef<HTMLDivElement>(null);
  // Particles on the lines run only while the panel is on screen.
  const inView = useInView(panel);
  const message = scoreInputs.find((input) => input.id === tried)?.message ?? "";

  function attempt(input: ScoreInput, button: HTMLButtonElement) {
    setTried(input.id);
    setTries((count) => count + 1);
    if (!input.accepted) setBlocked((count) => count + 1);
    if (still) return;

    const root = panel.current;
    const token = button.querySelector(".co-si-token");
    const rows = root?.querySelectorAll(".co-si-rank li") ?? [];
    const core = root?.querySelector(".co-si-core");

    if (input.accepted) {
      // In it goes: the token leans toward scoring, scoring glows, and the
      // ranking ripples (scored again, same order).
      play(token, [{ translate: "0 0" }, { translate: "10px 0" }, { translate: "0 0" }], { duration: 520, easing: EASE });
      play(core, [{ scale: 1 }, { scale: 1.045 }, { scale: 1 }], { duration: 560, delay: 160, easing: EASE });
      rows.forEach((row, index) =>
        play(row, [{ backgroundColor: "rgba(142, 240, 201, 0.32)" }, { backgroundColor: "rgba(142, 240, 201, 0)" }], {
          duration: 900,
          delay: 260 + index * 60,
          easing: "ease-out",
        }),
      );
      return;
    }

    // Blocked: the token runs at the lock and bounces back with a shake, the
    // lock on scoring wiggles, and each ranking row's lock pulses in place.
    play(
      token,
      [
        { translate: "0 0" },
        { translate: "22px 0", offset: 0.35 },
        { translate: "-7px 0", offset: 0.55 },
        { translate: "4px 0", offset: 0.75 },
        { translate: "0 0" },
      ],
      { duration: 640, easing: "ease-out" },
    );
    play(core?.querySelector(".co-si-lock"), [{ rotate: "0deg" }, { rotate: "-14deg" }, { rotate: "12deg" }, { rotate: "0deg" }], {
      duration: 460,
      delay: 180,
      easing: "ease-in-out",
    });
    rows.forEach((row, index) => {
      play(row.querySelector("svg"), [{ scale: 1 }, { scale: 1.5 }, { scale: 1 }], { duration: 520, delay: 240 + index * 70, easing: EASE });
      play(row, [{ backgroundColor: "rgba(91, 116, 255, 0.14)" }, { backgroundColor: "rgba(91, 116, 255, 0)" }], {
        duration: 800,
        delay: 240 + index * 70,
        easing: "ease-out",
      });
    });
  }

  return (
    <Spotlight className="co-gl co-si" data-tried={tried ?? undefined}>
      <div className="co-si-head">
        <p className="co-si-hint">Try an input</p>
        <span className="co-si-chip">Illustration</span>
      </div>

      <div className="co-si-grid" data-live={(inView && !still) || undefined} ref={panel}>
        <ul aria-label="Inputs to try" className="co-si-inputs">
          {scoreInputs.map((input) => (
            <li data-accepted={input.accepted || undefined} data-tried={tried === input.id || undefined} key={input.id}>
              <button className="co-si-in" onClick={(event) => attempt(input, event.currentTarget)} type="button">
                <span className="co-si-token">
                  <span className="co-si-ico">
                    <InputIcon id={input.id} />
                  </span>
                  <span className="co-si-label">{input.label}</span>
                </span>
                <small>{input.accepted ? "Input" : "Not an input"}</small>
              </button>
              {/* The line from this input toward scoring. Blocked lines stop at a bar. */}
              <span aria-hidden="true" className="co-si-wire">
                <span className="co-wif-run">
                  <span />
                  <span />
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="co-si-core">
          <LockIcon className="co-si-lock" />
          <b>Scoring</b>
          <small>Reads your needs list only</small>
          <span aria-hidden="true" className="co-si-out">
            <span className="co-wif-run">
              <span />
              <span />
            </span>
          </span>
        </div>

        <ol aria-label="Sample ranking" className="co-si-rank">
          {ranked.map((row) => (
            <li key={row.id}>
              <b>{row.rank}</b>
              <span>
                Provider {row.id}
                <small>Name masked</small>
              </span>
              <LockIcon />
            </li>
          ))}
        </ol>
      </div>

      <div className="co-si-foot">
        {/* `key` replays the sentence's entrance on every try. */}
        <p aria-live="polite" className="co-si-msg" data-ok={tried === "needs" || undefined}>
          <span key={tries}>{message}</span>
        </p>
        <p className="co-si-count">
          Blocked tries: <b>{blocked}</b>
          <span aria-hidden="true">·</span>
          Ranking moved: <b>0</b>
        </p>
      </div>
    </Spotlight>
  );
}
