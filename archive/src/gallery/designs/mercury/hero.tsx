import { useEffect, useRef } from "react";

import { vendors } from "../../kit/data";
import { createLiquid, type Drop } from "./liquid";
import styles from "./hero.module.css";

type Props = {
  selected: readonly string[];
  onToggle: (id: string) => void;
  nameOf: (id: string) => string;
  dark: boolean;
  count: number;
  max: number;
};

/** Geometry in units of R, the stage's usable radius. */
const YOU_RADIUS = 0.3;
const DOCKED = 0.37;
const farDistance = (fit: number) => 0.74 + ((92 - fit) / 24) * 0.2;
const dropRadius = (fit: number) => 0.1 + ((fit - 60) / 40) * 0.05;
const baseAngle = (index: number) => -Math.PI / 2 + (index * Math.PI * 2) / vendors.length;

/**
 * Your needs are the large drop. Each vendor is a smaller drop whose distance
 * shows its fit. Choosing a vendor pulls its drop into yours until they merge.
 */
export function MercuryHero({ selected, onToggle, nameOf, dark, count, max }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const live = useRef({ selected, dark, onToggle });
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    live.current = { selected, dark, onToggle };
    kick.current();
  });

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const renderer = createLiquid(canvas);
    stage.dataset.renderer = renderer ? "webgl" : "still";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    const distance = vendors.map((vendor) => (live.current.selected.includes(vendor.id) ? DOCKED : farDistance(vendor.fit)));
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let positions: Drop[] = [];
    let frame = 0;
    let last = 0;
    let visible = true;
    let elapsed = 0;

    const layout = (time: number, step: number) => {
      const radius = Math.min(width, height) * 0.5 * 0.86;
      const cx = width / 2 + pointer.x * radius * 0.06;
      const cy = height / 2 + pointer.y * radius * 0.06;
      const spin = reduced ? 0 : time * 0.045;
      const drops: Drop[] = [{ x: cx, y: cy, r: radius * YOU_RADIUS * (1 + (reduced ? 0 : Math.sin(time * 0.9) * 0.015)) }];
      vendors.forEach((vendor, index) => {
        const target = live.current.selected.includes(vendor.id) ? DOCKED : farDistance(vendor.fit);
        distance[index] = step >= 1 ? target : distance[index]! + (target - distance[index]!) * step;
        const angle = baseAngle(index) + spin;
        const wobble = reduced ? 0 : Math.sin(time * 1.3 + index * 1.7) * 0.012;
        const x = width / 2 - pointer.x * radius * 0.03 + Math.cos(angle) * (distance[index]! + wobble) * radius;
        const y = height / 2 - pointer.y * radius * 0.03 + Math.sin(angle) * (distance[index]! + wobble) * radius;
        drops.push({ x, y, r: radius * dropRadius(vendor.fit) });
        const label = labelRefs.current[index];
        if (label) label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      });
      positions = drops;
      return drops;
    };

    const render = (time: number, step: number) => {
      const drops = layout(time, step);
      renderer?.draw(drops, time, live.current.dark);
    };

    const loop = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      elapsed += dt;
      pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4));
      pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4));
      render(elapsed, 1 - Math.exp(-dt * 3.2));
      if (visible) frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduced) {
        render(0, 1);
        return;
      }
      if (!frame && visible) {
        last = 0;
        frame = requestAnimationFrame(loop);
      }
    };

    kick.current = start;

    const resize = () => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      renderer?.resize(width, height, Math.min(window.devicePixelRatio || 1, 1.75));
      render(elapsed, reduced ? 1 : 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const seen = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting) && document.visibilityState === "visible";
      if (visible) start();
    });
    seen.observe(stage);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = stage.getBoundingClientRect();
      pointer.tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onLeave = () => {
      pointer.tx = 0;
      pointer.ty = 0;
    };
    // Tapping a drop chooses it, like the buttons below the stage.
    const onClick = (event: MouseEvent) => {
      const rect = stage.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = positions.slice(1).findIndex((drop) => Math.hypot(drop.x - x, drop.y - y) <= Math.max(drop.r * 1.35, 24));
      if (hit >= 0) live.current.onToggle(vendors[hit]!.id);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);

    start();
    return () => {
      cancelAnimationFrame(frame);
      kick.current = () => {};
      observer.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      renderer?.dispose();
    };
  }, []);

  return (
    <section className={styles.hero} aria-labelledby="mercury-hero-title">
      <div className={styles.copy}>
        <h1 id="mercury-hero-title" className={styles.title}>Where your needs meet the right HR platform.</h1>
        <p className={styles.lede}>
          Tell us what your company needs. MatchMaker HR scores every approved platform against it, keeps vendor names
          hidden until you have talked it through with an advisor, and never charges you.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#mercury-needs">Start your needs assessment</a>
          <a className={styles.secondary} href="#mercury-scorecard">See the evidence</a>
        </div>
      </div>

      <figure className={styles.figure} aria-labelledby="mercury-stage-caption">
        <div ref={stageRef} className={styles.stage}>
          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          <div className={styles.still} aria-hidden="true" />
          {vendors.map((vendor, index) => (
            <span
              key={vendor.id}
              ref={(node) => { labelRefs.current[index] = node; }}
              className={styles.dropLabel}
              data-selected={selected.includes(vendor.id) || undefined}
              aria-hidden="true"
            >
              {vendor.masked.slice(-1)}
            </span>
          ))}
        </div>
        <figcaption id="mercury-stage-caption" className={styles.caption}>
          The large drop is your needs. Each smaller drop is a vendor from a sample comparison; closer means a better fit.
          Choose one and it flows into yours.
        </figcaption>
        <div className={styles.toggles} role="group" aria-label={`Choose contenders, ${count} of ${max} chosen`}>
          {vendors.map((vendor) => {
            const chosen = selected.includes(vendor.id);
            return (
              <button
                key={vendor.id}
                type="button"
                className={styles.toggle}
                aria-pressed={chosen}
                aria-label={`${nameOf(vendor.id)}, ${vendor.fit}% fit`}
                onClick={() => onToggle(vendor.id)}
              >
                <span className={styles.toggleLetter}>{vendor.masked.slice(-1)}</span>
                <span className={styles.toggleFit}>{vendor.fit}%</span>
              </button>
            );
          })}
        </div>
        <p className={styles.count} aria-hidden="true">
          <span className={styles.countValue}>{count}</span> of {max} chosen
        </p>
      </figure>
    </section>
  );
}
