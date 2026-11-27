"use client";

import { useId, useState, type CSSProperties } from "react";

import { Spotlight } from "../motion";
import { defaultNeeds, rankProviders } from "./match-data";

/** Words for the fee slider, lowest to highest. No amounts: it is a sample. */
const FEE_WORDS = ["Lowest", "Low", "Middle", "High", "Highest"] as const;

/** The word for a fee level from 0 to 100. */
export function feeWord(level: number) {
  return FEE_WORDS[Math.min(FEE_WORDS.length - 1, Math.floor((level / 100) * FEE_WORDS.length))];
}

/** Sample fee levels (0 to 100) for every row except the last one. */
const FIXED_FEES = [35, 60, 25];

/**
 * A hands-on proof of "Fees never rank" for the blue band on the home page.
 *
 * Four sample providers are ranked on fit (the same sample data and scoring
 * as the hero demo, labelled "Sample data"). The visitor drags the referral
 * fee paid by the lowest-ranked one from lowest to highest: its fee meter
 * grows past everyone else's, and the ranking does not move. The status
 * line says so ("Highest fee. Ranking unchanged."), politely announced.
 *
 * The slider is a native range input: mouse, touch and keyboard (arrows,
 * Page Up/Down, Home/End) all work, and screen readers hear the fee as a
 * word through aria-valuetext. Nothing here states a real amount.
 */
export function FeeDemo() {
  const rows = rankProviders(defaultNeeds).slice(0, FIXED_FEES.length + 1);
  const last = rows[rows.length - 1];
  const [fee, setFee] = useState(10);
  const word = feeWord(fee);
  const inputId = useId();

  return (
    <Spotlight className="co-fee">
      <div className="co-fee-ctl">
        <span className="co-chip co-fee-chip">Sample data</span>
        <label className="co-fee-label" htmlFor={inputId}>
          Referral fee paid by Provider {last.id}
        </label>
        <input
          aria-valuetext={word}
          className="co-fee-range"
          id={inputId}
          max={100}
          min={0}
          onChange={(event) => setFee(Number(event.target.value))}
          style={{ ["--co-fee" as string]: `${fee}%` } as CSSProperties}
          type="range"
          value={fee}
        />
        <div aria-hidden="true" className="co-fee-ends">
          <span>{FEE_WORDS[0]}</span>
          <span>{FEE_WORDS[FEE_WORDS.length - 1]}</span>
        </div>
        <p aria-live="polite" className="co-fee-status">
          {/* The key replays the little "lock" pulse each time the word changes. */}
          <span className="co-fee-lock" key={word} aria-hidden="true">
            <LockIcon />
          </span>
          {word} fee. Ranking unchanged.
        </p>
      </div>

      <div className="co-fee-list">
        {/* Column names for sighted visitors; each row says them in words too. */}
        <div aria-hidden="true" className="co-fee-head">
          <span>Fit</span>
          <span>Referral fee</span>
        </div>
        <ol className="co-fee-rows">
          {rows.map((row, index) => {
            const level = index === rows.length - 1 ? fee : FIXED_FEES[index];
            const mover = row.id === last.id;
            return (
              <li className={mover ? "co-fee-row co-fee-row-on" : "co-fee-row"} key={row.id}>
                <span className="co-fee-rank">{index + 1}</span>
                <span className="co-fee-name">Provider {row.id}</span>
                <span className="co-fee-fit">
                  <span className="co-home-vh">Fit </span>
                  <span className="co-fee-bar" aria-hidden="true">
                    <i style={{ ["--v" as string]: `${row.score}%` } as CSSProperties} />
                  </span>
                  <b>{row.score}</b>
                </span>
                <span className="co-fee-paid">
                  <span className="co-home-vh">Referral fee: {feeWord(level)}</span>
                  <span className="co-fee-meter" aria-hidden="true">
                    <i style={{ scale: `${Math.max(0.04, level / 100)} 1` }} />
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Spotlight>
  );
}

function LockIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <rect height="10" rx="2" width="14" x="5" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
