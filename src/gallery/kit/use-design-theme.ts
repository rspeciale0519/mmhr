"use client";

import { useCallback, useSyncExternalStore } from "react";

export type DesignTheme = "light" | "dark";

const listeners = new Set<() => void>();
// Keeps a choice for this visit when browser storage is blocked.
const memory = new Map<string, DesignTheme>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): DesignTheme | null {
  const remembered = memory.get(key);
  if (remembered) return remembered;
  try {
    const saved = window.localStorage.getItem(key);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

/** Remembers each design's light or dark choice in this browser only. */
export function useDesignTheme(slug: string, fallback: DesignTheme) {
  const key = `mmhr-gallery-theme-${slug}`;
  const stored = useSyncExternalStore(subscribe, () => read(key), () => null);
  const theme = stored ?? fallback;

  const toggle = useCallback(() => {
    const next: DesignTheme = theme === "light" ? "dark" : "light";
    memory.set(key, next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // The in-memory choice still applies for this visit.
    }
    listeners.forEach((listener) => listener());
  }, [key, theme]);

  return { theme, toggle };
}
