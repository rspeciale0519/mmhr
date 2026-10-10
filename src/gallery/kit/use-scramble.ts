"use client";

import { useEffect, useState } from "react";

const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&";

/**
 * Shows text that decodes from random glyphs into its final value, left to
 * right, whenever the text changes. Reduced motion shows the final text at once.
 */
export function useScramble(text: string, durationMs = 700): string {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setShown(text));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    let start = 0;
    const step = (time: number) => {
      if (!start) start = time;
      const progress = Math.min(1, (time - start) / durationMs);
      const settled = Math.floor(progress * text.length);
      let next = text.slice(0, settled);
      for (let index = settled; index < text.length; index += 1) {
        next += text[index] === " " ? " " : glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // Background tabs pause animation frames; the final text still arrives.
    const settle = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      setShown(text);
    }, durationMs + 150);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [text, durationMs]);

  return shown;
}
