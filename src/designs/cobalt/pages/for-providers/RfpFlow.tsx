"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { useReducedMotion } from "../../motion/media";
import { Spotlight } from "../../motion/pointer";
import {
  FLOW_END_SECONDS,
  flowProviders,
  flowStages,
  stageFill,
  stageIndexAt,
  statusAt,
  statusChangeTimes,
  statusStep,
  type FlowStage,
} from "./rfp-flow";
import type { FlowHighlight } from "./RfpStage";

// The 3D stage and its library download only in the browser, and only once
// the illustration is close to the screen (see `near` below).
const RfpStage = dynamic(() => import("./RfpStage").then((module) => module.RfpStage), { ssr: false });

/**
 * The replay clock. `startedAt` is `performance.now()` when the timeline
 * was (re)started, or null while it holds still at `elapsed` seconds.
 */
type Clock = { startedAt: number | null; elapsed: number };

/** The finished state: every provider has answered. */
const FINISHED: Clock = { startedAt: null, elapsed: Number.POSITIVE_INFINITY };
/** Ready to play: nothing sent yet. */
const READY: Clock = { startedAt: null, elapsed: 0 };

/** Seconds into the timeline right now. */
function secondsOf(clock: Clock) {
  return clock.startedAt === null ? clock.elapsed : (performance.now() - clock.startedAt) / 1000;
}

/** Small drawn icons for the buttons. */
function ReplayIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M4.4 1.9v2.8h2.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="16" viewBox="0 0 16 16" width="16">
      <rect height="10" rx="1.2" width="3.4" x="3.6" y="3" />
      <rect height="10" rx="1.2" width="3.4" x="9" y="3" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="16" viewBox="0 0 16 16" width="16">
      <path d="M5 3.2v9.6a.8.8 0 0 0 1.2.7l7.4-4.8a.8.8 0 0 0 0-1.4L6.2 2.5A.8.8 0 0 0 5 3.2Z" />
    </svg>
  );
}

/**
 * "One RFP out, five answers back": an illustration of what a provider
 * joins when a buyer shortlists it.
 *
 * Two views of the same sample timeline (./rfp-flow.ts):
 * - a 3D stage (./RfpStage.tsx), drawn on a canvas that screen readers skip;
 * - a text status list beside it, which is the accessible version and the
 *   only view on a device without WebGL.
 *
 * Controls (all real buttons, keyboard operable):
 * - a stepper of the four stages: click one to jump there (the 3D scene
 *   runs quickly to that moment); point at or focus one to light up the
 *   providers that have reached it. Its bars fill as the replay plays.
 * - Pause / Play: stops and resumes every movement, including the idle
 *   drift (so nothing moves for more than a few seconds without a way to
 *   stop it).
 * - Replay: plays the whole timeline again from "Not sent".
 * Pointing at a row in the list lights that provider up in the scene.
 *
 * It plays once when it scrolls into view. With reduced motion it shows
 * the finished state, offers no Play or Replay, and stage jumps are instant.
 */
