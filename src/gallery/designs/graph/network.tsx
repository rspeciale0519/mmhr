import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { criteria, vendors } from "../../kit/data";
import styles from "./network.module.css";

type Point = { x: number; y: number; z: number };
type Node = Point & { kind: "you" | "need" | "vendor"; id: string; label: string };

const shortLabels: Record<string, string> = {
  payroll: "Payroll", benefits: "Benefits", time: "Time", aca: "ACA",
  hiring: "Hiring", mobile: "Mobile", launch: "90 days", api: "API",
};

/** Requirements sit on an inner ring, vendors on an outer ring, you at the center. */
function buildNodes(): Node[] {
  const nodes: Node[] = [{ kind: "you", id: "you", label: "You", x: 0, y: 0, z: 0 }];
  criteria.forEach((criterion, index) => {
    const angle = (index / criteria.length) * Math.PI * 2;
    nodes.push({ kind: "need", id: criterion.id, label: shortLabels[criterion.id] ?? criterion.label, x: Math.cos(angle) * 1.15, y: (index % 2 ? 0.16 : -0.16), z: Math.sin(angle) * 1.15 });
  });
  vendors.forEach((vendor, index) => {
    const angle = (index / vendors.length) * Math.PI * 2 + 0.3;
    nodes.push({ kind: "vendor", id: vendor.id, label: vendor.masked.slice(-1), x: Math.cos(angle) * 1.9, y: index % 2 ? 0.3 : -0.3, z: Math.sin(angle) * 1.9 });
  });
  return nodes;
}

type Props = { selected: readonly string[]; onToggle: (id: string) => void; nameOf: (id: string) => string };

/**
 * A 3D network of your requirements and the vendors that meet them. Strong
 * evidence (4 or 5) draws a link. Drag it, or focus it and use the arrow
 * keys, to untangle the links. Pick a requirement to see which vendors meet
 * it; choose vendors from the list or by clicking them.
 */
