"use client";

import { useCallback, useState } from "react";

import { vendors } from "./data";

export const MAX_CONTENDERS = 5;

export type ContenderState = { selected: string[]; message: string };

function label(id: string, revealed: boolean): string {
  const vendor = vendors.find((item) => item.id === id);
  if (!vendor) return "That option";
  return revealed ? vendor.name : vendor.masked;
}

/** Applies one choice. The PRD allows up to five initial contenders. */
export function toggleContender(state: ContenderState, id: string, revealed = false): ContenderState {
  const name = label(id, revealed);
  if (state.selected.includes(id)) {
    const selected = state.selected.filter((item) => item !== id);
    return { selected, message: `${name} removed. ${selected.length} of ${MAX_CONTENDERS} chosen.` };
  }
  if (state.selected.length >= MAX_CONTENDERS) {
    return { selected: state.selected, message: `You can choose up to ${MAX_CONTENDERS} contenders. Remove one to add ${name}.` };
  }
  const selected = [...state.selected, id];
  return { selected, message: `${name} added. ${selected.length} of ${MAX_CONTENDERS} chosen.` };
}

export function useScorecard(initial: string[] = ["a", "c"]) {
  const [state, setState] = useState<ContenderState>({ selected: initial, message: "" });
  const [revealed, setRevealed] = useState(false);
  const toggle = useCallback((id: string) => setState((current) => toggleContender(current, id, revealed)), [revealed]);
  return {
    selected: state.selected,
    message: state.message,
    count: state.selected.length,
    max: MAX_CONTENDERS,
    atLimit: state.selected.length >= MAX_CONTENDERS,
    isSelected: (id: string) => state.selected.includes(id),
    toggle,
    revealed,
    setRevealed,
  };
}

export type ScorecardState = ReturnType<typeof useScorecard>;
