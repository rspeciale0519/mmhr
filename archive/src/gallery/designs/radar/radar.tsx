import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { criteria, vendors } from "../../kit/data";
import styles from "./radar.module.css";

const shortLabels: Record<string, string> = {
  payroll: "Payroll", benefits: "Benefits", time: "Time", aca: "ACA",
  hiring: "Hiring", mobile: "Mobile", launch: "90 days", api: "API",
};

type Props = { selected: readonly string[]; onToggle: (id: string) => void; nameOf: (id: string) => string };

/**
 * One radar chart per vendor, stacked in 3D like sheets of glass. Collapse the
 * stack to overlay the shapes and compare them directly. Drag to turn it, or
 * focus it and use the arrow keys.
 */
export function RadarStack({ selected, onToggle, nameOf }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stacked, setStacked] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const live = useRef({ selected, focus, stacked, spread: 1, yaw: -0.55, pitch: -0.62, draw: () => {} });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    Object.assign(live.current, { selected, focus, stacked });
    live.current.draw();
  }, [selected, focus, stacked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const state = live.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;

    const project = (x: number, y: number, z: number) => {
      const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      const x1 = x * cy - y * sy;
      const y1 = x * sy + y * cy;
      const y2 = y1 * cp - z * sp;
      const z2 = y1 * sp + z * cp;
      const scale = 4 / (4 + y2 * 0.4);
      const unit = Math.min(width, height * 1.15) * 0.26;
      return { sx: width / 2 + x1 * unit * scale, sy: height / 2 - z2 * unit * scale, depth: y2 };
    };

    const draw = () => {
      const computed = getComputedStyle(canvas);
      const color = (name: string) => computed.getPropertyValue(name).trim();
      const accent = color("--r-accent"), grid = color("--r-grid"), muted = color("--r-muted"), idle = color("--r-idle");
      context.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      context.clearRect(0, 0, width, height);
      const axes = criteria.length;
      const corner = (index: number, radius: number, z: number) => {
        const angle = (index / axes) * Math.PI * 2 - Math.PI / 2;
        return project(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      };
      const levelZ = (index: number) => (index - (vendors.length - 1) / 2) * 0.36 * state.spread;

      // Spokes and rings on the floor plane under the stack.
      const floor = levelZ(0) - 0.05;
      context.lineWidth = 1;
      context.strokeStyle = grid;
      for (let ring = 1; ring <= 5; ring += 1) {
        context.beginPath();
        for (let i = 0; i <= axes; i += 1) {
          const p = corner(i % axes, ring / 5, floor);
          if (i === 0) context.moveTo(p.sx, p.sy); else context.lineTo(p.sx, p.sy);
        }
        context.stroke();
      }
      criteria.forEach((criterion, i) => {
        const centre = project(0, 0, floor), end = corner(i, 1, floor), label = corner(i, 1.18, floor);
        context.beginPath(); context.moveTo(centre.sx, centre.sy); context.lineTo(end.sx, end.sy); context.stroke();
        context.fillStyle = muted;
        context.font = `600 12px ${computed.fontFamily}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(shortLabels[criterion.id] ?? criterion.label, label.sx, label.sy);
      });

      // One shape per vendor. Chosen and focused shapes are drawn in the accent.
      vendors.forEach((vendor, index) => {
        const z = levelZ(index);
        const chosen = state.selected.includes(vendor.id);
        const focused = state.focus === vendor.id;
        const dim = state.focus !== null && !focused;
        context.beginPath();
        criteria.forEach((criterion, i) => {
          const score = criterion.scores[vendor.id] ?? 0;
          const p = corner(i, Math.max(0.06, score / 5), z);
          if (i === 0) context.moveTo(p.sx, p.sy); else context.lineTo(p.sx, p.sy);
        });
        context.closePath();
        context.globalAlpha = dim ? 0.04 : chosen || focused ? 0.26 : 0.05;
        context.fillStyle = chosen || focused ? accent : idle;
        context.fill();
        context.globalAlpha = dim ? 0.18 : chosen || focused ? 1 : 0.55;
        context.lineWidth = focused ? 2.25 : chosen ? 1.75 : 1;
        context.strokeStyle = chosen || focused ? accent : idle;
        context.stroke();
        context.globalAlpha = 1;
        if (state.spread > 0.5) {
          const tag = corner(0, 1.05, z);
          context.fillStyle = chosen || focused ? accent : muted;
          context.font = `700 12px ${computed.fontFamily}`;
          context.textAlign = "start";
          context.fillText(vendor.masked.slice(-1), tag.sx + 10, tag.sy);
        }
      });
    };
    state.draw = draw;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    // Colors come from the theme, so redraw when the theme changes.
    const themed = new MutationObserver(() => state.draw());
    const themeRoot = canvas.closest("[data-theme]");
    if (themeRoot) themed.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });

    // Ease the stack open or closed when the view changes.
    let last = 0;
    let visible = false;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const target = state.stacked ? 1 : 0;
      state.spread += (target - state.spread) * (1 - Math.exp(-dt * 6));
      draw();
      frame = visible ? requestAnimationFrame(tick) : 0;
    };
    const seen = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && !reduced && !frame) { last = 0; frame = requestAnimationFrame(tick); }
    });
    seen.observe(canvas);
    if (reduced) {
      const sync = () => { state.spread = state.stacked ? 1 : 0; draw(); };
      state.draw = () => { sync(); };
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themed.disconnect();
      seen.disconnect();
      state.draw = () => {};
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const state = live.current;
    state.yaw += (event.clientX - drag.current.x) * 0.008;
    state.pitch = Math.max(-1.2, Math.min(-0.3, state.pitch + (event.clientY - drag.current.y) * 0.006));
    drag.current = { x: event.clientX, y: event.clientY };
    state.draw();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const state = live.current;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => { state.yaw -= 0.15; }, ArrowRight: () => { state.yaw += 0.15; },
      ArrowUp: () => { state.pitch = Math.max(-1.2, state.pitch - 0.1); }, ArrowDown: () => { state.pitch = Math.min(-0.3, state.pitch + 0.1); },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
    state.draw();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.view}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          tabIndex={0}
          role="img"
          aria-label="Six radar charts, one per sample vendor, stacked in 3D. The list beside it has each vendor's fit."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className={styles.mode} aria-pressed={!stacked} onClick={() => setStacked((value) => !value)}>
          {stacked ? "Overlay the shapes" : "Stack the shapes"}
        </button>
      </div>
      <ul className={styles.list}>
        {vendors.map((vendor) => {
          const chosen = selected.includes(vendor.id);
          return (
            <li key={vendor.id}>
              <button
                type="button"
                className={styles.vendor}
                aria-pressed={chosen}
                aria-label={`${chosen ? "Remove" : "Choose"} ${nameOf(vendor.id)} ${chosen ? "from" : "as a"} contender, ${vendor.fit}% fit`}
                onClick={() => onToggle(vendor.id)}
                onPointerEnter={() => setFocus(vendor.id)}
                onPointerLeave={() => setFocus(null)}
                onFocus={() => setFocus(vendor.id)}
                onBlur={() => setFocus(null)}
              >
                <span className={styles.swatch} aria-hidden="true" />
                <span className={styles.vendorName}>{nameOf(vendor.id)}</span>
                <span className={styles.vendorFit}>{vendor.fit}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
