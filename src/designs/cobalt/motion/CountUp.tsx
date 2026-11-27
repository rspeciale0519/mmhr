"use client";

import { useEffect, useRef } from "react";

import { motionAllowed } from "./media";

type CountUpProps = {
  /** The real number. It is what the server HTML shows. */
  value: number;
  /** Where the count starts. Default 0. */
  from?: number;
  /** Length of the count in milliseconds. Default 1200. */
  duration?: number;
  /** Digits after the decimal point. Default 0. */
  decimals?: number;
  /** Text before and after the number, for example "$" or " days". */
  prefix?: string;
  suffix?: string;
  className?: string;
};

/** Fixed locale, so the server and the browser write the number the same way. */
function format(value: number, decimals: number, prefix: string, suffix: string) {
  const number = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${prefix}${number}${suffix}`;
}

/** Starts fast and lands softly, like the rest of Cobalt motion. */
const easeOut = (t: number) => 1 - (1 - t) ** 4;

/**
 * A number that counts up to its value when it scrolls into view.
 *
 * - The server HTML (and every visitor without JavaScript, with reduced
 *   motion, or who already sees it when the page loads) gets the real value.
 *   Only a number that is still below the screen is reset to `from` and
 *   counted when it arrives, so a visible number never jumps backwards.
 * - No layout shift: an invisible copy of the final text (CSS ::after)
 *   reserves its width, and the digits are tabular (all the same width).
 * - Only the text changes; the count runs on animation frames and stops when
 *   done.
 */
export function CountUp({ value, from = 0, duration = 1200, decimals = 0, prefix = "", suffix = "", className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = format(value, decimals, prefix, suffix);

  useEffect(() => {
    const element = ref.current;
    // The text node React rendered. Changing its value (not replacing it)
    // keeps React's own reference valid.
    const text = element?.firstChild?.firstChild;
    if (!element || !(text instanceof Text)) return;
    if (!motionAllowed() || typeof IntersectionObserver === "undefined") return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    text.nodeValue = format(from, decimals, prefix, suffix);
    element.setAttribute("data-co-count", "wait");
    let frame = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        element.setAttribute("data-co-count", "run");
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          text.nodeValue = format(from + (value - from) * easeOut(t), decimals, prefix, suffix);
          if (t < 1) frame = requestAnimationFrame(tick);
          else element.setAttribute("data-co-count", "done");
        };
        frame = requestAnimationFrame(tick);
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      text.nodeValue = format(value, decimals, prefix, suffix);
      element.removeAttribute("data-co-count");
    };
  }, [value, from, duration, decimals, prefix, suffix]);

  return (
    <span ref={ref} className={className ? `co-count ${className}` : "co-count"} data-co-final={finalText}>
      <span className="co-count-n">{finalText}</span>
    </span>
  );
}
