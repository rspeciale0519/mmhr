import { useRef } from "react";

import { useCountUp } from "../../kit/use-count-up";
import { useInView } from "../../kit/use-in-view";
import styles from "./hero.module.css";

const criteriaChips = [
  { label: "Payroll", x: 8, y: 22 },
  { label: "Benefits", x: 74, y: 10 },
  { label: "ACA reporting", x: 70, y: 84 },
  { label: "Mobile", x: 4, y: 76 },
];

/** Two circles drift together; their overlap becomes the fit score. */
export function OrbitHero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const active = useInView(stageRef);
  const fit = useCountUp(92, 1700, 350, active);

  return (
    <section className={styles.hero} aria-labelledby="orbit-hero-title">
      <div className={styles.copy}>
        <h1 id="orbit-hero-title" className={styles.title}>Find the HR platform that actually fits.</h1>
        <p className={styles.lede}>
          MatchMaker HR measures every approved option against your needs, keeps vendor names hidden until you have
          talked it through, and costs you nothing.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#orbit-needs">Start your needs assessment</a>
          <a className={styles.secondary} href="#orbit-scorecard">See a sample comparison</a>
        </div>
        <p className={styles.note}>No fees for customers. Vendors pay a referral fee that never affects scores.</p>
      </div>

      <figure className={styles.visual} aria-labelledby="orbit-visual-caption">
        <div ref={stageRef} className={styles.stage} data-active={active || undefined}>
          <svg className={styles.svg} viewBox="0 0 400 400" role="img" aria-label={`Your needs and Vendor A overlap with a ${fit}% fit`}>
            <defs>
              <clipPath id="orbit-needs-clip">
                <circle className={styles.needsShape} cx="152" cy="200" r="104" />
              </clipPath>
              <radialGradient id="orbit-overlap" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="var(--o-tangerine)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="var(--o-tangerine)" stopOpacity="0.55" />
              </radialGradient>
            </defs>
            <circle className={styles.track} cx="200" cy="200" r="182" />
            <circle className={styles.needs} cx="152" cy="200" r="104" />
            <circle className={styles.vendor} cx="248" cy="200" r="104" />
            <g clipPath="url(#orbit-needs-clip)">
              <circle className={styles.overlap} cx="248" cy="200" r="104" fill="url(#orbit-overlap)" />
            </g>
            <text className={styles.ringLabel} x="96" y="200" textAnchor="middle">Your needs</text>
            <text className={styles.ringLabel} x="304" y="200" textAnchor="middle">Vendor A</text>
          </svg>
          <p className={styles.score} aria-hidden="true">
            <span className={styles.scoreValue}>{fit}</span>
            <span className={styles.scoreUnit}>% fit</span>
          </p>
          {criteriaChips.map((chip) => (
            <span key={chip.label} className={styles.chip} style={{ left: `${chip.x}%`, top: `${chip.y}%` }}>{chip.label}</span>
          ))}
        </div>
        <figcaption id="orbit-visual-caption" className={styles.caption}>
          Sample fit for Fernwood Dental Group. Names stay hidden until your advisor reviews your needs with you.
        </figcaption>
      </figure>
    </section>
  );
}
