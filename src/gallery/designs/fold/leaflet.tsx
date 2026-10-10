import { useRef, type CSSProperties } from "react";

import { journey } from "../../kit/data";
import { useScrollProgress } from "../../kit/use-scroll-progress";
import styles from "./leaflet.module.css";

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * A five-panel leaflet. As the section scrolls past, each panel swings open
 * from the one before it, one crease at a time. Wide screens open sideways;
 * narrow screens open downward. Without motion it lies fully open. The
 * drawing is decorative; screen readers get the steps as a list.
 */
export function Leaflet() {
  const trackRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);

  useScrollProgress(trackRef, (progress) => {
    const desk = deskRef.current;
    if (!desk) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let opened = 0;
    for (let fold = 1; fold < journey.length; fold += 1) {
      const amount = reduced ? 1 : ease(Math.min(1, Math.max(0, progress * 1.15 * (journey.length - 1) - (fold - 1))));
      opened += amount;
      const panel = desk.querySelector<HTMLElement>(`[data-panel="${fold}"]`);
      if (!panel) continue;
      panel.style.setProperty("--u", amount.toFixed(3));
      // Only one panel turns at a time. Its blank back shows until it passes upright,
      // which also covers renderers that ignore backface-visibility.
      panel.dataset.face = amount === 0 ? "none" : amount < 0.5 ? "back" : "front";
    }
    desk.style.setProperty("--opened", opened.toFixed(3));
  });

  return (
    <>
      <div ref={trackRef} className={styles.track}>
        <div className={styles.sticky}>
          <div ref={deskRef} className={styles.desk} aria-hidden="true">
            <div className={styles.leaflet}>
              {journey.map((step, index) => (
                <div
                  key={step.title}
                  className={styles.panel}
                  data-panel={index}
                  data-face={index === 0 ? "front" : "none"}
                  style={{ "--k": index, "--u": index === 0 ? 1 : 0 } as CSSProperties}
                >
                  <div className={styles.paper}>
                    <span className={styles.number}>{index + 1}</span>
                    <h3 className={styles.title}>{step.title}</h3>
                    <p className={styles.text}>{step.body}</p>
                  </div>
                  <div className={styles.back} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <ol className={styles.srList}>
        {journey.map((step) => <li key={step.title}>{step.title}. {step.body}</li>)}
      </ol>
    </>
  );
}