export function RfpFlow() {
  const still = useReducedMotion();
  // The server (and a browser without script) shows the finished state, so
  // the list always says something useful.
  const [clock, setClock] = useState<Clock>(FINISHED);
  const [paused, setPaused] = useState(false);
  const [highlight, setHighlight] = useState<FlowHighlight>(null);
  const [near, setNear] = useState(false);
  const [noWebGl, setNoWebGl] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  // The newest motion setting, for observer callbacks set up earlier.
  const stillRef = useRef(still);
  // True once the visitor has used a control: the automatic first play
  // then never overrides their choice.
  const acted = useRef(false);

  /** Cancels every pending status update. */
  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  /**
   * Runs the timeline from `from` seconds. The 3D stage follows `startedAt`
   * frame by frame; the text list moves on at each status change, by one
   * timer per change still to come.
   */
  const runFrom = useCallback(
    (from: number) => {
      clearTimers();
      const startedAt = performance.now() - from * 1000;
      setClock({ startedAt, elapsed: from });
      timers.current = statusChangeTimes()
        .filter((seconds) => seconds > from)
        .map((seconds) => window.setTimeout(() => setClock({ startedAt, elapsed: seconds }), (seconds - from) * 1000));
    },
    [clearTimers],
  );

  /** Replay: everything moves again, from "Not sent". */
  const play = useCallback(() => {
    setPaused(false);
    runFrom(0);
  }, [runFrom]);

  /** Holds the timeline (and all idle movement) where it is. */
  const pause = useCallback(() => {
    acted.current = true;
    clearTimers();
    setPaused(true);
    setClock((current) => {
      const seconds = secondsOf(current);
      return { startedAt: null, elapsed: seconds >= FLOW_END_SECONDS ? Number.POSITIVE_INFINITY : seconds };
    });
  }, [clearTimers]);

  /** Moves again: from where the timeline stood, or just the idle drift. */
  const resume = useCallback(() => {
    acted.current = true;
    setPaused(false);
    if (clock.startedAt === null && clock.elapsed < FLOW_END_SECONDS) runFrom(clock.elapsed);
  }, [clock, runFrom]);

  /** Jumps to one stage and holds the timeline there. */
  const jump = useCallback(
    (stage: FlowStage) => {
      acted.current = true;
      clearTimers();
      setClock({ startedAt: null, elapsed: stage.at >= FLOW_END_SECONDS ? Number.POSITIVE_INFINITY : stage.at });
    },
    [clearTimers],
  );

  // Remember the motion setting. With reduced motion, stop any replay and
  // show the finished state.
  useEffect(() => {
    stillRef.current = still;
    if (!still) return;
    clearTimers();
    // A timer, because React asks effects not to set state directly.
    timers.current = [window.setTimeout(() => setClock(FINISHED), 0)];
  }, [still, clearTimers]);

  // Cancel pending timers when the page goes away.
  useEffect(() => clearTimers, [clearTimers]);

  // When the panel is near the screen, load the 3D stage and set the list
  // back to "Not sent", ready to play. Play once when most of the panel is
  // in view. Without IntersectionObserver (very old browsers) nothing loads
  // and the finished list stays.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof IntersectionObserver !== "function") return;
    const loader = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNear(true);
      if (!stillRef.current && !acted.current) setClock((current) => (current.startedAt === null && current.elapsed === FINISHED.elapsed ? READY : current));
      loader.disconnect();
    }, { rootMargin: "300px" });
    const starter = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (!stillRef.current && !acted.current) play();
      starter.disconnect();
    }, { threshold: 0.4 });
    loader.observe(panel);
    starter.observe(panel);
    return () => {
      loader.disconnect();
      starter.disconnect();
    };
  }, [play]);

  // The stepper's bars: set once for a still moment, or filled smoothly on
  // animation frames while the timeline runs (stopping at the end).
  useEffect(() => {
    const paint = (seconds: number) =>
      stageFill(seconds).forEach((fill, index) => barRefs.current[index]?.style.setProperty("--fill", fill.toFixed(3)));
    if (clock.startedAt === null || paused) {
      paint(clock.elapsed);
      return;
    }
    let frame = 0;
    const tick = () => {
      const seconds = secondsOf(clock);
      paint(seconds);
      if (seconds < FLOW_END_SECONDS) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [clock, paused]);

  const onUnsupported = useCallback(() => setNoWebGl(true), []);

  const statuses = flowProviders.map((provider) => statusAt(provider, clock.elapsed));
  const answered = statuses.filter((status) => status === "Answered").length;
  const current = stageIndexAt(clock.elapsed);
  // "Pause" while anything moves; "Play" while paused or held part way.
  const moving = !paused && (clock.startedAt !== null || clock.elapsed >= FLOW_END_SECONDS);

  /** Is list row `index` part of the highlight? */
  const rowLit = (index: number) => {
    if (!highlight) return undefined;
    if ("provider" in highlight) return highlight.provider === index ? "on" : "off";
    return statusStep(statuses[index]) >= statusStep(highlight.status) ? "on" : "off";
  };

  return (
    <div className="co-fp-flow">
      <div className="co-fp-flow-head">
        <h3>One RFP out. Answers back.</h3>
        <div className="co-fp-flow-tools">
          <span className="co-chip co-chip-n">Illustration</span>
          {still ? null : (
            <>
              <button className="co-btn co-btn-g co-btn-s co-fp-tool" onClick={moving ? pause : resume} type="button">
                {moving ? <PauseIcon /> : <PlayIcon />}
                {moving ? "Pause" : "Play"}
              </button>
              <button className="co-btn co-btn-g co-btn-s co-fp-tool co-fp-replay"
                onClick={() => {
                  acted.current = true;
                  play();
                }}
                type="button"
              >
                <ReplayIcon />
                Replay
              </button>
            </>
          )}
        </div>
      </div>

      <Spotlight className={noWebGl ? "co-fp-panel co-fp-panel-text" : "co-fp-panel"}>
        {/* A group of buttons, not a list, so the status list below stays
            the only list in the panel. */}
        <div aria-label="Jump to a stage" className="co-fp-steps" role="group">
          {flowStages.map((stage, index) => (
              <button
                aria-current={current === index ? "step" : undefined}
                className="co-fp-step"
                data-done={current >= index ? "" : undefined}
                key={stage.status}
                onBlur={() => setHighlight(null)}
                onClick={() => jump(stage)}
                onFocus={() => setHighlight({ status: stage.status })}
                onPointerEnter={() => setHighlight({ status: stage.status })}
                onPointerLeave={() => setHighlight(null)}
                type="button"
              >
                <span aria-hidden="true" className="co-fp-step-n">{index + 1}</span>
                <span className="co-fp-step-l">{stage.status}</span>
                <span
                  aria-hidden="true"
                  className="co-fp-step-bar"
                  ref={(element) => {
                    barRefs.current[index] = element;
                  }}
                />
              </button>
          ))}
        </div>

        <div className="co-fp-panel-body" ref={panelRef}>
          {/* The 3D view repeats the list beside it, so screen readers skip it. */}
          <div aria-hidden="true" className="co-fp-stage">
            {near && !noWebGl ? (
              <RfpStage
                elapsed={clock.elapsed}
                highlight={highlight}
                onUnsupported={onUnsupported}
                paused={paused}
                reduced={still}
                startedAt={clock.startedAt}
                statuses={statuses}
              />
            ) : null}
          </div>

          <div className="co-fp-status">
            <p className="co-fp-status-sum" role="status">
              {answered} of {flowProviders.length} shortlisted providers have answered
            </p>
            <ol className="co-fp-status-list" data-lit={highlight ? "" : undefined}>
              {flowProviders.map((provider, index) => {
                const status = statuses[index];
                const step = statusStep(status);
                return (
                  <li
                    data-lit={rowLit(index)}
                    data-step={step}
                    key={provider.id}
                    onPointerEnter={() => setHighlight({ provider: index })}
                    onPointerLeave={() => setHighlight(null)}
                  >
                    <span className="co-fp-status-name">Provider {provider.id}</span>
                    {/* key: the word slides in again each time it changes. */}
                    <span className="co-fp-status-word" key={status}>{status}</span>
                    {/* Four marks fill in as the provider moves through
                        Sent, Opened, Answering, and Answered. */}
                    <span aria-hidden="true" className="co-fp-marks">
                      {[1, 2, 3, 4].map((mark) => (
                        <i data-on={step >= mark ? "" : undefined} key={mark} style={{ "--m": mark } as CSSProperties} />
                      ))}
                    </span>
                  </li>
                );
              })}
            </ol>
            <dl className="co-fp-key">
              <div><dt>Sent</dt><dd>RFP emailed with a private link</dd></div>
              <div><dt>Opened</dt><dd>Link opened</dd></div>
              <div><dt>Answering</dt><dd>Answers saving as you go</dd></div>
              <div><dt>Answered</dt><dd>Form submitted, or email reply recorded</dd></div>
            </dl>
          </div>
        </div>
      </Spotlight>
    </div>
  );
}
