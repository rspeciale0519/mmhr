import { useState, type CSSProperties } from "react";

import { caseSummary, criteria, vendors } from "../../kit/data";
import styles from "./sheets.module.css";

type Props = { selected: readonly string[]; nameOf: (id: string) => string };

/**
 * Three sheets of paper, slightly fanned. Turn the page and the top sheet
 * lifts away and slides to the back of the stack.
 */
export function Sheets({ selected, nameOf }: Props) {
  const [top, setTop] = useState(0);
  const [lifting, setLifting] = useState(false);

  const sheets = [
    {
      title: "Your needs",
      body: (
        <ul className={styles.list}>
          {criteria.filter((c) => c.weight === "Must have").map((c) => <li key={c.id}>{c.label}</li>)}
          <li>{caseSummary.employees} employees</li>
        </ul>
      ),
    },
    {
      title: "Your shortlist",
      body: (
        <ul className={styles.rows}>
          {vendors.slice(0, 5).map((vendor) => (
            <li key={vendor.id} data-chosen={selected.includes(vendor.id) || undefined}>
              <span>{nameOf(vendor.id)}</span>
              <span className={styles.bar}><i style={{ width: `${vendor.fit}%` }} /></span>
              <span>{vendor.fit}%</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      title: "Your request",
      body: (
        <p className={styles.note}>
          One RFP, approved by you and sent by MMHR to the contenders you chose. Replies come back in one place.
        </p>
      ),
    },
  ];

  const turn = () => {
    if (lifting) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTop((value) => (value + 1) % sheets.length);
      return;
    }
    setLifting(true);
    window.setTimeout(() => {
      setTop((value) => (value + 1) % sheets.length);
      setLifting(false);
    }, 520);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.stack}>
        {sheets.map((sheet, index) => {
          const depth = (index - top + sheets.length) % sheets.length;
          return (
            <article
              key={sheet.title}
              className={styles.sheet}
              data-depth={depth}
              data-lifting={(depth === 0 && lifting) || undefined}
              style={{ "--d": depth } as CSSProperties}
              aria-hidden={depth !== 0}
            >
              <p className={styles.kicker}>Sheet {index + 1} of {sheets.length}</p>
              <h3 className={styles.title}>{sheet.title}</h3>
              {sheet.body}
              <span className={styles.corner} aria-hidden="true" />
            </article>
          );
        })}
      </div>
      <button type="button" className={styles.turn} onClick={turn}>Turn the page</button>
    </div>
  );
}
