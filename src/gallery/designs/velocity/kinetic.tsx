import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

import styles from "./kinetic.module.css";

/**
 * Writes the page's scroll speed to --vel on the given element, from -1 to 1,
 * easing back to 0 when scrolling stops. Type reads it to lean and stretch.
 */
export function useScrollVelocity(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = window.scrollY;
    let lastTime = performance.now();
    let velocity = 0;
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.max(1, now - lastTime);
      const raw = (window.scrollY - last) / dt;
      last = window.scrollY;
      lastTime = now;
      const target = Math.max(-1, Math.min(1, raw / 3));
      velocity += (target - velocity) * 0.18;
      element.style.setProperty("--vel", velocity.toFixed(3));
      frame = Math.abs(velocity) > 0.002 || raw !== 0 ? requestAnimationFrame(tick) : 0;
      if (!frame) element.style.setProperty("--vel", "0");
    };
    const onScroll = () => {
      if (!frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [ref]);
}

const rows = [
  { text: "Forty sales calls", tone: "struck", speed: 46, reverse: false },
  { text: "Endless demos", tone: "outline", speed: 38, reverse: true },
  { text: "One request", tone: "flare", speed: 30, reverse: false },
  { text: "Five real fits", tone: "cobalt", speed: 42, reverse: true },
] as const;

/** Four lines of moving type. Decorative; the heading below carries the message. */
export function Marquee() {
  return (
    <div className={styles.marquee} aria-hidden="true">
      {rows.map((row) => (
        <div key={row.text} className={styles.row} data-tone={row.tone}>
          <div
            className={styles.track}
            data-reverse={row.reverse || undefined}
            style={{ "--speed": `${row.speed}s` } as CSSProperties}
          >
            {[0, 1].map((copy) => (
              <span key={copy} className={styles.phrase}>
                {Array.from({ length: 3 }, (_, index) => (
                  <span key={index} className={styles.word}>{row.text}</span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Measures the horizontal track so vertical scroll distance equals its travel. */
export function usePinnedTrack(sectionRef: RefObject<HTMLElement | null>, trackRef: RefObject<HTMLElement | null>) {
  const travel = useRef(0);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const measure = () => {
      const viewport = track.parentElement?.clientWidth ?? window.innerWidth;
      travel.current = Math.max(0, track.scrollWidth - viewport);
      section.style.height = `${window.innerHeight + travel.current}px`;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      section.style.height = "";
    };
  }, [sectionRef, trackRef]);

  return (progress: number) => {
    const track = trackRef.current;
    if (track) track.style.transform = `translate3d(${(-progress * travel.current).toFixed(1)}px, 0, 0)`;
  };
}
