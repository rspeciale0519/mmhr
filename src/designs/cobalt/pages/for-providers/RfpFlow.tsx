"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { flowProviders, statusAt, statusChangeTimes, statusStep } from "./rfp-flow";

// The 3D stage and its library download only in the browser, and only once
// the illustration is close to the screen (see `near` below).
const RfpStage = dynamic(() => import("./RfpStage").then((module) => module.RfpStage), { ssr: false });

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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

/** The replay clock. `startedAt` is null while the picture holds still. */
type Clock = { startedAt: number | null; elapsed: number };

/** The finished state: every provider has answered. */
const FINISHED: Clock = { startedAt: null, elapsed: Number.POSITIVE_INFINITY };
/** Ready to play: nothing sent yet. */
const READY: Clock = { startedAt: null, elapsed: 0 };

/** A small drawn "replay" arrow for the button. */
function ReplayIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M4.4 1.9v2.8h2.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
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
 * It plays once when it scrolls into view, and again on "Replay". With
 * reduced motion it shows the finished state and offers no replay.
 */
export function RfpFlow() {
  const still = useSyncExternalStore(watchMotion, wantsLessMotion, () => false);
  // The server (and a browser without script) shows the finished state, so
  // the list always says something useful.
  const [clock, setClock] = useState<Clock>(FINISHED);
  const [near, setNear] = useState(false);
  const [noWebGl, setNoWebGl] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  // The newest motion setting, for observer callbacks set up earlier.
  const stillRef = useRef(still);

  /** Cancels every pending status update. */
  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  /**
   * Starts the replay from zero. The 3D stage follows `startedAt` frame by
   * frame; the text list moves on at each status change, by one timer per
   * change.
   */
  const play = useCallback(() => {
    clearTimers();
    const startedAt = performance.now();
    setClock({ startedAt, elapsed: 0 });
    timers.current = statusChangeTimes().map((seconds) =>
      window.setTimeout(() => setClock({ startedAt, elapsed: seconds }), seconds * 1000),
    );
  }, [clearTimers]);

  // Remember the motion setting. With reduced motion, stop any replay (the
  // finished state is shown below).
  useEffect(() => {
    stillRef.current = still;
    if (!still) return;
    clearTimers();
    // Also end a replay cut short, so the list is finished if motion is
    // switched back on later. (A timer, because React asks effects not to
    // set state directly.)
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
      if (!stillRef.current) setClock((current) => (current.startedAt === null ? READY : current));
      loader.disconnect();
    }, { rootMargin: "300px" });
    const starter = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (!stillRef.current) play();
      starter.disconnect();
    }, { threshold: 0.4 });
    loader.observe(panel);
    starter.observe(panel);
    return () => {
      loader.disconnect();
      starter.disconnect();
    };
  }, [play]);

  const onUnsupported = useCallback(() => setNoWebGl(true), []);

  // With reduced motion the finished state always shows.
  const shown = still ? FINISHED : clock;
  const statuses = flowProviders.map((provider) => statusAt(provider, shown.elapsed));
  const answered = statuses.filter((status) => status === "Answered").length;

  return (
    <div className="co-fp-flow">
      <div className="co-fp-flow-head">
        <h3>One RFP out. Answers back.</h3>
        <div className="co-fp-flow-tools">
          <span className="co-chip co-chip-n">Illustration</span>
          {still ? null : (
            <button className="co-btn co-btn-g co-btn-s" onClick={play} type="button">
              <ReplayIcon />
              Replay
            </button>
          )}
        </div>
      </div>

      <div className={noWebGl ? "co-fp-panel co-fp-panel-text" : "co-fp-panel"} ref={panelRef}>
        {/* The 3D view repeats the list beside it, so screen readers skip it. */}
        <div aria-hidden="true" className="co-fp-stage">
          {near && !noWebGl ? (
            <RfpStage
              elapsed={shown.elapsed}
              onUnsupported={onUnsupported}
              reduced={still}
              startedAt={shown.startedAt}
              statuses={statuses}
            />
          ) : null}
        </div>

        <div className="co-fp-status">
          <p className="co-fp-status-sum" role="status">
            {answered} of {flowProviders.length} shortlisted providers have answered
          </p>
          <ol className="co-fp-status-list">
            {flowProviders.map((provider, index) => {
              const status = statuses[index];
              const step = statusStep(status);
              return (
                <li data-step={step} key={provider.id}>
                  <span className="co-fp-status-name">Provider {provider.id}</span>
                  <span className="co-fp-status-word">{status}</span>
                  {/* Four marks fill in as the provider moves through
                      Sent, Opened, Answering, and Answered. */}
                  <span aria-hidden="true" className="co-fp-marks">
                    {[1, 2, 3, 4].map((mark) => (
                      <i data-on={step >= mark ? "" : undefined} key={mark} />
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
    </div>
  );
}
