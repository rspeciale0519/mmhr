import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { vendors } from "../../kit/data";
import styles from "./hero.module.css";

const FLUTES = 18;

/**
 * Fluted privacy glass. The scene is drawn once per flute; each copy is
 * stretched around its flute's center, which reads as refraction. Moving a
 * pointer or finger across the glass clears the nearest flutes.
 */
function Fluted({ children }: { children: ReactNode }) {
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const flutes = Array.from(pane.querySelectorAll<HTMLElement>("[data-flute]"));
    const clearAround = (center: number | null) => {
      flutes.forEach((flute, index) => {
        const clear = center === null ? 0 : Math.max(0, 1 - Math.abs(index - center) / 2.4);
        flute.style.setProperty("--clear", clear.toFixed(3));
      });
    };
    const onMove = (event: PointerEvent) => {
      const rect = pane.getBoundingClientRect();
      clearAround(((event.clientX - rect.left) / rect.width) * FLUTES - 0.5);
    };
    const onLeave = () => clearAround(null);
    pane.addEventListener("pointermove", onMove);
    pane.addEventListener("pointerleave", onLeave);
    pane.addEventListener("pointercancel", onLeave);

    // One slow sweep the first time the glass comes into view.
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || reduced) return;
      seen.disconnect();
      let start = 0;
      const sweep = (time: number) => {
        if (!start) start = time;
        const progress = Math.min(1, (time - start) / 2400);
        clearAround(progress >= 1 ? null : -3 + progress * (FLUTES + 6));
        if (progress < 1) frame = requestAnimationFrame(sweep);
      };
      frame = requestAnimationFrame(sweep);
    }, { threshold: 0.5 });
    seen.observe(pane);

    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      pane.removeEventListener("pointermove", onMove);
      pane.removeEventListener("pointerleave", onLeave);
      pane.removeEventListener("pointercancel", onLeave);
    };
  }, []);

  return (
    <div ref={paneRef} className={styles.pane} style={{ "--n": FLUTES } as CSSProperties}>
      {Array.from({ length: FLUTES }, (_, index) => (
        <div key={index} className={styles.flute} data-flute="" style={{ "--i": index } as CSSProperties} aria-hidden="true">
          <div className={styles.scene}>{children}</div>
        </div>
      ))}
    </div>
  );
}

export function ReededHero() {
  return (
    <section className={styles.hero} aria-labelledby="reeded-hero-title">
      <div className={styles.copy}>
        <h1 id="reeded-hero-title" className={styles.title}>See the evidence first. Meet the names later.</h1>
        <p className={styles.lede}>
          MatchMaker HR compares every approved HR platform against your needs with the vendor names masked, so the
          evidence decides. Your advisor reveals the names after you talk it through. You never pay us.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#reeded-needs">Start your needs assessment</a>
          <a className={styles.secondary} href="#reeded-scorecard">Open the sample scorecard</a>
        </div>
      </div>

      <figure className={styles.figure} aria-labelledby="reeded-glass-caption">
        <Fluted>
          <span className={styles.sun} />
          <span className={styles.orb} />
          <ol className={styles.rows}>
            {vendors.map((vendor) => (
              <li key={vendor.id} className={styles.row}>
                <span className={styles.letter}>{vendor.masked.slice(-1)}</span>
                <span className={styles.bar}><i style={{ width: `${vendor.fit}%` }} /></span>
                <span className={styles.fit}>{vendor.fit}</span>
              </li>
            ))}
          </ol>
        </Fluted>
        <figcaption id="reeded-glass-caption" className={styles.caption}>
          Behind the glass are six fits from a sample search, from 92% down to 68%. Move across the glass to look
          closer. Names stay masked until you meet your advisor.
        </figcaption>
      </figure>
    </section>
  );
}
