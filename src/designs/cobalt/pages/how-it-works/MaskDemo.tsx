"use client";

import { useState, type CSSProperties } from "react";

import { Spotlight } from "../../motion/pointer";
import { sampleBoard } from "./story-scene";

/** The four best sample fits from the story picture (letters, sample scores). */
const rows = sampleBoard(4);

/** The two views of the comparison. */
type View = "masked" | "named";

const views: { id: View; label: string }[] = [
  { id: "masked", label: "Masked" },
  { id: "named", label: "After advisor review" },
];

/** What the live region says after each change. Only claims the page already makes. */
const VIEW_NEWS: Record<View, string> = {
  masked: "Names masked. Each option shows its fit score.",
  named: "Names shown after the advisor review. Same order, same scores.",
};
const FEE_NOTE = "Referral fees are never an input to the score.";

const cssVar = (name: string, value: string | number) => ({ [name]: value }) as CSSProperties;

/**
 * A small hands-on comparison beside "What masked means": four sample
 * options ranked on fit, with two controls.
 *
 * - "Masked" / "After advisor review" (a two-button switch, aria-pressed):
 *   the names flip from "Masked" to letters, one row after another. The
 *   order and the scores do not move.
 * - "Show referral fees" (a toggle, aria-pressed): every row gets a
 *   "Pays MMHR a referral fee" chip, and the bars only shimmer in place,
 *   because the fee is never an input to the score.
 *
 * A polite live region says what changed. Everything is sample data
 * (labelled so), using the same letters and sample scores as the story
 * picture. The server HTML shows the masked view with every score readable.
 * Reduced motion: the states switch without movement (how-it-works.css).
 */
export function MaskDemo() {
  const [view, setView] = useState<View>("masked");
  const [fees, setFees] = useState(false);
  const [news, setNews] = useState("");

  return (
    <Spotlight className="co-gl co-hiw-mask" data-view={view} data-fees={fees ? "on" : "off"}>
      <div className="co-hiw-mask-top">
        <div aria-label="Comparison view" className="co-hiw-seg-ctl" role="group">
          {/* The white pill slides under the pressed button. */}
          <span aria-hidden="true" className="co-hiw-seg-pill" />
          {views.map((option) => (
            <button
              aria-pressed={view === option.id}
              key={option.id}
              onClick={() => {
                setView(option.id);
                setNews(VIEW_NEWS[option.id]);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="co-chip co-chip-n">Sample data</span>
      </div>

      <ol className="co-hiw-board">
        {rows.map((row, index) => (
          <li key={row.letter} style={cssVar("--i", index)}>
            <span className="co-hiw-rank">{String(index + 1).padStart(2, "0")}</span>
            {/* Both names are in the HTML; CSS flips between them and the
                hidden one is aria-hidden, so a screen reader reads one. */}
            <span className="co-hiw-name">
              <span aria-hidden={view !== "masked"} className="co-hiw-name-m">
                <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
                  <rect height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" width="8" x="2" y="5.5" />
                  <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                Masked
              </span>
              <span aria-hidden={view !== "named"} className="co-hiw-name-r">
                Provider {row.letter}
              </span>
            </span>
            <span aria-hidden="true" className="co-hiw-bar">
              <i style={cssVar("--fit", row.score / 100)} />
            </span>
            <b className="co-hiw-score">{row.score}</b>
            <span aria-hidden={!fees} className="co-hiw-fee">
              Pays MMHR a referral fee
            </span>
          </li>
        ))}
      </ol>

      <div className="co-hiw-mask-foot">
        <button
          aria-pressed={fees}
          className="co-hiw-switch"
          onClick={() => {
            setFees(!fees);
            setNews(fees ? "Referral fees hidden." : `Referral fees shown. ${FEE_NOTE}`);
          }}
          type="button"
        >
          <span aria-hidden="true" className="co-hiw-switch-track">
            <span className="co-hiw-switch-knob" />
          </span>
          Show referral fees
        </button>
        <p className="co-hiw-fee-note">{FEE_NOTE}</p>
      </div>
      <p aria-live="polite" className="co-hiw-sr">
        {news}
      </p>
    </Spotlight>
  );
}
