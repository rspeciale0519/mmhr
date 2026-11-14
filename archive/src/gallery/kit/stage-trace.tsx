import clsx from "clsx";
import { useEffect, useRef, type CSSProperties } from "react";

import { currentStageIndex, stages } from "./data";
import base from "./kit.module.css";

export type StageTraceUi = Partial<Record<"root" | "item" | "marker" | "label" | "state", string>>;

/** The case stages as an ordered list. Each item carries data-state for styling. */
export function StageTrace({ ui, current = currentStageIndex }: { ui: StageTraceUi; current?: number }) {
  const listRef = useRef<HTMLOListElement>(null);

  // On narrow screens the line scrolls; keep the current stage in view.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>("[aria-current='step']");
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = item.offsetLeft - list.clientWidth / 2 + item.offsetWidth / 2;
  }, [current]);

  return (
    <ol
      ref={listRef}
      className={clsx(base.trace, ui.root)}
      aria-label="Case progress"
      style={{ "--progress": current / (stages.length - 1) } as CSSProperties}
    >
      {stages.map((stage, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={stage} className={ui.item} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className={ui.marker} aria-hidden="true" />
            <span className={ui.label}>{stage}</span>
            <span className={base.srOnly}>
              {state === "done" ? ", complete" : state === "current" ? ", current stage" : ", not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