export function Network({ selected, onToggle, nameOf }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [need, setNeed] = useState<string | null>(null);
  const live = useRef({ selected, hovered, need, yaw: 0.4, pitch: -0.68, draw: () => {} });
  const dragging = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onToggleRef = useRef(onToggle);
  useEffect(() => { onToggleRef.current = onToggle; });

  useEffect(() => {
    live.current.selected = selected;
    live.current.hovered = hovered;
    live.current.need = need;
    live.current.draw();
  }, [selected, hovered, need]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const state = live.current;
    const nodes = buildNodes();
    let width = 0;
    let height = 0;
    let screen: (Node & { sx: number; sy: number; depth: number; scale: number })[] = [];

    const project = (point: Point) => {
      const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      const x = point.x * cy - point.z * sy;
      const z1 = point.x * sy + point.z * cy;
      const y = point.y * cp - z1 * sp;
      const z = point.y * sp + z1 * cp;
      const scale = 6 / (6 + z);
      const unit = Math.min(width, height) * 0.215;
      return { sx: width / 2 + x * unit * scale, sy: height / 2 + y * unit * scale, depth: z, scale };
    };

    const draw = () => {
      // Read colors on every draw so a theme change shows at once.
      const computed = getComputedStyle(canvas);
      const color = (name: string) => computed.getPropertyValue(name).trim();
      const ink = color("--g-ink"), accent = color("--g-accent"), line = color("--g-edge"), node = color("--g-node"), muted = color("--g-muted");
      screen = nodes.map((n) => ({ ...n, ...project(n) }));
      const at = (id: string) => screen.find((n) => n.id === id)!;
      context.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      context.clearRect(0, 0, width, height);
      context.lineCap = "round";

      // Links first, so nodes sit on top.
      for (const criterion of criteria) {
        const need = at(criterion.id);
        const you = at("you");
        context.strokeStyle = line;
        context.globalAlpha = 0.5;
        context.lineWidth = 1;
        context.beginPath(); context.moveTo(you.sx, you.sy); context.lineTo(need.sx, need.sy); context.stroke();
        for (const vendor of vendors) {
          const score = criterion.scores[vendor.id] ?? 0;
          if (score < 4) continue;
          const target = at(vendor.id);
          const lit = state.need ? state.need === criterion.id : state.selected.includes(vendor.id) || state.hovered === vendor.id;
          context.strokeStyle = lit ? accent : line;
          context.globalAlpha = lit ? 0.9 : 0.35 + (score - 4) * 0.2;
          context.lineWidth = lit ? 1.75 : 1;
          context.beginPath(); context.moveTo(need.sx, need.sy); context.lineTo(target.sx, target.sy); context.stroke();
        }
      }
      context.globalAlpha = 1;

      for (const n of [...screen].sort((a, b) => b.depth - a.depth)) {
        const chosen = n.kind === "vendor" && state.selected.includes(n.id);
        const radius = (n.kind === "you" ? 20 : n.kind === "vendor" ? 17 : 6) * n.scale;
        context.beginPath();
        context.arc(n.sx, n.sy, radius, 0, Math.PI * 2);
        context.fillStyle = n.kind === "you" ? ink : chosen ? accent : node;
        context.fill();
        context.lineWidth = n.kind === "need" ? 1.5 : 1;
        context.strokeStyle = n.kind === "need" ? accent : line;
        if (n.kind !== "you" && !chosen) context.stroke();
        context.textAlign = "center";
        context.textBaseline = "middle";
        if (n.kind === "need") {
          context.fillStyle = muted;
          context.font = `600 ${Math.round(12 * n.scale)}px ${computed.fontFamily}`;
          context.fillText(n.label, n.sx, n.sy - radius - 10 * n.scale);
        } else {
          context.fillStyle = n.kind === "you" || chosen ? color("--g-on-dark") : ink;
          context.font = `700 ${Math.round((n.kind === "you" ? 11 : 14) * n.scale)}px ${computed.fontFamily}`;
          context.fillText(n.label, n.sx, n.sy + 1);
        }
      }
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


    // Hover and click on vendor nodes.
    const pick = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const hit = screen.filter((n) => n.kind === "vendor").find((n) => Math.hypot(n.sx - x, n.sy - y) < 22 * n.scale);
      return hit?.id ?? null;
    };
    const onMove = (event: PointerEvent) => {
      if (dragging.current) {
        state.yaw += (event.clientX - dragging.current.x) * 0.008;
        state.pitch = Math.max(-1.1, Math.min(0.2, state.pitch + (event.clientY - dragging.current.y) * 0.006));
        dragging.current = { x: event.clientX, y: event.clientY, moved: true };
        draw();
        return;
      }
      const id = pick(event);
      canvas.style.cursor = id ? "pointer" : "grab";
      setHovered(id);
    };
    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      dragging.current = { x: event.clientX, y: event.clientY, moved: false };
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragging.current;
      dragging.current = null;
      if (drag && !drag.moved) {
        const id = pick(event);
        if (id) onToggleRef.current(id);
      }
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    const onLeave = () => setHovered(null);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      observer.disconnect();
      themed.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      state.draw = () => {};
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const state = live.current;
    const turns: Record<string, () => void> = {
      ArrowLeft: () => { state.yaw -= 0.15; }, ArrowRight: () => { state.yaw += 0.15; },
      ArrowUp: () => { state.pitch = Math.max(-1.1, state.pitch - 0.1); }, ArrowDown: () => { state.pitch = Math.min(0.2, state.pitch + 0.1); },
    };
    const turn = turns[event.key];
    if (!turn) return;
    event.preventDefault();
    turn();
    state.draw();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.main}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        role="img"
        aria-label="A 3D network linking your eight requirements to the six sample vendors that meet them. The list beside it has the same choices."
        onKeyDown={onKeyDown}
      />
      <div className={styles.needs} role="group" aria-label="Show the vendors that meet one requirement">
        {criteria.map((criterion) => (
          <button
            key={criterion.id}
            type="button"
            className={styles.need}
            aria-pressed={need === criterion.id}
            onClick={() => setNeed((current) => (current === criterion.id ? null : criterion.id))}
          >
            {shortLabels[criterion.id] ?? criterion.label}
          </button>
        ))}
      </div>
      <p className={styles.answer} aria-live="polite">
        {need
          ? `${criteria.find((c) => c.id === need)!.label}: strong evidence from ${vendors.filter((v) => (criteria.find((c) => c.id === need)!.scores[v.id] ?? 0) >= 4).map((v) => nameOf(v.id)).join(", ") || "no vendor yet"}.`
          : "Pick a requirement to see which vendors meet it."}
      </p>
      </div>
      <ul className={styles.list}>
        {vendors.map((vendor) => {
          const chosen = selected.includes(vendor.id);
          const strong = criteria.filter((c) => (c.scores[vendor.id] ?? 0) >= 4).length;
          return (
            <li key={vendor.id}>
              <button
                type="button"
                className={styles.vendor}
                aria-pressed={chosen}
                aria-label={`${chosen ? "Remove" : "Choose"} ${nameOf(vendor.id)} ${chosen ? "from" : "as a"} contender. ${strong} strong links.`}
                onClick={() => onToggle(vendor.id)}
                onPointerEnter={() => setHovered(vendor.id)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(vendor.id)}
                onBlur={() => setHovered(null)}
              >
                <span className={styles.badge}>{vendor.masked.slice(-1)}</span>
                <span className={styles.vendorName}>{nameOf(vendor.id)}</span>
                <span className={styles.vendorMeta}>{strong} of 8 strong</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
