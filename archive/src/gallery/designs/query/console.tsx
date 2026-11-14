import { ToggleGroup } from "radix-ui";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { caseSummary, criteria, vendors } from "../../kit/data";
import base from "../../kit/kit.module.css";
import { initialWeights, rankVendors, weightedFit, type Weights } from "../../kit/weighted-fit";
import styles from "./console.module.css";

const keys: Record<string, string> = {
  payroll: "payroll_3_states", benefits: "benefits", time: "time_tracking", aca: "aca_reporting",
  hiring: "applicant_tracking", mobile: "mobile_self_service", launch: "live_in_90_days", api: "open_api",
};

/**
 * Types the change from the shown text to the new text: it deletes back to the
 * shared start, then types the rest. Reduced motion shows the new text at once.
 */
function useTyped(text: string): string {
  const [shown, setShown] = useState(text);
  const current = useRef(text);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let common = 0;
    while (common < text.length && current.current[common] === text[common]) common += 1;
    let timer = 0;
    const tick = () => {
      const now = current.current;
      let next: string;
      if (now.length > common && !text.startsWith(now)) next = now.slice(0, -1);
      else if (now.length < text.length) next = text.slice(0, now.length + 1);
      else return;
      current.current = next;
      setShown(next);
      timer = window.setTimeout(tick, 9);
    };
    if (reduced) {
      current.current = text;
      timer = window.setTimeout(() => setShown(text), 0);
    } else timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [text]);

  return shown;
}

/** Rows slide to their new rank (FLIP). */
function useRankMotion(order: readonly string[]) {
  const rows = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rows.current.forEach((row, id) => {
      const top = row.offsetTop;
      const before = tops.current.get(id);
      if (!reduced && before !== undefined && before !== top) {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
      tops.current.set(id, top);
    });
  }, [order]);
  return (id: string) => (node: HTMLElement | null) => {
    if (node) rows.current.set(id, node);
    else rows.current.delete(id);
  };
}

type Props = { selected: readonly string[]; nameOf: (id: string) => string };

/**
 * Matching shown as a request and a response. Switch requirements on or off;
 * the request rewrites itself and the ranked response re-sorts. It is an
 * illustration of what MMHR does for you; there is no code to write.
 */
export function QueryConsole({ selected, nameOf }: Props) {
  const defaults = useMemo(() => initialWeights(), []);
  const [active, setActive] = useState(criteria.filter((c) => c.weight === "Must have").map((c) => c.id));

  const fit = useMemo(() => {
    const weights = Object.fromEntries(criteria.map((c) => [c.id, active.includes(c.id) ? defaults[c.id] : 0])) as Weights;
    return weightedFit(weights);
  }, [active, defaults]);
  const order = useMemo(() => rankVendors(fit), [fit]);
  const rowRef = useRankMotion(order);

  const list = active.map((id) => `"${keys[id]}"`).join(", ");
  const typed = useTyped(list);

  return (
    <div className={styles.wrap}>
      <ToggleGroup.Root
        type="multiple"
        className={styles.chips}
        value={active}
        onValueChange={(value) => { if (value.length > 0) setActive(value); }}
        aria-label="Requirements in the request"
      >
        {criteria.map((criterion) => (
          <ToggleGroup.Item key={criterion.id} value={criterion.id} className={styles.chip}>
            {criterion.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      <div className={styles.scene}>
        <div className={styles.group}>
          <figure className={styles.request}>
            <figcaption className={styles.cardHead}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/matches</span>
            </figcaption>
            <pre className={styles.code} aria-hidden="true">
              <code>
                {"{\n  "}<span className={styles.key}>&quot;company&quot;</span>{": "}<span className={styles.string}>&quot;{caseSummary.company}&quot;</span>
                {",\n  "}<span className={styles.key}>&quot;employees&quot;</span>{": "}<span className={styles.number}>{caseSummary.employees}</span>
                {",\n  "}<span className={styles.key}>&quot;requirements&quot;</span>{": ["}<span className={styles.string}>{typed}</span><span className={styles.caret} />
                {"]\n}"}
              </code>
            </pre>
            <p className={base.srOnly}>
              Request for {caseSummary.company}, {caseSummary.employees} employees, requiring {active.map((id) => criteria.find((c) => c.id === id)!.label).join(", ")}.
            </p>
          </figure>

          <figure className={styles.response}>
            <figcaption className={styles.cardHead}>
              <span className={styles.ok}>200</span>
              <span className={styles.path}>Ranked by fit to your requirements</span>
            </figcaption>
            <ol className={styles.results} aria-label="Sample results, best fit first">
              {order.map((id, index) => (
                <li key={id} ref={rowRef(id)} className={styles.result} data-chosen={selected.includes(id) || undefined}>
                  <span className={styles.rank}>{index + 1}</span>
                  <span className={styles.name}>{nameOf(id)}</span>
                  <span className={styles.meter} aria-hidden="true"><i style={{ "--fit": (fit[id] ?? 0) / 100 } as CSSProperties} /></span>
                  <span className={styles.fit}>{fit[id] ?? 0}%</span>
                </li>
              ))}
            </ol>
          </figure>
        </div>
      </div>
      <p className={styles.note}>
        An illustration of what MatchMaker HR does for you. There is no code to write. Unknown evidence counts as zero.
        {` ${vendors.length} sample vendors.`}
      </p>
    </div>
  );
}
