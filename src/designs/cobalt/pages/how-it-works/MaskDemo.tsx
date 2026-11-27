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

/**
 * The sample buyer's picks, made on fit while every name was masked
 * ("pick first"). Sample data, like the rows themselves: three picks, so
 * one more match (D) is left over to show a swap.
 */
const SAMPLE_PICKS = ["A", "B", "C"];
/** In the sample swap, the buyer recognizes this pick and does not want it... */
const SWAP_OUT = "B";
/** ...and the next match on fit takes its place. */
const SWAP_IN = "D";

/**
 * Where one row stands in the sample:
 * - "pick": one of the buyer's picks (named after the advisor review);
 * - "out": a pick the buyer swapped out after seeing its name;
 * - "none": a match the buyer did not pick (it stays masked).
 */
type PickState = "pick" | "out" | "none";

function pickState(letter: string, swapped: boolean): PickState {
  if (swapped && letter === SWAP_OUT) return "out";
  if (swapped && letter === SWAP_IN) return "pick";
  return SAMPLE_PICKS.includes(letter) ? "pick" : "none";
}

/** The short words in each row's pick cell (empty for a match not picked). */
const PICK_LABEL: Record<PickState, string> = { pick: "Pick", out: "Out", none: "" };

/** What the live region says after each change. Only claims the page already makes. */
const VIEW_NEWS: Record<View, string> = {
  masked: "Names masked. Each option shows its fit score, and you pick on fit.",
  named: "Names shown for your picks after the advisor review. Same order, same scores.",
};
const SWAP_NEWS = `Sample swap: Provider ${SWAP_OUT} is out. The next match, Provider ${SWAP_IN}, is now a pick.`;
const UNSWAP_NEWS = `Swap undone. Provider ${SWAP_OUT} is a pick again.`;
const FEE_NOTE = "Referral fees are never an input to the score.";
/** The swap offer, in the same words the page and the FAQ use. */
const SWAP_NOTE = "Recognize one you already know and do not want? Swap it for another match.";

const cssVar = (name: string, value: string | number) => ({ [name]: value }) as CSSProperties;

/**
 * A small hands-on comparison beside "What masked means": four sample
 * options ranked on fit, three of them picked by a sample buyer while the
 * names were still masked. Three controls:
 *
 * - "Masked" / "After advisor review" (a two-button switch, aria-pressed):
 *   the names of the picked rows flip from "Masked" to letters, one row
 *   after another. The row that was not picked stays masked: the review
 *   names your picks, not every match. The order and the scores do not move.
 * - "Swap Provider B" (only after the review): shows the swap the buyer is
 *   offered when they recognize a pick they do not want. B is marked "Out"
 *   and the next match, D, becomes a pick and is named. "Undo swap" puts it
 *   back. Switching back to "Masked" also undoes it (no swap before names).
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
  const [swapped, setSwapped] = useState(false);
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
                // A swap only happens after names are shown.
                if (option.id === "masked") setSwapped(false);
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
        {rows.map((row, index) => {
          const state = pickState(row.letter, swapped);
          // A row shows its name after the review if it is (or was) a pick.
          const named = view === "named" && state !== "none";
          return (
            <li data-named={named ? "" : undefined} data-pick={state} key={row.letter} style={cssVar("--i", index)}>
              <span className="co-hiw-rank">{String(index + 1).padStart(2, "0")}</span>
              {/* Both names are in the HTML; CSS flips between them and the
                  hidden one is aria-hidden, so a screen reader reads one. */}
              <span className="co-hiw-name">
                <span aria-hidden={named} className="co-hiw-name-m">
                  <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
                    <rect height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" width="8" x="2" y="5.5" />
                    <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                  Masked
                </span>
                <span aria-hidden={!named} className="co-hiw-name-r">
                  Provider {row.letter}
                </span>
              </span>
              <span aria-hidden="true" className="co-hiw-bar">
                <i style={cssVar("--fit", row.score / 100)} />
              </span>
              <b className="co-hiw-score">{row.score}</b>
              {/* "Pick" (mint) or "Out" (struck through); empty when not picked. */}
              <span className="co-hiw-pick">{PICK_LABEL[state]}</span>
              <span aria-hidden={!fees} className="co-hiw-fee">
                Pays MMHR a referral fee
              </span>
            </li>
          );
        })}
      </ol>

      <div className="co-hiw-swap">
        <p>{SWAP_NOTE}</p>
        {view === "named" ? (
          <button
            className="co-btn co-btn-g co-hiw-swap-btn"
            onClick={() => {
              setSwapped(!swapped);
              setNews(swapped ? UNSWAP_NEWS : SWAP_NEWS);
            }}
            type="button"
          >
            {swapped ? "Undo swap" : `Swap Provider ${SWAP_OUT}`}
          </button>
        ) : null}
      </div>

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
