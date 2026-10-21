import { useRef, type CSSProperties } from "react";

import { criteria, vendors } from "../../kit/data";
import { useInView } from "../../kit/use-in-view";
import type { ScorecardState } from "../../kit/use-scorecard";
import styles from "./hero.module.css";

const preview = criteria.slice(0, 3);

/** A fanned deck of masked vendor cards. Choosing one fills the shortlist tray. */
export function ShortlistHero({ state }: { state: ScorecardState }) {
  const ref = useRef<HTMLElement>(null);
  const active = useInView(ref, 0.25);
  const label = (id: string) => vendors.find((vendor) => vendor.id === id)?.masked ?? id;

  return (
    <section ref={ref} className={styles.hero} data-active={active || undefined} aria-labelledby="shortlist-hero-title">
      <div className={styles.copy}>
        <h1 id="shortlist-hero-title" className={styles.title}>Narrow it down to the five that fit.</h1>
        <p className={styles.lede}>
          Every approved HR platform, scored against your needs. Names stay face down until you talk it through with your
          advisor. It costs you nothing.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#shortlist-needs">Start your needs assessment</a>
          <a className={styles.secondary} href="#shortlist-scorecard">Compare the full scorecard</a>
        </div>
      </div>

      <div className={styles.table}>
        <p className={styles.hint} id="shortlist-deck-hint">Tap a card to add it to your shortlist. Try it.</p>
        <ul className={styles.deck} aria-describedby="shortlist-deck-hint">
          {vendors.map((vendor, index) => {
            const chosen = state.isSelected(vendor.id);
            return (
              <li key={vendor.id} className={styles.slot} style={{ "--i": index, "--n": vendors.length } as CSSProperties}>
                <button
                  type="button"
                  className={styles.card}
                  aria-pressed={chosen}
                  aria-label={`${vendor.masked}, ${vendor.fit}% fit. ${chosen ? "Remove from" : "Add to"} shortlist`}
                  onClick={() => state.toggle(vendor.id)}
                >
                  <span className={styles.cardTop}>
                    <span className={styles.cardLetter}>{vendor.masked.slice(-1)}</span>
                    <span className={styles.cardFit}>{vendor.fit}%</span>
                  </span>
                  <span className={styles.cardName}>{vendor.masked}</span>
                  <span className={styles.cardBars} aria-hidden="true">
                    {preview.map((item) => (
                      <span key={item.id} className={styles.cardBar}>
                        <span className={styles.cardBarLabel}>{item.label.split(" ")[0]}</span>
                        <span className={styles.cardBarTrack}>
                          <span className={styles.cardBarFill} style={{ "--v": (item.scores[vendor.id] ?? 0) / 5 } as CSSProperties} />
                        </span>
                      </span>
                    ))}
                  </span>
                  <span className={styles.cardAction}>{chosen ? "On your shortlist" : "Add to shortlist"}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className={styles.tray} aria-label="Your shortlist">
          <p className={styles.trayTitle}>
            Your shortlist <span className={styles.trayCount}>{state.count} of {state.max}</span>
          </p>
          <ol className={styles.traySlots}>
            {Array.from({ length: state.max }, (_, index) => {
              const id = state.selected[index];
              return (
                <li key={index} className={styles.traySlot} data-filled={id ? true : undefined}>
                  {id ? <span className={styles.trayChip}>{label(id)}</span> : <span className={styles.trayEmpty}>Open slot</span>}
                </li>
              );
            })}
          </ol>
          {/* Visual copy only; the scorecard live region announces the same message once. */}
          <p className={styles.trayMessage}>{state.message}</p>
        </div>
      </div>

    </section>
  );
}
