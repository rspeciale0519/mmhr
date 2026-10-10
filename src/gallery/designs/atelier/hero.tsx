import { useRef } from "react";

import { useInView } from "../../kit/use-in-view";
import styles from "./hero.module.css";

/** Concentric engraved waves, drawn once as a static ornament. */
function Engraving() {
  const rings = Array.from({ length: 14 }, (_, index) => 60 + index * 26);
  return (
    <svg className={styles.engraving} viewBox="-400 -400 800 800" aria-hidden="true">
      {rings.map((radius, index) => (
        <path
          key={radius}
          d={Array.from({ length: 73 }, (_, step) => {
            const angle = (step / 72) * Math.PI * 2;
            const wave = radius + Math.sin(angle * 12 + index * 0.6) * (4 + index * 0.4);
            return `${step === 0 ? "M" : "L"}${(Math.cos(angle) * wave).toFixed(1)} ${(Math.sin(angle) * wave).toFixed(1)}`;
          }).join(" ") + "Z"}
        />
      ))}
    </svg>
  );
}

export function AtelierHero() {
  const ref = useRef<HTMLElement>(null);
  const active = useInView(ref, 0.2);

  return (
    <section ref={ref} className={styles.hero} data-active={active || undefined} aria-labelledby="atelier-hero-title">
      <Engraving />
      <div className={styles.crest} aria-hidden="true">
        <span className={styles.monogram}>MM</span>
        <span className={styles.sheen} />
      </div>
      <h1 id="atelier-hero-title" className={styles.title}>Private counsel for choosing HR software.</h1>
      <p className={styles.lede}>
        An advisor who knows the market studies your needs, compares every approved platform on the evidence, and stays
        beside you until you sign. There is no fee to you, ever.
      </p>
      <div className={styles.actions}>
        <a className={styles.primary} href="#atelier-needs">Begin your needs assessment</a>
        <a className={styles.secondary} href="#atelier-scorecard">View a sample assessment</a>
      </div>
    </section>
  );
}
