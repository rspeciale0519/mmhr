"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", listener);
  return () => list.removeEventListener("change", listener);
}

/** True when the visitor asks for less motion. The server render assumes reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}
