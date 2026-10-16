"use client";

import { useSyncExternalStore } from "react";

// Browser-side review state. The server holds the real records. Browser storage
// only remembers who this reviewer is and which pieces they picked, so the
// final-design builder can fill in their choices. Storage can be blocked, so
// every access is guarded and the tools still work without it.

const NAME_KEY = "mmhr-gallery:name";
const PICKS_KEY = "mmhr-gallery:picks";

/** `${design}:${part}` -> the saved pick id. */
export type Picks = Readonly<Record<string, string>>;

const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the record is still saved on the server.
  }
  cache.set(key, value);
  listeners.forEach((listener) => listener());
}

function cached<T>(key: string, fallback: T): T {
  if (!cache.has(key)) cache.set(key, read(key, fallback));
  return cache.get(key) as T;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => {
    cache.clear();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const NO_PICKS: Picks = {};

export const getReviewerName = () => cached<string>(NAME_KEY, "");
export const setReviewerName = (name: string) => write(NAME_KEY, name.trim());
export const useReviewerName = () => useSyncExternalStore(subscribe, getReviewerName, () => "");

export const getPicks = () => cached<Picks>(PICKS_KEY, NO_PICKS);
export const usePicks = () => useSyncExternalStore(subscribe, getPicks, () => NO_PICKS);
export const pickKey = (design: string, part: string) => `${design}:${part}`;

export function rememberPick(design: string, part: string, id: string | null) {
  const next: Record<string, string> = { ...getPicks() };
  if (id) next[pickKey(design, part)] = id;
  else delete next[pickKey(design, part)];
  write(PICKS_KEY, next);
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function reviewApi<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
    if (response.status === 204) return { ok: true, data: undefined as T };
    const json = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return { ok: false, error: json.error ?? `The request failed (${response.status}).` };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "No connection. Check your internet and try again." };
  }
}
