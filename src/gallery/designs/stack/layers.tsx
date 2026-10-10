import { useEffect, useState, type CSSProperties } from "react";

import { criteria, vendors } from "../../kit/data";
import styles from "./layers.module.css";

/** The HR stack, bottom to top. Each layer groups the requirements it serves. */
const layers = [
  { id: "base", name: "Your company", detail: "240 people across three states", criteria: [] as string[] },
  { id: "payroll", name: "Payroll", detail: "Pay runs, taxes, and three-state filing", criteria: ["payroll"] },
  { id: "benefits", name: "Benefits and ACA", detail: "Enrollment, carriers, and ACA reporting", criteria: ["benefits", "aca"] },
  { id: "time", name: "Time and attendance", detail: "Clocks, schedules, and overtime", criteria: ["time"] },
  { id: "hiring", name: "Hiring", detail: "Job posts, applicants, and offers", criteria: ["hiring"] },
  { id: "access", name: "Self-service and API", detail: "Mobile app and integrations", criteria: ["mobile", "api"] },
];

/** A vendor covers a layer when its verified scores there average 4 or more. */
function covers(vendorId: string, layer: (typeof layers)[number]) {
  if (layer.criteria.length === 0) return false;
  const scores: number[] = layer.criteria.map((id) => criteria.find((c) => c.id === id)!.scores[vendorId] ?? 0);
  return scores.reduce((sum, score) => sum + score, 0) / scores.length >= 4;
}

type Props = { selected: readonly string[]; nameOf: (id: string) => string };

/**
 * An isometric, exploded diagram of the HR software stack. Choose a layer to
 * lift it and see which vendors cover it. Chosen contenders show as pegs on
 * the layers they cover, and a layer none of them covers is marked as a gap.
 */
export function StackDiagram({ selected, nameOf }: Props) {
  const [active, setActive] = useState("payroll");
  const [exploded, setExploded] = useState(false);
  const gap = (layer: (typeof layers)[number]) => selected.length > 0 && !selected.some((id) => covers(id, layer));

  // One orchestrated moment: the stack opens shortly after it appears.
  useEffect(() => {
    const timer = window.setTimeout(() => setExploded(true), 450);
    return () => window.clearTimeout(timer);
  }, []);

  const current = layers.find((layer) => layer.id === active)!;
  const coverage = vendors.filter((vendor) => covers(vendor.id, current));

  return (
    <div className={styles.wrap}>
      <div className={styles.stage} aria-hidden="true">
        <div className={styles.iso} data-exploded={exploded || undefined}>
          {layers.map((layer, index) => (
            <div
              key={layer.id}
              className={styles.slab}
              data-active={layer.id === active || undefined}
              data-gap={(index > 0 && gap(layer)) || undefined}
              data-base={index === 0 || undefined}
              style={{ "--i": index } as CSSProperties}
            >
              <span className={styles.slabName}>{layer.name}</span>
              <span className={styles.pegs}>
                {vendors.filter((v) => selected.includes(v.id) && covers(v.id, layer)).map((v) => (
                  <i key={v.id}>{v.masked.slice(-1)}</i>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <p className={styles.toolbarLabel} id="stack-layers-label">
          Layers, and how many vendors cover each. A gap means none of your {selected.length} contenders covers it yet.
        </p>
        <ul className={styles.list} aria-labelledby="stack-layers-label">
          {[...layers].reverse().filter((layer) => layer.id !== "base").map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                className={styles.layerButton}
                aria-pressed={layer.id === active}
                onClick={() => setActive(layer.id)}
                onPointerEnter={() => setActive(layer.id)}
                onFocus={() => setActive(layer.id)}
              >
                <span className={styles.layerName}>{layer.name}</span>
                <span className={styles.layerCount} data-gap={gap(layer) || undefined}>
                  {gap(layer) ? "Gap" : `${vendors.filter((v) => covers(v.id, layer)).length} of 6`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.detail} aria-live="polite">
          <p className={styles.detailTitle}>{current.name}</p>
          <p className={styles.detailText}>
            {current.detail}. {gap(current) ? "None of your contenders covers this layer yet. Vendors that do:" : "Covered well by:"}
          </p>
          <ul className={styles.chips}>
            {coverage.length === 0 ? <li className={styles.none}>No verified fit yet</li> : coverage.map((vendor) => (
              <li key={vendor.id} data-chosen={selected.includes(vendor.id) || undefined}>{nameOf(vendor.id)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
