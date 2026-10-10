import { useLayoutEffect, useRef } from "react";

import { criteria, vendors } from "../../kit/data";
import base from "../../kit/kit.module.css";
import { initialWeights, type Weight, type Weights } from "../../kit/weighted-fit";
import styles from "./device.module.css";
import { Knob } from "./knob";

const knobLabels: Record<string, string> = {
  payroll: "payroll", benefits: "benefits", time: "time", aca: "aca",
  hiring: "hiring", mobile: "mobile", launch: "90 days", api: "api",
};

type Props = {
  weights: Weights;
  onWeight: (id: string, value: Weight) => void;
  onReset: () => void;
  order: readonly string[];
  fit: Record<string, number>;
  selected: readonly string[];
  onToggle: (id: string) => void;
  nameOf: (id: string) => string;
  count: number;
  max: number;
};

/** Rows slide to their new rank instead of jumping (FLIP). */
function useRankMotion(order: readonly string[]) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rows.current.forEach((row, id) => {
      const top = row.offsetTop;
      const before = tops.current.get(id);
      if (!reduced && before !== undefined && before !== top) {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], {
          duration: 460,
          easing: "cubic-bezier(0.2, 0.9, 0.25, 1.08)",
        });
      }
      tops.current.set(id, top);
    });
  }, [order]);

  return (id: string) => (node: HTMLLIElement | null) => {
    if (node) rows.current.set(id, node);
    else rows.current.delete(id);
  };
}

export function Device({ weights, onWeight, onReset, order, fit, selected, onToggle, nameOf, count, max }: Props) {
  const rowRef = useRankMotion(order);
  const leader = order[0]!;
  const changed = JSON.stringify(weights) !== JSON.stringify(initialWeights());

  return (
    <div className={styles.device}>
      <div className={styles.strip} aria-hidden="true">
        <span className={styles.silk}>matchmaker hr</span>
        <span className={styles.silk}>fit engine</span>
        <span className={styles.power} />
      </div>

      <div className={styles.lcd}>
        <div className={styles.lcdHead} aria-hidden="true">
          <span>rank</span>
          <span>{count}/{max} chosen</span>
        </div>
        <ol className={styles.ranking} aria-label="Vendors ranked by your weights">
          {order.map((id, index) => {
            const value = fit[id] ?? 0;
            return (
              <li key={id} ref={rowRef(id)} className={styles.rank} data-selected={selected.includes(id) || undefined}>
                <span className={styles.rankNumber} aria-hidden="true">{index + 1}</span>
                <span className={styles.rankName}>{nameOf(id)}</span>
                <span className={styles.meter} aria-hidden="true">
                  {Array.from({ length: 10 }, (_, segment) => (
                    <i key={segment} data-on={segment < Math.round(value / 10) || undefined} />
                  ))}
                </span>
                <span className={styles.rankFit}>{value}<span className={base.srOnly}>% fit</span></span>
              </li>
            );
          })}
        </ol>
        <p className={base.srOnly} role="status" aria-live="polite">
          {`${nameOf(leader)} leads at ${fit[leader] ?? 0}% fit.`}
        </p>
      </div>

      <div className={styles.knobs} role="group" aria-label="How much each requirement matters">
        {criteria.map((criterion) => (
          <Knob
            key={criterion.id}
            label={knobLabels[criterion.id] ?? criterion.label}
            value={weights[criterion.id] ?? 0}
            onChange={(value) => onWeight(criterion.id, value)}
          />
        ))}
      </div>

      <div className={styles.keys}>
        <div className={styles.keyRow} role="group" aria-label={`Choose contenders, ${count} of ${max} chosen`}>
          {vendors.map((vendor) => {
            const chosen = selected.includes(vendor.id);
            return (
              <button
                key={vendor.id}
                type="button"
                className={styles.key}
                aria-pressed={chosen}
                aria-label={nameOf(vendor.id)}
                onClick={() => onToggle(vendor.id)}
              >
                <span className={styles.led} aria-hidden="true" />
                <span aria-hidden="true">{vendor.masked.slice(-1).toLowerCase()}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.reset} onClick={onReset} disabled={!changed}>
          reset
        </button>
      </div>
    </div>
  );
}
