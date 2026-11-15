import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { MAX_WEIGHT, weightNames, type Weight } from "../../kit/weighted-fit";
import styles from "./device.module.css";

const STEP_PIXELS = 26;
const clamp = (value: number) => Math.min(MAX_WEIGHT, Math.max(0, Math.round(value))) as Weight;

/**
 * A rotary control with five detents. Drag up or right to raise it, tap to
 * step it, or use the arrow, Page, Home, and End keys. It is an ARIA slider.
 */
export function Knob({ label, value, onChange }: { label: string; value: Weight; onChange: (value: Weight) => void }) {
  const drag = useRef<{ x: number; y: number; start: Weight; moved: boolean } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: value, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const travel = state.y - event.clientY + (event.clientX - state.x);
    if (Math.abs(travel) > 4) state.moved = true;
    const next = clamp(state.start + travel / STEP_PIXELS);
    if (next !== value) onChange(next);
  };

  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    // A tap without travel steps the knob, wrapping from the top back to zero.
    if (state && !state.moved) onChange(((value + 1) % (MAX_WEIGHT + 1)) as Weight);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowUp: value + 1, ArrowRight: value + 1, ArrowDown: value - 1, ArrowLeft: value - 1,
      PageUp: value + 2, PageDown: value - 2, Home: 0, End: MAX_WEIGHT,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    onChange(clamp(keys[event.key]!));
  };

  return (
    <div className={styles.knobCell}>
      <div
        className={styles.knob}
        role="slider"
        tabIndex={0}
        aria-label={`${label} importance`}
        aria-valuemin={0}
        aria-valuemax={MAX_WEIGHT}
        aria-valuenow={value}
        aria-valuetext={weightNames[value]}
        style={{ "--turn": value / MAX_WEIGHT } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: MAX_WEIGHT + 1 }, (_, index) => (
          <span
            key={index}
            className={styles.tick}
            data-on={(value > 0 && index <= value) || undefined}
            style={{ "--at": index / MAX_WEIGHT } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        <span className={styles.cap} aria-hidden="true"><span className={styles.pointer} /></span>
      </div>
      <span className={styles.knobLabel} aria-hidden="true">{label}</span>
      <span className={styles.knobValue} aria-hidden="true">{weightNames[value].toLowerCase()}</span>
    </div>
  );
}
