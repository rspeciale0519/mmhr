import { useRef, type CSSProperties } from "react";

import { useInView } from "../../kit/use-in-view";
import styles from "./hero.module.css";

/** A ring drawn by hand around a phrase. pathLength lets CSS draw it in. */
function Ring() {
  return (
    <svg className={styles.ring} viewBox="0 0 220 70" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M12 38c4-18 52-30 104-30 54 0 96 10 98 27 2 18-48 29-104 29C56 64 8 56 10 36 11 24 40 12 78 8" />
    </svg>
  );
}

function Underline() {
  return (
    <svg className={styles.underline} viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M3 9c40-6 92-8 194-3" />
    </svg>
  );
}

export function MarginHero() {
  const ref = useRef<HTMLDivElement>(null);
  const active = useInView(ref, 0.2);

  return (
    <section ref={ref} className={styles.hero} data-active={active || undefined} aria-labelledby="margin-hero-title">
      <div className={styles.main}>
        <dl className={styles.docline}>
          <div><dt>Brief for</dt><dd>Fernwood Dental Group</dd></div>
          <div><dt>Advisor</dt><dd>Dana Ortiz</dd></div>
        </dl>
        <h1 id="margin-hero-title" className={styles.title}>Choosing HR software, with someone on your side of the table.</h1>
        <p className={styles.lede}>
          MatchMaker HR compares every approved option against your needs using{" "}
          <span className={styles.underlined}>evidence, not sales pitches<Underline /></span>, explains what the scores
          mean, and{" "}
          <span className={styles.circled}>costs you nothing<Ring /></span>.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#margin-needs">Start your needs assessment</a>
          <a className={styles.secondary} href="#margin-scorecard">Read a sample comparison</a>
        </div>
      </div>

      <aside className={styles.margin} aria-label="Advisor notes">
        <p className={styles.note} style={{ "--delay": "0.9s" } as CSSProperties}>
          <span className={styles.noteMark} aria-hidden="true">1</span>
          Software providers pay us a referral fee after you sign. It never changes a score.
        </p>
        <p className={styles.note} style={{ "--delay": "1.2s" } as CSSProperties}>
          <span className={styles.noteMark} aria-hidden="true">2</span>
          Vendor names stay hidden until we talk through your needs together.
        </p>
        <p className={styles.note} style={{ "--delay": "1.5s" } as CSSProperties}>
          <span className={styles.noteMark} aria-hidden="true">3</span>
          You sign directly with the provider you choose. We stay on your side after.
        </p>
      </aside>
    </section>
  );
}
