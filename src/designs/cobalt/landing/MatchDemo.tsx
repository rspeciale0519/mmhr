"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Spotlight } from "../motion/pointer";
import {
  BOARD_ROWS,
  MAX_PICKS,
  defaultNeeds,
  defaultPicks,
  rankProviders,
  sampleNeeds,
  sampleProviders,
  type NeedId,
} from "./match-data";

// The 3D stage and its library download only in the browser, and only
// once the demo is close to the screen (see `near` below).
const MatchStage = dynamic(() => import("./MatchStage").then((module) => module.MatchStage), { ssr: false });

// The same "fast start, soft landing" curve the CSS uses (--co-ease).
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
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

/**
 * A score that counts up or down to its new value instead of jumping.
 * With less motion it just shows the new number.
 */
function Score({ value, still }: { value: number; still: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  // The number currently on screen, which may be mid-count.
  const shown = useRef(value);

  useLayoutEffect(() => {
    const element = ref.current;
    const from = shown.current;
    if (!element || from === value) return;
    if (still) {
      shown.current = value;
      element.textContent = String(value);
      return;
    }
    const started = performance.now();
    let frame = 0;
    // Flash the number mint when it rises and soft gray when it falls. The
    // last keyframe leaves out color, so it eases back to the CSS color.
    if (typeof element.animate === "function") {
      element.animate(
        [{ color: value > from ? "#12a273" : "#8a93b8", scale: value > from ? "1.12" : "0.94" }, { scale: "1" }],
        { duration: 900, easing: EASE },
      );
    }
    const step = (now: number) => {
      // `progress` goes 0 to 1 over 700ms; `eased` slows down at the end.
      const progress = Math.min(1, (now - started) / 700);
      const eased = 1 - (1 - progress) ** 3;
      shown.current = Math.round(from + (value - from) * eased);
      element.textContent = String(shown.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    // Show the old number right away so the new one never flashes first.
    element.textContent = String(from);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, still]);

  return <span className="co-sc" ref={ref}>{value}</span>;
}

/** A small drawn check mark for a need that is switched on. */
function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
      <path d="M2.5 6.4 5 8.8l4.5-5.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * The home page matching demo. The visitor switches sample needs on and
 * off; every sample provider is re-scored, the 3D field moves each one
 * closer to or further from the center, and the ranking board reorders.
 *
 * Feedback a visitor sees: rows slide to their new places (a row that
 * climbs flashes mint), scores count to their new value and flash, bars
 * glide and shine, and the 3D field pings. Pointing at a row lights its dot
 * in the field. The card itself has a cursor-following light (Spotlight).
 */
export function MatchDemo() {
  const [needs, setNeeds] = useState<readonly NeedId[]>(defaultNeeds);
  const [picks, setPicks] = useState<readonly string[]>(defaultPicks);
  // The board row the visitor points at or focuses; its 3D dot swells.
  const [hot, setHot] = useState<string | null>(null);
  // After the first switch, bars stop replaying their first-load growth
  // (home.css) and glide from their old length instead (see below).
  const [touched, setTouched] = useState(false);
  const still = useSyncExternalStore(watchMotion, wantsLessMotion, () => false);

  // Re-score only when the selected needs change.
  const ranked = useMemo(() => rankProviders(needs), [needs]);
  const rows = ranked.slice(0, BOARD_ROWS);
  const full = picks.length >= MAX_PICKS;

  // What the 3D stage draws: every provider, in a fixed order.
  const stageNodes = useMemo(
    () => sampleProviders.map((provider) => {
      const found = ranked.find((row) => row.id === provider.id);
      return {
        id: provider.id,
        score: found ? found.score : null,
        top: found ? found.rank < BOARD_ROWS : false,
        picked: picks.includes(provider.id),
        hot: hot === provider.id,
      };
    }),
    [ranked, picks, hot],
  );

  // Load the 3D stage only when the demo is near the screen.
  const stageRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = stageRef.current;
    if (!element || typeof IntersectionObserver !== "function") return;
    const watcher = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNear(true);
      watcher.disconnect();
    }, { rootMargin: "300px" });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  // Slide rows to their new places when the order changes. We remember
  // where each row was, let the browser lay out the new order, then play
  // each row from its old spot to its new one. A row that climbs flashes
  // mint; a row whose score changed gives its bar a quick shine.
  const rowElements = useRef(new Map<string, HTMLElement>());
  const lastTops = useRef<Map<string, number> | null>(null);
  const lastScores = useRef(new Map<string, number>());
  const order = rows.map((row) => `${row.id}:${row.score}`).join(",");
  useLayoutEffect(() => {
    const tops = new Map<string, number>();
    const scores = new Map(rows.map((row) => [row.id, row.score]));
    rowElements.current.forEach((element, id) => {
      const top = element.offsetTop;
      tops.set(id, top);
      // Skip on the first render, with less motion, or without support.
      if (!lastTops.current || still || typeof element.animate !== "function") return;
      const before = lastTops.current.get(id);
      if (before === undefined) {
        // New to the board: slide in from the right, fade and sharpen.
        element.animate(
          [{ opacity: 0, filter: "blur(6px)", transform: "translateX(28px)" }, { opacity: 1, filter: "blur(0)", transform: "none" }],
          { duration: 520, easing: EASE },
        );
      } else if (before !== top) {
        const climbed = before > top;
        element.animate(
          [{ transform: `translateY(${before - top}px) scale(${climbed ? 1.02 : 0.985})` }, { transform: "none" }],
          { duration: 720, easing: EASE },
        );
        if (climbed) {
          element.animate(
            [{ backgroundColor: "rgba(142, 240, 201, 0.32)" }, { backgroundColor: "rgba(142, 240, 201, 0)" }],
            { duration: 1100, easing: "ease-out" },
          );
        }
      }
      // The bar glides from its old length to the new one and shines.
      // (A moved row is a re-inserted element, so a CSS transition would
      // not run; the animation starts from the remembered score instead.)
      const bar = element.querySelector(".co-track i");
      const was = lastScores.current.get(id);
      if (bar && was !== undefined && was !== scores.get(id)) {
        bar.animate(
          [{ width: `${was}%`, filter: "brightness(1.45) saturate(1.3)" }, { width: `${scores.get(id)}%`, filter: "none" }],
          { duration: 760, easing: EASE },
        );
      }
    });
    lastTops.current = tops;
    lastScores.current = scores;
    // `rows` changes exactly when `order` does (ids and scores).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, still]);

  /**
   * Switches one need on or off. Picks belong to the ranking on screen, so
   * a picked provider that drops off the board is unpicked. Otherwise it
   * would still count toward the limit with no row left to unpick it.
   */
  function toggleNeed(id: NeedId) {
    const next = needs.includes(id) ? needs.filter((need) => need !== id) : [...needs, id];
    const onBoard = rankProviders(next).slice(0, BOARD_ROWS).map((row) => row.id);
    setNeeds(next);
    setTouched(true);
    setPicks((current) => current.filter((pick) => onBoard.includes(pick)));
  }

  /** Picks or unpicks a contender, up to the limit. */
  function togglePick(id: string) {
    setPicks((current) => {
      if (current.includes(id)) return current.filter((pick) => pick !== id);
      return current.length >= MAX_PICKS ? current : [...current, id];
    });
  }

  return (
    <Spotlight className="co-gl co-board co-demo" data-touched={touched ? "" : undefined}>
      <div className="co-bhead">
        <h3>Fit ranking for your needs list</h3>
        <div className="co-bchips">
          <span className="co-chip co-chip-n">Sample data</span>
          <span className="co-chip">{sampleProviders.length} providers scored</span>
        </div>
      </div>

      <div aria-label="Sample needs. Switch them on or off to re-rank." className="co-needs" role="group">
        {sampleNeeds.map((need) => {
          const on = needs.includes(need.id);
          return (
            <button
              aria-pressed={on}
              className="co-need"
              key={need.id}
              onClick={() => toggleNeed(need.id)}
              type="button"
            >
              <span className="co-need-box">{on ? <CheckIcon /> : null}</span>
              {need.label}
            </button>
          );
        })}
      </div>

      {/* The 3D view repeats what the board says, so screen readers skip it. */}
      <div aria-hidden="true" className="co-stage co-home-stage" ref={stageRef}>
        {near ? <MatchStage nodes={stageNodes} reduced={still} /> : null}
        <span className="co-stage-key">Closer to the center is a closer fit</span>
        <span className="co-home-stage-hint">Drag to turn</span>
      </div>

      {rows.length === 0 ? (
        <p className="co-demo-empty">Switch on at least one need to score the providers.</p>
      ) : (
        <ol className="co-rows">
          {rows.map((row, index) => {
            const picked = picks.includes(row.id);
            return (
              <li key={row.id}>
                <button
                  aria-disabled={!picked && full}
                  aria-pressed={picked}
                  className={picked ? "co-brow co-sel" : "co-brow"}
                  onBlur={() => setHot(null)}
                  onClick={() => togglePick(row.id)}
                  onFocus={() => setHot(row.id)}
                  onPointerEnter={() => setHot(row.id)}
                  onPointerLeave={() => setHot((current) => (current === row.id ? null : current))}
                  ref={(element) => {
                    if (element) rowElements.current.set(row.id, element);
                    else rowElements.current.delete(row.id);
                  }}
                  style={{ ["--i" as string]: index }}
                  type="button"
                >
                  <span className="co-n">
                    Provider {row.id}
                    <small>{picked ? "Picked" : "Name masked"}</small>
                  </span>
                  <span className="co-track" style={{ ["--v" as string]: `${row.score}%` }}>
                    <i />
                    <b>{row.note}</b>
                  </span>
                  <Score still={still} value={row.score} />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="co-bfoot">
        <span aria-live="polite" className="co-lbl">
          {picks.length} of {MAX_PICKS} contenders picked
          {full ? ". Unpick one to swap." : ""}
        </span>
        <span className="co-lbl">Picks named at the advisor review</span>
      </div>
    </Spotlight>
  );
}
