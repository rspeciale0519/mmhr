"use client";

import { useEffect, useState, type RefObject } from "react";

/** True once the element has scrolled into view. It stays true afterward. */
export function useInView(ref: RefObject<Element | null>, threshold = 0.35): boolean {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      // Without an observer, show the final state on the next frame.
      const frame = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen, threshold]);

  return seen;
}
