import { Tabs } from "radix-ui";
import { useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";

import { caseSummary, criteria, responses, vendors } from "../../kit/data";
import { useScrollProgress } from "../../kit/use-scroll-progress";
import styles from "./window.module.css";

type View = "compare" | "request" | "decide";

type Props = { selected: readonly string[]; onToggle: (id: string) => void; nameOf: (id: string) => string };

/**
 * The product itself, tilted back in 3D. It lies flat as you scroll to it.
 * The tabs switch views; where the browser supports view transitions, the
 * old view morphs into the new one.
 */
export function ProductWindow({ selected, onToggle, nameOf }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>("compare");
  useScrollProgress(stageRef, undefined, { mode: "anchor", anchor: 1 });

  const change = (next: string) => {
    const apply = () => setView(next as View);
    const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const transition = doc.startViewTransition(() => flushSync(apply)) as { ready?: Promise<void>; finished?: Promise<void> };
      // A skipped transition still applies the change; only the animation is lost.
      transition.ready?.catch(() => {});
      transition.finished?.catch(() => {});
    } else apply();
  };

  const finalists = vendors.filter((vendor) => selected.includes(vendor.id)).slice(0, 2);
  const pair = finalists.length === 2 ? finalists : vendors.slice(0, 2);

  return (
    <Tabs.Root value={view} onValueChange={change} className={styles.root}>
      <Tabs.List className={styles.tabs} aria-label="Product views">
        <Tabs.Trigger value="compare" className={styles.tab}>Compare</Tabs.Trigger>
        <Tabs.Trigger value="request" className={styles.tab}>Request</Tabs.Trigger>
        <Tabs.Trigger value="decide" className={styles.tab}>Decide</Tabs.Trigger>
      </Tabs.List>

      <div ref={stageRef} className={styles.stage}>
        <span className={styles.glow} aria-hidden="true" />
        <div className={styles.window}>
          <div className={styles.bar}>
            <span className={styles.barMark} aria-hidden="true" />
            <span className={styles.barTitle}>{caseSummary.company}</span>
            <span className={styles.barAvatar} aria-hidden="true">DO</span>
          </div>

          <Tabs.Content value="compare" className={styles.view}>
            <p className={styles.viewTitle}>Comparison, sample data. Choose a row to make it a contender.</p>
            <ul className={styles.rows}>
              {vendors.map((vendor) => (
                <li key={vendor.id}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-pressed={selected.includes(vendor.id)}
                    aria-label={`${selected.includes(vendor.id) ? "Remove" : "Choose"} ${nameOf(vendor.id)} ${selected.includes(vendor.id) ? "from" : "as a"} contender, ${vendor.fit}% fit`}
                    onClick={() => onToggle(vendor.id)}
                  >
                    <span className={styles.letter} aria-hidden="true">{vendor.masked.slice(-1)}</span>
                    <span className={styles.rowName}>{nameOf(vendor.id)}</span>
                    <span className={styles.cells} aria-hidden="true">
                      {criteria.map((c) => <i key={c.id} style={{ "--s": (c.scores[vendor.id] ?? 0) / 5 } as CSSProperties} />)}
                    </span>
                    <span className={styles.rowFit}>{vendor.fit}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </Tabs.Content>

          <Tabs.Content value="request" className={styles.view}>
            <p className={styles.viewTitle}>RFP version 3, replies due October 29</p>
            <ul className={styles.rows}>
              {responses.map((item) => (
                <li key={item.vendor} className={styles.row}>
                  <span className={styles.letter} aria-hidden="true">{item.vendor.slice(-1)}</span>
                  <span className={styles.rowName}>{item.vendor}</span>
                  <span className={styles.pill} data-tone={item.tone}>{item.status}</span>
                  <span className={styles.rowMeta}>{item.updated}</span>
                </li>
              ))}
            </ul>
          </Tabs.Content>

          <Tabs.Content value="decide" className={styles.view}>
            <p className={styles.viewTitle}>Final two, side by side</p>
            <div className={styles.pair}>
              {pair.map((vendor) => (
                <div key={vendor.id} className={styles.finalist}>
                  <span className={styles.letterLarge} aria-hidden="true">{vendor.masked.slice(-1)}</span>
                  <p className={styles.finalName}>{nameOf(vendor.id)}</p>
                  <dl className={styles.facts}>
                    <div><dt>Fit</dt><dd>{vendor.fit}%</dd></div>
                    <div><dt>Price</dt><dd>{vendor.price}</dd></div>
                    <div><dt>Evidence</dt><dd>{vendor.verified}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </Tabs.Content>
        </div>
      </div>
    </Tabs.Root>
  );
}
