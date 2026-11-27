"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { useFinePointer, useInView, useReducedMotion } from "@/designs/cobalt/motion";
import { perFrame } from "@/designs/cobalt/motion/frame";

import {
  FEE_STAGE,
  MAX_FEE_LEVEL,
  RAISED_PROVIDER,
  SCORING_STAGE,
  flowStages,
  moneyMoved,
  rankOnFit,
  sampleNeeds,
  sampleNeedsLabel,
  sampleProviders,
  sampleProvidersPayingMore,
  verdict,
} from "./money-flow";

/*
 * "Follow the money": an interactive diagram that answers "if it's free, how
 * does MMHR make money, and does that bias the ranking?".
 *
 * It is plain HTML, not a canvas: every stage is a real button with real
 * text, so screen readers, search engines and keyboard users get the whole
 * story. Lines between stages are decoration (aria-hidden) drawn with CSS.
 *
 * Layout (why-its-free.css): on wide screens stages 1 to 6 sit in a row and
 * stage 7, the referral fee, sits alone in a "money lane" underneath, joined
 * only to "You sign direct". On phones everything stacks in one column.
 *
 * What moves, and why (all of it is CSS driven by attributes set here):
 * - While the diagram is on screen (`data-live`), small particles run along
 *   the lines: bright on lines already passed, faint ahead. The money line
 *   only carries particles once the story reaches the referral fee.
 * - Hovering a stage (or selecting it) lights the lines in and out of it and
 *   shows its explanation below, sliding in. Other stages dim while you look.
 * - "Play the story" walks through the stages on a timer; a bar in the step
 *   rail fills while each step waits. Any manual step pauses it.
 * - With a mouse, the layers shift a few pixels with the cursor (depth) and
 *   a soft light follows it across the navy stage.
 * Reduced motion: no particles, light or depth; the story still plays, the
 * explanation swaps at once.
 */

// The same "fast start, soft landing" curve the CSS uses (--co-ease).
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Delay between one line lighting up and the next, when jumping ahead. */
const STAGGER_MS = 70;
/** How long "Play the story" stays on each step. Long enough to read it. */
export const STEP_MS = 3400;

/** Plays a small dot along one connecting line, in whichever way it runs. */
function travel(wire: HTMLElement | null | undefined, delay: number) {
  const dot = wire?.querySelector<HTMLElement>(".co-fm-dot");
  if (!wire || !dot || typeof dot.animate !== "function") return;
  // The same line runs across on wide screens and down on phones, so we ask
  // the browser which way it is drawn right now.
  const box = wire.getBoundingClientRect();
  const across = box.width > box.height;
  const keyframes = across
    ? [{ left: "0%", opacity: 1 }, { left: "100%", opacity: 1 }]
    : [{ top: "0%", opacity: 1 }, { top: "100%", opacity: 1 }];
  dot.animate(keyframes, { duration: 380, delay, easing: EASE });
}

/** A short glow around a box, to show "this just changed" without moving it. */
function pulse(element: HTMLElement | null | undefined, delay = 0) {
  const ring = element?.querySelector<HTMLElement>(".co-fm-ring");
  if (!ring || typeof ring.animate !== "function") return;
  ring.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay, easing: "ease-out" });
}

/** A small icon of a line with a gap in it: "not connected". */
function NoLineIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 22 22" width="22">
      {/* Two line ends, each closed off with a short bar, and a gap between them. */}
      <path d="M11 1.5v5M11 15.5v5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M6.5 7.5h9M6.5 14.5h9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

/** Play triangle, or two pause bars while playing. */
function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 14 14" width="14">
      {playing ? <path d="M3 2h3v10H3zM8 2h3v10H8z" /> : <path d="M3.5 1.8v10.4L12 7z" />}
    </svg>
  );
}

