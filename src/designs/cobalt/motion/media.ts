"use client";

import { useSyncExternalStore } from "react";

/** The visitor asked their device for less motion. */
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** A mouse or trackpad: hover exists and the pointer is precise. Touch screens fail this. */
export const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/**
 * True when the media query matches right now. Safe to call anywhere: on the
 * server, or in a browser (or test) without matchMedia, it answers false.
 */
export function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Every motion effect checks this before it hides or moves anything. */
export function motionAllowed(): boolean {
  return !matches(REDUCED_MOTION);
}

/**
 * React hook: whether a media query matches, kept up to date when it changes.
 *
 * The server (and the first client render during hydration) uses
 * `serverValue`, so the HTML always matches; React then re-renders with the
 * real answer. No hydration warning, no effect needed.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      // Some test stubs return a plain { matches } object without listeners.
      list.addEventListener?.("change", onChange);
      return () => list.removeEventListener?.("change", onChange);
    },
    () => matches(query),
    () => serverValue,
  );
}

/** True when the visitor asked for less motion. Use it to skip a JS animation loop. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION);
}

/** True on devices with a mouse or trackpad. Use it to skip hover-only effects on touch. */
export function useFinePointer(): boolean {
  return useMediaQuery(FINE_POINTER);
}
