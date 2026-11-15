import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { criteria, vendors, type Score } from "../../kit/data";
import styles from "./ring.module.css";

const STEP = 360 / vendors.length;
const wrap = (index: number) => ((index % vendors.length) + vendors.length) % vendors.length;

type Props = {
  selected: readonly string[];
  onToggle: (id: string) => void;
  nameOf: (id: string) => string;
  count: number;
  max: number;
};

/** The two strongest verified scores, as short reasons to look closer. */
function strengths(id: string) {
  return criteria
    .map((criterion) => ({ label: criterion.label, score: criterion.scores[id] ?? null }))
    .filter((item): item is { label: string; score: Exclude<Score, null> } => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

/**
 * Six vendor cards stand in a ring. Drag or swipe to turn it, use the arrow
 * keys or the buttons, or tap a card at the side. The front card can flip to
 * show its evidence and can be chosen as a contender.
 */
export function HaloRing({ selected, onToggle, nameOf, count, max }: Props) {
  const ringRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const [front, setFront] = useState(0);
  const [flipped, setFlipped] = useState<string | null>(null);

  const apply = useCallback((value: number, settle: boolean) => {
    angle.current = value;
    const ring = ringRef.current;
    if (!ring) return;
    ring.dataset.settling = settle ? "true" : "false";
    ring.style.setProperty("--turn", `${value}deg`);
  }, []);

  const goTo = useCallback((index: number) => {
    // Turn the short way round to the requested card.
    const current = -angle.current / STEP;
    const delta = ((index - current) % vendors.length + vendors.length * 1.5) % vendors.length - vendors.length / 2;
    const target = Math.round(current + delta);
    apply(-target * STEP, true);
    setFront(wrap(target));
    setFlipped(null);
  }, [apply]);

  useEffect(() => apply(0, false), [apply]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: angle.current, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    if (Math.abs(dx) > 4) state.moved = true;
    apply(state.start + dx * 0.32, false);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (!state.moved) {
      // A tap on a side card brings it to the front.
      const card = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-card]");
      if (card) goTo(Number(card.dataset.card));
      return;
    }
    goTo(Math.round(-angle.current / STEP));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") goTo(front + 1);
    else if (event.key === "ArrowLeft") goTo(front - 1);
    else return;
    event.preventDefault();
  };

  const frontVendor = vendors[front]!;

  return (
    <div className={styles.wrap}>
      <div
        className={styles.stage}
        role="region"
        aria-roledescription="carousel"
        aria-label="Sample vendors. Use the left and right arrow keys to turn."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; goTo(Math.round(-angle.current / STEP)); }}
      >
        <span className={styles.floor} aria-hidden="true" />
        <div ref={ringRef} className={styles.ring}>
          {vendors.map((vendor, index) => {
            const isFront = index === front;
            const chosen = selected.includes(vendor.id);
            const isFlipped = flipped === vendor.id && isFront;
            return (
              <div
                key={vendor.id}
                className={styles.slot}
                data-card={index}
                data-front={isFront || undefined}
                data-chosen={chosen || undefined}
                style={{ "--i": index } as CSSProperties}
                aria-hidden={!isFront}
              >
                <div className={styles.card} data-flipped={isFlipped || undefined}>
                  <div className={styles.face}>
                    <span className={styles.letter}>{vendor.masked.slice(-1)}</span>
                    <p className={styles.name}>{nameOf(vendor.id)}</p>
                    <span className={styles.fit} style={{ "--fit": vendor.fit / 100 } as CSSProperties}>
                      <span className={styles.fitValue}>{vendor.fit}%</span>
                      <span className={styles.fitLabel}>fit</span>
                    </span>
                    <ul className={styles.strengths}>
                      {strengths(vendor.id).map((item) => (
                        <li key={item.label}>{item.label}<span>{item.score} of 5</span></li>
                      ))}
                    </ul>
                    <div className={styles.actions}>
                      <button type="button" className={styles.ghost} tabIndex={isFront ? 0 : -1} onClick={() => setFlipped(vendor.id)}>
                        Evidence
                      </button>
                      <button
                        type="button"
                        className={styles.choose}
                        tabIndex={isFront ? 0 : -1}
                        aria-pressed={chosen}
                        aria-label={`${chosen ? "Remove" : "Choose"} ${nameOf(vendor.id)} ${chosen ? "from" : "as a"} contender`}
                        onClick={() => onToggle(vendor.id)}
                      >
                        {chosen ? "Chosen" : "Choose"}
                      </button>
                    </div>
                  </div>
                  <div className={styles.back} aria-hidden={!isFlipped}>
                    <p className={styles.backTitle}>Evidence for {nameOf(vendor.id)}</p>
                    <p className={styles.backText}>{vendor.evidence}.</p>
                    <p className={styles.backMeta}>{vendor.verified}. Price: {vendor.price}.</p>
                    <button type="button" className={styles.ghost} tabIndex={isFlipped ? 0 : -1} onClick={() => setFlipped(null)}>
                      Back to scores
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.arrow} aria-label="Previous vendor" onClick={() => goTo(front - 1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
        <div className={styles.dots} role="group" aria-label="Choose a vendor to show">
          {vendors.map((vendor, index) => (
            <button
              key={vendor.id}
              type="button"
              className={styles.dot}
              aria-label={`Show ${nameOf(vendor.id)}`}
              aria-current={index === front || undefined}
              data-chosen={selected.includes(vendor.id) || undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
        <button type="button" className={styles.arrow} aria-label="Next vendor" onClick={() => goTo(front + 1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </div>
      <p className={styles.status} aria-live="polite">
        Showing {nameOf(frontVendor.id)}, {frontVendor.fit}% fit. {count} of {max} contenders chosen.
      </p>
    </div>
  );
}
