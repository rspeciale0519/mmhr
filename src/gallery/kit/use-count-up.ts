"use client";

import { useEffect, useState } from "react";

/** Counts from 0 to a target once `active` is true. Reduced motion shows the target at once. */
export function useCountUp(target: number, durationMs = 1600, delayMs = 0, active = true): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    let start = 0;
    const step = (time: number) => {
      if (!start) start = time + delayMs;
      const progress = Math.min(1, Math.max(0, (time - start) / durationMs));
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, delayMs, active]);

  return value;
}