/** The small arrow that slides into a stage box on hover. */
function GoIcon() {
  return (
    <svg aria-hidden="true" className="co-fm-go" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

/** Three particles that run along a line while the diagram is on screen. */
const particles = (
  <span aria-hidden="true" className="co-wif-run">
    <span />
    <span />
    <span />
  </span>
);

export function FollowTheMoney() {
  // Which stage is selected (0 to 6), and the one before it. Knowing where
  // the visitor came from lets lines light up one after another on a jump.
  const [view, setView] = useState({ stage: 0, from: 0 });
  // The stage under the mouse, previewed without selecting it.
  const [peek, setPeek] = useState<number | null>(null);
  // "Play the story" is running.
  const [playing, setPlaying] = useState(false);
  // The "what if a provider paid more?" switch.
  const [paidMore, setPaidMore] = useState(false);
  // What the screen reader announces after each change. Empty at first, so
  // nothing is read out on page load.
  const [announcement, setAnnouncement] = useState("");
  const still = useReducedMotion();
  const fine = useFinePointer();

  const root = useRef<HTMLDivElement>(null);
  // On screen (with a little margin): particles run and the story can play.
  const inView = useInView(root, { rootMargin: "80px 0px" });

  const { stage, from } = view;
  const last = flowStages.length - 1;
  // The stage the explanation and the lit lines are about.
  const shown = peek ?? stage;
  const current = flowStages[shown]!;

  // The sample ranking. It is scored from the provider list that includes
  // the fees, so the switch really does hand scoring a bigger fee. The
  // scores come out the same because rankOnFit never reads fees.
  const providers = paidMore ? sampleProvidersPayingMore : sampleProviders;
  const ranked = useMemo(() => rankOnFit(sampleNeeds, providers), [providers]);
  const sentence = verdict(paidMore, ranked);

  const nodes = useRef<(HTMLButtonElement | null)[]>([]);
  const wires = useRef<(HTMLSpanElement | null)[]>([]);
  const table = useRef<HTMLTableSectionElement>(null);

  // Animate arrivals: a dot runs along the line into the new stage, then the
  // stage glows once. Only when moving forward, and never with less motion.
  const firstStage = useRef(true);
  useEffect(() => {
    if (firstStage.current) {
      firstStage.current = false;
      return;
    }
    if (still || stage <= from) return;
    const delay = (stage - 1 - from) * STAGGER_MS;
    travel(wires.current[stage - 1], delay);
    pulse(nodes.current[stage], delay + 300);
  }, [stage, from, still]);

  // When the switch flips, the money line to MMHR carries a dot, the scoring
  // box glows (its input is unchanged), and the table rows flash once to show
  // they were scored again and came out the same.
  const firstSwitch = useRef(true);
  useEffect(() => {
    if (firstSwitch.current) {
      firstSwitch.current = false;
      return;
    }
    if (still) return;
    if (paidMore) travel(wires.current[FEE_STAGE - 1], 0);
    pulse(nodes.current[SCORING_STAGE], 120);
    table.current?.querySelectorAll("tr").forEach((row, index) => {
      if (typeof row.animate !== "function") return;
      row.animate(
        [{ backgroundColor: "rgba(142, 240, 201, 0.16)" }, { backgroundColor: "rgba(142, 240, 201, 0)" }],
        { duration: 900, delay: index * 40, easing: "ease-out" },
      );
    });
  }, [paidMore, still]);

  /**
   * Selects a stage. `focus` moves keyboard focus to it (arrow keys).
   * Anything but the player's own timer pauses "Play the story".
   */
  function goTo(next: number, focus: boolean, byPlayer = false) {
    if (!byPlayer) setPlaying(false);
    const target = Math.max(0, Math.min(last, next));
    if (focus) nodes.current[target]?.focus();
    if (target === stage) return;
    const chosen = flowStages[target]!;
    setView({ stage: target, from: stage });
    setAnnouncement(
      `Step ${target + 1} of ${flowStages.length}: ${chosen.title}. ${chosen.body} Money moved so far: ${moneyMoved(target)}`,
    );
  }

  // The player: while playing and on screen, wait STEP_MS, then step on. It
  // stops by itself on the last stage. Off screen it holds its place and
  // carries on when the diagram is back (browsers without
  // IntersectionObserver never report "on screen", so they always play).
  useEffect(() => {
    if (!playing) return;
    if (!inView && typeof IntersectionObserver !== "undefined") return;
    const timer = window.setTimeout(() => {
      const next = view.stage + 1;
      goTo(next, false, true);
      if (next >= last) setPlaying(false);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
    // goTo is recreated every render; the stage in `view` is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, inView, view.stage]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      setAnnouncement(`Paused at step ${stage + 1} of ${flowStages.length}.`);
      return;
    }
    // From the end, play the story again from the start.
    if (stage === last) goTo(0, false, true);
    else setAnnouncement(`Playing from step ${stage + 1} of ${flowStages.length}.`);
    setPlaying(true);
  }

  /** Arrow keys, Home and End move between stages, like a tab list. */
  function onKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    const moves: Record<string, number> = {
      ArrowRight: stage + 1,
      ArrowDown: stage + 1,
      ArrowLeft: stage - 1,
      ArrowUp: stage - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    goTo(next, true);
  }

  function toggle() {
    const next = !paidMore;
    setPaidMore(next);
    setAnnouncement(verdict(next, rankOnFit(sampleNeeds, next ? sampleProvidersPayingMore : sampleProviders)));
  }

  // Depth: with a mouse, write the pointer position as CSS variables on the
  // stage, at most once per frame. CSS shifts each layer by a different
  // amount (why-its-free.css, "Depth") and moves a soft light to the cursor.
  useEffect(() => {
    const element = root.current;
    if (!element || still || !fine) return;
    const move = perFrame((event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
      element.style.setProperty("--fm-px", (x * 2 - 1).toFixed(3));
      element.style.setProperty("--fm-py", (y * 2 - 1).toFixed(3));
      element.style.setProperty("--fm-mx", `${(event.clientX - rect.left).toFixed(0)}px`);
      element.style.setProperty("--fm-my", `${(event.clientY - rect.top).toFixed(0)}px`);
      element.setAttribute("data-pointer", "");
    });
    const leave = () => {
      move.cancel();
      element.style.setProperty("--fm-px", "0");
      element.style.setProperty("--fm-py", "0");
      element.removeAttribute("data-pointer");
    };
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", leave);
    return () => {
      leave();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
    };
  }, [still, fine]);

  /** Preview a stage while the mouse is over it (touch taps select instead). */
  function onPeek(index: number | null) {
    return (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse") setPeek(index);
    };
  }

  /** One stage box. Only the selected one is in the Tab order (arrow keys reach the rest). */
  function node(index: number) {
    const item = flowStages[index]!;
    const state = index === stage ? "current" : index < stage ? "done" : "todo";
    return (
      <button
        aria-current={index === stage ? "step" : undefined}
        className="co-fm-node"
        data-near={Math.abs(index - shown) === 1 || undefined}
        data-shown={index === shown || undefined}
        data-state={state}
        onClick={() => goTo(index, false)}
        onPointerEnter={onPeek(index)}
        ref={(element) => {
          nodes.current[index] = element;
        }}
        tabIndex={index === stage ? 0 : -1}
        type="button"
      >
        <span aria-hidden="true" className="co-fm-ring" />
        <span aria-hidden="true" className="co-fm-beam" />
        <GoIcon />
        <span className="co-fm-num">{String(index + 1).padStart(2, "0")}</span>
        <span className="co-fm-title">{item.title}</span>
        <span className="co-fm-tag">{item.tag}</span>
      </button>
    );
  }

  /**
   * On phones the explanation sits right under the selected box, so it is
   * in view while stepping. Wide screens hide this copy with CSS and show
   * the explanation panel below the diagram instead (display: none keeps it
   * from being read twice).
   */
  function inline(index: number) {
    if (index !== stage) return null;
    return <p className="co-fm-inline">{flowStages[index]!.body}</p>;
  }

  const peeking = peek !== null && peek !== stage;

  return (
    <div
      className="co-stage co-fm"
      data-live={(inView && !still) || undefined}
      data-paid-more={paidMore || undefined}
      data-peek={peeking || undefined}
      data-playing={playing || undefined}
      data-shown={shown}
      ref={root}
    >
      {/* Depth layers: a dot grid and a light that follows the mouse. */}
      <span aria-hidden="true" className="co-fm-depth" />
      <span aria-hidden="true" className="co-fm-glow" />

      <div className="co-fm-bar">
        <p className="co-fm-count">
          Step <b>{stage + 1}</b> of {flowStages.length}
        </p>
        <p className="co-fm-money" data-moved={stage === FEE_STAGE || undefined}>
          Money moved so far: <b>{moneyMoved(stage)}</b>
        </p>
        <div className="co-fm-steps">
          <button className="co-fm-btn co-fm-play" data-on={playing || undefined} onClick={togglePlay} type="button">
            <PlayIcon playing={playing} />
            {playing ? "Pause the story" : "Play the story"}
          </button>
          {/* aria-disabled instead of disabled, so focus stays on the button at either end. */}
          <button aria-disabled={stage === 0} className="co-fm-btn" onClick={() => goTo(stage - 1, false)} type="button">
            Previous
          </button>
          <button aria-disabled={stage === last} className="co-fm-btn co-fm-btn-p" onClick={() => goTo(stage + 1, false)} type="button">
            Next step
            <GoIcon />
          </button>
        </div>
      </div>

      {/* The step rail: one segment per stage. While playing, the current
          segment fills over STEP_MS (restarted per step via `key`). */}
      <div aria-hidden="true" className="co-fm-rail">
        {flowStages.map((item, index) => (
          <span
            data-fill={index < stage || (index === stage && !playing) || undefined}
            data-money={index === FEE_STAGE || undefined}
            key={item.title}
          >
            {index === stage && playing ? <i key={`${stage}-${inView}`} style={{ animationDuration: `${STEP_MS}ms` }} /> : null}
          </span>
        ))}
      </div>

      <ol
        aria-describedby="co-fm-keys"
        aria-label="The seven stages, from your needs list to the referral fee"
        className="co-fm-flow"
        onKeyDown={onKeyDown}
        // Cleared when the mouse leaves the whole diagram, not each box, so
        // moving from box to box never flashes back to the selected stage.
        onPointerLeave={onPeek(null)}
      >
        {flowStages.map((item, index) => {
          if (index === FEE_STAGE) {
            // The money lane: the referral fee sits here on its own. The
            // note under the scoring column says out loud what the drawing
            // shows: no line runs from fees to scoring.
            return (
              <li className="co-fm-lane" data-moved={stage === FEE_STAGE || undefined} key={item.title}>
                {node(index)}
                {inline(index)}
                <p className="co-fm-lane-label">
                  <b>Money lane</b>
                  <span>Empty until you sign.</span>
                </p>
                <p className="co-fm-lane-gap" data-hot={shown === SCORING_STAGE || shown === FEE_STAGE || undefined}>
                  <NoLineIcon />
                  <span>No line from fees into scoring.</span>
                </p>
              </li>
            );
          }
          return (
            <li className="co-fm-li" key={item.title}>
              {node(index)}
              {inline(index)}
              <span
                aria-hidden="true"
                className="co-fm-wire"
                // The lines into and out of the stage being looked at glow.
                data-hot={index === shown || index === shown - 1 || undefined}
                data-lit={stage > index || undefined}
                data-money={index === FEE_STAGE - 1 || undefined}
                ref={(element) => {
                  wires.current[index] = element;
                }}
                // --d staggers the lines when the visitor jumps ahead.
                style={{ ["--d" as string]: stage > from ? Math.max(0, index - from) : 0 }}
              >
                <i />
                {particles}
                <b className="co-fm-dot" />
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" id="co-fm-keys">Use the arrow keys to move between stages.</p>

      <div className="co-fm-lower">
        <div className="co-fm-detail">
          {/* `key` remounts this block when the stage changes, which replays
              its slide-in (why-its-free.css, co-fm-swap). */}
          <div className="co-fm-current" data-money={shown === FEE_STAGE || undefined} key={shown}>
            <p className="co-fm-where">
              <span className="co-fm-where-n">{String(shown + 1).padStart(2, "0")}</span>
              {peeking ? <span className="co-fm-chip">Preview</span> : null}
            </p>
            <h3>{current.title}</h3>
            <p>{current.body}</p>
          </div>
          {/* The rule the diagram draws, in words. Shown at every step. */}
          <dl className="co-fm-ledger">
            <div>
              <dt>Scoring reads</dt>
              <dd>Your needs list, and how well each option fits it.</dd>
            </div>
            <div>
              <dt>Scoring never reads</dt>
              <dd>Referral fees, who pays them, or how much.</dd>
            </div>
          </dl>
        </div>

        <div className="co-fm-what">
          <div className="co-fm-what-head">
            <h3>What if a provider paid more?</h3>
            <span className="co-fm-chip">Sample data</span>
          </div>
          <table className="co-fm-table">
            <caption className="sr-only">
              Sample ranking for a needs list of {sampleNeedsLabel}. Fees are shown as relative bars, not amounts.
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Provider</th>
                <th scope="col">Fit</th>
                <th scope="col">Fee</th>
              </tr>
            </thead>
            <tbody ref={table}>
              {ranked.map((row) => {
                const level = providers.find((provider) => provider.id === row.id)?.feeLevel ?? 0;
                const raised = paidMore && row.id === RAISED_PROVIDER;
                return (
                  <tr data-raised={raised || undefined} key={row.id}>
                    <td className="co-fm-rank">{row.rank}</td>
                    <td>
                      Provider {row.id}
                      <small>Name masked</small>
                    </td>
                    <td className="co-fm-fit">{row.score}</td>
                    <td>
                      <span className="co-fm-fee" style={{ ["--v" as string]: level / MAX_FEE_LEVEL }}>
                        <i />
                      </span>
                      <span className="sr-only">
                        {level === MAX_FEE_LEVEL ? "Highest fee in the sample" : `Fee level ${level} of ${MAX_FEE_LEVEL}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button aria-pressed={paidMore} className="co-fm-switch" onClick={toggle} type="button">
            <span aria-hidden="true" className="co-fm-switch-track">
              <i />
            </span>
            Raise Provider {RAISED_PROVIDER}&apos;s fee to the highest
          </button>
          <p className="co-fm-verdict">{sentence}</p>
          <p className="co-fm-note">Fit scores use the sample needs list: {sampleNeedsLabel}. Fee bars are an illustration, not amounts.</p>
        </div>
      </div>

      {/* Read out politely after each change; screen readers do not interrupt. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
