import { useEffect, useRef, type CSSProperties } from "react";

import { caseSummary, criteria, vendors } from "../../kit/data";
import styles from "./space.module.css";

type Props = { selected: readonly string[]; nameOf: (id: string) => string };

/**
 * Glass panes float at different depths. The view leans gently toward the
 * pointer, so nearer panes move more than far ones. It is decorative; the
 * same content appears in the scorecard and case sections below.
 */
export function VistaSpace({ selected, nameOf }: Props) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const space = spaceRef.current;
    if (!scene || !space || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;
    const tick = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      space.style.setProperty("--tilt-x", `${(current.y * -7).toFixed(2)}deg`);
      space.style.setProperty("--tilt-y", `${(current.x * 9).toFixed(2)}deg`);
      frame = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = scene.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      target.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const top = vendors.slice(0, 4);
  const needs = criteria.filter((criterion) => criterion.weight === "Must have");

  return (
    <div ref={sceneRef} className={styles.scene} aria-hidden="true">
      <div ref={spaceRef} className={styles.space}>
        <div className={styles.pane} data-depth="far" style={{ "--z": -160, "--x": 2, "--y": 6 } as CSSProperties}>
          <p className={styles.paneTitle}>Your must-haves</p>
          <ul className={styles.checks}>
            {needs.map((criterion) => <li key={criterion.id}>{criterion.label}</li>)}
          </ul>
        </div>

        <div className={styles.pane} data-depth="mid" style={{ "--z": 0, "--x": 26, "--y": 30 } as CSSProperties}>
          <p className={styles.paneTitle}>Best fits so far</p>
          <ul className={styles.fits}>
            {top.map((vendor) => (
              <li key={vendor.id} data-chosen={selected.includes(vendor.id) || undefined}>
                <span className={styles.fitName}>{nameOf(vendor.id)}</span>
                <span className={styles.fitBar}><i style={{ width: `${vendor.fit}%` }} /></span>
                <span className={styles.fitValue}>{vendor.fit}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.pane} data-depth="near" style={{ "--z": 110, "--x": 4, "--y": 66 } as CSSProperties}>
          <p className={styles.advisor}><span className={styles.avatar}>DO</span>{caseSummary.advisor}, your advisor</p>
          <p className={styles.note}>I reviewed your needs. Want to talk through the four contenders on Thursday?</p>
        </div>

        <div className={styles.chip} style={{ "--z": 190, "--x": 60, "--y": 82 } as CSSProperties}>
          <span className={styles.dot} />
          Next step: {caseSummary.nextAction}
        </div>
      </div>
    </div>
  );
}
