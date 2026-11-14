import { ToggleGroup } from "radix-ui";
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { criteria, vendors } from "../../kit/data";
import { initialWeights, weightedFit, type Weights } from "../../kit/weighted-fit";
import styles from "./scene.module.css";

const shortLabels: Record<string, string> = {
  payroll: "Payroll", benefits: "Benefits", time: "Time", aca: "ACA reports",
  hiring: "Hiring", mobile: "Mobile", launch: "90-day launch", api: "Open API",
};

const YAW_LIMIT = 34;

type Props = {
  selected: readonly string[];
  onToggle: (id: string) => void;
  nameOf: (id: string) => string;
};

/**
 * Six white plinths in a gallery room. Each plinth's height is its fit for the
 * requirements you keep switched on. Drag the room to walk around it. A
 * marigold sphere rests on every plinth you choose.
 */
export function PlinthScene({ selected, onToggle, nameOf }: Props) {
  const defaults = useMemo(() => initialWeights(), []);
  const [active, setActive] = useState<string[]>(criteria.map((criterion) => criterion.id));
  const fit = useMemo(() => {
    const weights = Object.fromEntries(criteria.map((c) => [c.id, active.includes(c.id) ? defaults[c.id] : 0])) as Weights;
    return weightedFit(weights);
  }, [active, defaults]);

  const roomRef = useRef<HTMLDivElement>(null);
  const yaw = useRef(-16);
  const drag = useRef<{ x: number; start: number } | null>(null);

  const turn = (value: number) => {
    yaw.current = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, value));
    roomRef.current?.style.setProperty("--yaw", `${yaw.current}deg`);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: yaw.current };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) turn(drag.current.start + (event.clientX - drag.current.x) * 0.18);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    turn(yaw.current + (event.key === "ArrowRight" ? 6 : -6));
  };

  return (
    <div className={styles.wrap}>
      <ToggleGroup.Root
        type="multiple"
        className={styles.chips}
        value={active}
        onValueChange={(value) => { if (value.length > 0) setActive(value); }}
        aria-label="Requirements that count toward fit"
      >
        {criteria.map((criterion) => (
          <ToggleGroup.Item key={criterion.id} value={criterion.id} className={styles.chip} aria-label={criterion.label}>
            {shortLabels[criterion.id] ?? criterion.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      <div
        className={styles.stage}
        role="region"
        aria-label="Plinths showing each vendor fit. Use the left and right arrow keys to walk around them."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <div ref={roomRef} className={styles.room} style={{ "--yaw": "-16deg" } as CSSProperties} aria-hidden="true">
          <span className={styles.floor} />
          {vendors.map((vendor, index) => {
            const value = fit[vendor.id] ?? 0;
            const chosen = selected.includes(vendor.id);
            return (
              <div
                key={vendor.id}
                className={styles.plinth}
                data-chosen={chosen || undefined}
                style={{ "--x": index - (vendors.length - 1) / 2, "--fit": value / 100 } as CSSProperties}
              >
                <span className={styles.contact} />
                <span className={styles.front}><b>{vendor.masked.slice(-1)}</b></span>
                <span className={styles.back} />
                <span className={styles.left} />
                <span className={styles.right} />
                <span className={styles.top} />
                <span className={styles.sphere} />
              </div>
            );
          })}
        </div>
      </div>

      <ul className={styles.plaques}>
        {vendors.map((vendor) => {
          const chosen = selected.includes(vendor.id);
          return (
            <li key={vendor.id} className={styles.plaque} data-chosen={chosen || undefined}>
              <span className={styles.plaqueName}>{nameOf(vendor.id)}</span>
              <span className={styles.plaqueFit}>{fit[vendor.id] ?? 0}% fit</span>
              <button
                type="button"
                className={styles.plaqueButton}
                aria-pressed={chosen}
                aria-label={`${chosen ? "Remove" : "Choose"} ${nameOf(vendor.id)} ${chosen ? "from" : "as a"} contender`}
                onClick={() => onToggle(vendor.id)}
              >
                {chosen ? "Chosen" : "Choose"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
