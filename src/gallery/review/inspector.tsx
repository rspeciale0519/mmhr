// Client-only: rendered from ReviewDock, which is the "use client" boundary.
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { partById } from "./parts";
import styles from "./review.module.css";

export type InspectTarget = { element: HTMLElement | null; part: string | null; clientX: number; clientY: number };

const isReviewUi = (node: EventTarget | null) => node instanceof Element && Boolean(node.closest("[data-review-ui]"));

const tones = { comment: "oklch(58% 0.2 262)", pick: "oklch(60% 0.22 8)" } as const;

/**
 * While active, outlines the tagged section under the pointer and captures
 * clicks so the design does not react. Calls onPick with the section and the
 * click position.
 */
export function Inspector({
  active,
  mode,
  picked,
  onPick,
}: {
  active: boolean;
  mode: "comment" | "pick";
  picked: (part: string) => boolean;
  onPick: (target: InspectTarget) => void;
}) {
  const [hover, setHover] = useState<{ element: HTMLElement; part: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    if (!active) return;
    const find = (target: EventTarget | null) => {
      if (!(target instanceof Element) || isReviewUi(target)) return null;
      const element = target.closest<HTMLElement>("[data-part]");
      return { element, part: element?.dataset.part ?? null };
    };
    const move = (event: PointerEvent) => {
      const hit = find(event.target);
      setHover(hit?.element && hit.part ? { element: hit.element, part: hit.part } : null);
    };
    // Capture every press, so links, buttons, and drag handles in the design stay still.
    const block = (event: Event) => {
      if (isReviewUi(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const click = (event: MouseEvent) => {
      if (isReviewUi(event.target)) return;
      block(event);
      const hit = find(event.target);
      if (mode === "pick" && !hit?.part) return;
      onPickRef.current({ element: hit?.element ?? null, part: hit?.part ?? null, clientX: event.clientX, clientY: event.clientY });
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerdown", block, true);
    window.addEventListener("click", click, true);
    document.documentElement.dataset.reviewMode = mode;
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerdown", block, true);
      window.removeEventListener("click", click, true);
      delete document.documentElement.dataset.reviewMode;
      setHover(null);
    };
  }, [active, mode]);

  // Keep the outline on the section while the page scrolls or animates.
  useEffect(() => {
    if (!active || !hover) return;
    let frame = 0;
    const tick = () => {
      const rect = hover.element.getBoundingClientRect();
      const box = boxRef.current;
      if (box) {
        const top = Math.max(rect.top, 0);
        box.style.transform = `translate(${rect.left}px, ${top}px)`;
        box.style.inlineSize = `${rect.width}px`;
        box.style.blockSize = `${Math.max(Math.min(rect.bottom, window.innerHeight) - top, 0)}px`;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, hover]);

  if (!active || !hover) return null;
  const isPicked = picked(hover.part);
  const label = partById[hover.part]?.label ?? hover.part;
  const action = mode === "comment" ? "Click to comment" : isPicked ? "Click to remove from picks" : "Click to add to picks";

  return (
    <div ref={boxRef} data-review-ui aria-hidden="true" className={styles.outline} style={{ "--tone": tones[mode] } as CSSProperties}>
      <span className={styles.outlineLabel}>
        {isPicked ? "♥ " : ""}
        {label}. {action}
      </span>
    </div>
  );
}
