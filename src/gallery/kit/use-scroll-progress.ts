"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Reports scroll progress through an element from 0 to 1 and sets --progress
 * on it. "pinned" measures a tall section with a sticky child: 0 when its top
 * meets the viewport top, 1 when its bottom meets the viewport bottom.
 * "anchor" measures how much of the element has passed a line at the given
 * fraction of the viewport height. It never re-renders React; the callback
 * runs at most once per animation frame.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  onProgress?: (progress: number) => void,
  { mode = "pinned", anchor = 0.6 }: { mode?: "pinned" | "anchor"; anchor?: number } = {},
) {
  const callback = useRef(onProgress);
  useEffect(() => {
    callback.current = onProgress;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const raw = mode === "anchor"
        ? (window.innerHeight * anchor - rect.top) / Math.max(1, rect.height)
        : rect.height - window.innerHeight <= 0
          ? (rect.top <= 0 ? 1 : 0)
          : -rect.top / (rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, raw));
      element.style.setProperty("--progress", progress.toFixed(4));
      callback.current?.(progress);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, mode, anchor]);
}
