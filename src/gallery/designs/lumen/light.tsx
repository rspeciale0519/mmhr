import { useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

import { vendors } from "../../kit/data";
import styles from "./light.module.css";

/** Where each vendor tile rests on the table, in percent. */
const spots = [
  { x: 22, y: 30 }, { x: 78, y: 26 }, { x: 84, y: 70 },
  { x: 60, y: 84 }, { x: 18, y: 74 }, { x: 40, y: 14 },
];

const clamp = (value: number) => Math.min(0.96, Math.max(0.04, value));

/**
 * Writes the light position to --lx and --ly on the design root, from -1 to 1
 * around the center. Every lifted surface reads them to cast its shadow.
 */
function setLight(root: HTMLElement | null, x: number, y: number) {
  if (!root) return;
  root.style.setProperty("--lx", ((x - 0.5) * 2).toFixed(3));
  root.style.setProperty("--ly", ((y - 0.5) * 2).toFixed(3));
}

type Props = {
  rootRef: RefObject<HTMLElement | null>;
  selected: readonly string[];
  onToggle: (id: string) => void;
  nameOf: (id: string) => string;
  count: number;
  max: number;
};

/** A table seen from above. Drag the sun and every shadow on the page turns with it. */
export function LightTable({ rootRef, selected, onToggle, nameOf, count, max }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const position = useRef({ x: 0.16, y: 0.12 });
  const dragging = useRef(false);

  const place = useCallback((x: number, y: number) => {
    position.current = { x: clamp(x), y: clamp(y) };
    const sun = sunRef.current;
    if (sun) {
      sun.style.left = `${position.current.x * 100}%`;
      sun.style.top = `${position.current.y * 100}%`;
      sun.setAttribute("aria-valuenow", String(Math.round(position.current.x * 100)));
      sun.setAttribute("aria-valuetext", describe(position.current.x, position.current.y));
    }
    setLight(rootRef.current, position.current.x, position.current.y);
  }, [rootRef]);

  // One sunrise on first view: the light climbs from low left to upper left.
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    place(0.16, 0.12);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      seen.disconnect();
      let start = 0;
      const rise = (time: number) => {
        if (!start) start = time;
        const t = Math.min(1, (time - start) / 2200);
        const eased = 1 - Math.pow(1 - t, 3);
        if (!dragging.current) place(0.04 + eased * 0.12, 0.9 - eased * 0.78);
        if (t < 1) frame = requestAnimationFrame(rise);
      };
      frame = requestAnimationFrame(rise);
    }, { threshold: 0.4 });
    seen.observe(table);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
    };
  }, [place]);

  const fromPointer = (event: PointerEvent<HTMLElement>) => {
    const rect = tableRef.current!.getBoundingClientRect();
    place((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.04;
    const { x, y } = position.current;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [x - step, y], ArrowRight: [x + step, y], ArrowUp: [x, y - step], ArrowDown: [x, y + step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    place(move[0], move[1]);
  };

  return (
    <figure className={styles.figure} aria-labelledby="lumen-table-caption">
      <div ref={tableRef} className={styles.table}>
        {vendors.map((vendor, index) => {
          const chosen = selected.includes(vendor.id);
          const lift = 6 + Math.round(((vendor.fit - 60) / 40) * 22) + (chosen ? 14 : 0);
          return (
            <button
              key={vendor.id}
              type="button"
              className={styles.tile}
              data-chosen={chosen || undefined}
              aria-pressed={chosen}
              aria-label={`${nameOf(vendor.id)}, ${vendor.fit}% fit`}
              style={{ left: `${spots[index]!.x}%`, top: `${spots[index]!.y}%`, "--h": lift } as CSSProperties}
              onClick={() => onToggle(vendor.id)}
            >
              <span className={styles.tileLetter} aria-hidden="true">{vendor.masked.slice(-1)}</span>
              <span className={styles.tileFit} aria-hidden="true">{vendor.fit}%</span>
            </button>
          );
        })}
        <div className={styles.needs} style={{ "--h": 44 } as CSSProperties} aria-hidden="true">
          <span className={styles.needsTitle}>Your needs</span>
          <span className={styles.needsMeta}>{count} of {max} chosen</span>
        </div>
        <div
          ref={sunRef}
          className={styles.sun}
          role="slider"
          tabIndex={0}
          aria-label="Light position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={16}
          aria-valuetext={describe(0.16, 0.12)}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = true;
          }}
          onPointerMove={(event) => { if (dragging.current) fromPointer(event); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
        />
      </div>
      <figcaption id="lumen-table-caption" className={styles.caption}>
        A sample search for Fernwood Dental Group. Better fits float higher. Choose a tile to make it a contender.
        Drag the sun, or focus it and use the arrow keys, to move the light.
      </figcaption>
    </figure>
  );
}

function describe(x: number, y: number): string {
  const vertical = y < 0.34 ? "upper" : y > 0.66 ? "lower" : "middle";
  const horizontal = x < 0.34 ? "left" : x > 0.66 ? "right" : "center";
  return `Light from the ${vertical} ${horizontal}`;
}
