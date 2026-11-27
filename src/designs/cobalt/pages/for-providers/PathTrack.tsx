"use client";

import { useRef, type ReactNode } from "react";

import { useScrollProgress } from "../../motion/scroll";

/**
 * The list of six steps on /for-providers ("From listing to signed
 * contract"). It reports how far the page has scrolled through it as
 * `--co-progress` (0 to 1), and for-providers.css uses that to draw each
 * step's top line in turn, so the path fills in as the visitor reads down.
 *
 * Without JavaScript `--co-progress` is unset and every line is drawn in
 * full; with reduced motion the CSS ignores it and draws them all too.
 */
export function PathTrack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  useScrollProgress(ref);
  return (
    <ol className="co-fp-path" ref={ref}>
      {children}
    </ol>
  );
}
