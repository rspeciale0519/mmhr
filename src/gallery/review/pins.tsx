// Client-only: rendered from ReviewDock, which is the "use client" boundary.
import { useEffect, useMemo, useRef, useState } from "react";

import type { FeedbackItem } from "./model";
import { partById } from "./parts";
import styles from "./review.module.css";

// Comment positions are stored as fractions of the commented section, or of
// the whole page when the comment has no section, so pins survive layout changes.
function position(item: FeedbackItem) {
  if (item.x === null || item.y === null) return null;
  if (item.part) {
    const element = document.querySelector<HTMLElement>(`[data-part="${CSS.escape(item.part)}"]`);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left + item.x * rect.width, top: rect.top + item.y * rect.height };
  }
  const root = document.documentElement;
  return { left: item.x * root.scrollWidth - window.scrollX, top: item.y * root.scrollHeight - window.scrollY };
}

/** A numbered marker at each place where an earlier comment was left. */
export function Pins({ items, visible }: { items: FeedbackItem[]; visible: boolean }) {
  const pinned = useMemo(() => items.filter((item) => item.kind === "comment" && item.x !== null), [items]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || pinned.length === 0) return;
    let frame = 0;
    const tick = () => {
      pinned.forEach((item, index) => {
        const element = refs.current[index];
        if (!element) return;
        const point = position(item);
        element.hidden = !point;
        if (point) element.style.transform = `translate(${point.left - 14}px, ${point.top - 14}px)`;
      });
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [visible, pinned]);

  if (!visible) return null;
  return (
    <>
      {pinned.map((item, index) => (
        <div
          key={item.id}
          ref={(element) => {
            refs.current[index] = element;
          }}
          data-review-ui
          className={styles.pin}
        >
          <button
            type="button"
            className={styles.pinButton}
            aria-expanded={open === item.id}
            aria-label={`Comment ${pinned.length - index} by ${item.reviewer}`}
            onClick={() => setOpen(open === item.id ? null : item.id)}
          >
            {pinned.length - index}
          </button>
          {open === item.id && (
            <div className={styles.pinCard}>
              <p className={styles.pinMeta}>
                {item.reviewer}
                {item.part ? ` on ${partById[item.part]?.label ?? item.part}` : ""}
              </p>
              <p className={styles.pinBody}>{item.body}</p>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
