import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Remembers which steps of the buyer's checklist on /resources a visitor
 * has ticked, in this browser only (localStorage). Nothing is sent anywhere.
 *
 * Every storage call is wrapped in try/catch: private windows, blocked site
 * data, and full storage can all throw. Then the ticks live in memory for
 * this visit and the page works the same, it just forgets them on reload.
 */
export const CHECKLIST_KEY = "mmhr:resources:checklist:v1";

/** Fallback copy, used when storage cannot be read or written. */
let memory: string | null = null;
const listeners = new Set<() => void>();

/** The stored value as text ("" when nothing is stored). */
function read(): string {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(CHECKLIST_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Stores a new value and tells every subscriber. */
function write(value: string) {
  try {
    window.localStorage.setItem(CHECKLIST_KEY, value);
    memory = null;
  } catch {
    memory = value;
  }
  listeners.forEach((listener) => listener());
}

/** Follows changes from this page and from other tabs. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === CHECKLIST_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The ticked step ids in `raw`, keeping only ids that still exist. */
export function parseDone(raw: string, ids: readonly string[]): Set<string> {
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) return new Set(value.filter((id): id is string => typeof id === "string" && ids.includes(id)));
  } catch {
    // Nothing stored yet, or not ours: start empty.
  }
  return new Set();
}

/** For tests: forget the in-memory fallback. */
export function resetChecklistMemory() {
  memory = null;
}

/**
 * React hook: the set of ticked step ids, plus `toggle` and `reset`.
 *
 * The server, and the first render in the browser, see nothing ticked, so
 * the HTML always matches; React then shows the stored ticks.
 */
export function useChecklist(ids: readonly string[]) {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const done = useMemo(() => parseDone(raw, ids), [raw, ids]);
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(parseDone(read(), ids));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(JSON.stringify(ids.filter((item) => next.has(item))));
    },
    [ids],
  );
  const reset = useCallback(() => write("[]"), []);
  return { done, toggle, reset };
}
