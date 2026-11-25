"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

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
 */

// The same "fast start, soft landing" curve the CSS uses (--co-ease).
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Delay between one line lighting up and the next, when jumping ahead. */
const STAGGER_MS = 70;

/** Listens for the visitor changing their device's motion setting. */
function watchMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the device asks for less motion (or cannot tell us). */
function wantsLessMotion() {
  return typeof window.matchMedia !== "function" || window.matchMedia(MOTION_QUERY).matches;
}

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

export function FollowTheMoney() {
  // Which stage is selected (0 to 6), and the one before it. Knowing where
  // the visitor came from lets lines light up one after another on a jump.
  const [view, setView] = useState({ stage: 0, from: 0 });
  // The "what if a provider paid more?" switch.
  const [paidMore, setPaidMore] = useState(false);
  // What the screen reader announces after each change. Empty at first, so
  // nothing is read out on page load.
  const [announcement, setAnnouncement] = useState("");
  const still = useSyncExternalStore(watchMotion, wantsLessMotion, () => false);

  const { stage, from } = view;
  const current = flowStages[stage]!;
  const last = flowStages.length - 1;

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

  /** Selects a stage. `focus` moves keyboard focus to it (arrow keys). */
  function goTo(next: number, focus: boolean) {
    const target = Math.max(0, Math.min(last, next));
    if (focus) nodes.current[target]?.focus();
    if (target === stage) return;
    const chosen = flowStages[target]!;
    setView({ stage: target, from: stage });
    setAnnouncement(
      `Step ${target + 1} of ${flowStages.length}: ${chosen.title}. ${chosen.body} Money moved so far: ${moneyMoved(target)}`,
    );
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

  /** One stage box. Only the selected one is in the Tab order (arrow keys reach the rest). */
  function node(index: number) {
    const item = flowStages[index]!;
    const state = index === stage ? "current" : index < stage ? "done" : "todo";
    return (
      <button
        aria-current={index === stage ? "step" : undefined}
        className="co-fm-node"
        data-state={state}
        onClick={() => goTo(index, false)}
        ref={(element) => {
          nodes.current[index] = element;
        }}
        tabIndex={index === stage ? 0 : -1}
        type="button"
      >
        <span aria-hidden="true" className="co-fm-ring" />
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

  return (
    <div className="co-stage co-fm" data-paid-more={paidMore || undefined}>
      <div className="co-fm-bar">
        <p className="co-fm-count">
          Step <b>{stage + 1}</b> of {flowStages.length}
        </p>
        <p className="co-fm-money" data-moved={stage === FEE_STAGE || undefined}>
          Money moved so far: <b>{moneyMoved(stage)}</b>
        </p>
        <div className="co-fm-steps">
          {/* aria-disabled instead of disabled, so focus stays on the button at either end. */}
          <button aria-disabled={stage === 0} className="co-fm-btn" onClick={() => goTo(stage - 1, false)} type="button">
            Previous
          </button>
          <button aria-disabled={stage === last} className="co-fm-btn co-fm-btn-p" onClick={() => goTo(stage + 1, false)} type="button">
            Next step
          </button>
        </div>
      </div>

      <ol
        aria-describedby="co-fm-keys"
        aria-label="The seven stages, from your needs list to the referral fee"
        className="co-fm-flow"
        onKeyDown={onKeyDown}
      >
        {flowStages.map((item, index) => {
          if (index === FEE_STAGE) {
            // The money lane: the referral fee sits here on its own. The
            // note under the scoring column says out loud what the drawing
            // shows: no line runs from fees to scoring.
            return (
              <li className="co-fm-lane" key={item.title}>
                {node(index)}
                {inline(index)}
                <p className="co-fm-lane-label">
                  <b>Money lane</b>
                  <span>Empty until you sign.</span>
                </p>
                <p className="co-fm-lane-gap">
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
                data-lit={stage > index || undefined}
                data-money={index === FEE_STAGE - 1 || undefined}
                ref={(element) => {
                  wires.current[index] = element;
                }}
                // --d staggers the lines when the visitor jumps ahead.
                style={{ ["--d" as string]: stage > from ? Math.max(0, index - from) : 0 }}
              >
                <i />
                <b className="co-fm-dot" />
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" id="co-fm-keys">Use the arrow keys to move between stages.</p>

      <div className="co-fm-lower">
        <div className="co-fm-detail">
          <div className="co-fm-current">
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
                      <span className="co-fm-fee" style={{ ["--v" as string]: `${(level / MAX_FEE_LEVEL) * 100}%` }}>
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
