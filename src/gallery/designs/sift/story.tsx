import { useEffect, useMemo, useRef } from "react";

import { vendors } from "../../kit/data";
import { useScrollProgress } from "../../kit/use-scroll-progress";
import { buildDots, MARKET_SIZE, storySteps, type Dot } from "./model";
import styles from "./story.module.css";

type Kind = "live" | "out" | "fit" | "chosen";
type Point = { x: number; y: number; r: number; kind: Kind };

const PAPER = "#f6f7fb";
const CORAL = "#ff8a75";
const LEMON = "#ffe14d";
const KLEIN = "#1e33d4";
const INK = "#0e1442";

function layout(dots: readonly Dot[], step: number, width: number, height: number, selected: readonly string[]): Point[] {
  const wide = width >= 900;
  // Wide screens keep the dots in the right half, clear of the step text.
  const area = wide ? Math.min(width * 0.22, height * 0.36) : Math.min(width * 0.36, height * 0.2);
  const cx = wide ? width - area - Math.max(32, width * 0.06) : width * 0.5;
  const cy = wide ? height * 0.5 : height * 0.33;
  const spacing = area / Math.sqrt(MARKET_SIZE);
  const dot = Math.max(2.5, spacing * 0.36);
  const gap = dot * 2.7;
  const pileLeft = wide ? cx - area : width * 0.06;
  const pileWidth = wide ? area * 2 : width * 0.88;
  const pileTop = wide ? height * 0.9 : height * 0.56;
  const columns = Math.max(1, Math.floor(pileWidth / gap));

  let live = 0;
  let aside = 0;
  return dots.map((item) => {
    const inRunning = item.out === 0 || item.out > step;
    if (step >= 4 && item.vendor) {
      const index = vendors.findIndex((vendor) => vendor.id === item.vendor);
      const fit = vendors[index]!.fit / 100;
      const x = wide ? cx - area * 0.8 + (index * area * 1.6) / 5 : cx + ((index % 3) - 1) * width * 0.3;
      const y = wide ? cy : cy + (index < 3 ? -1 : 1) * width * 0.15;
      const r = (wide ? area * 0.17 : width * 0.1) * fit;
      return { x, y, r, kind: step >= 5 && selected.includes(item.vendor) ? "chosen" : "fit" };
    }
    if (inRunning) {
      const k = live++;
      const angle = k * 2.39996;
      const radius = spacing * Math.sqrt(k + 0.5);
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, r: dot, kind: "live" };
    }
    const k = aside++;
    return {
      x: pileLeft + (k % columns) * gap + gap / 2,
      y: pileTop + (wide ? -1 : 1) * Math.floor(k / columns) * gap,
      r: dot * 0.8,
      kind: "out",
    };
  });
}

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The opening of the page: a sticky canvas of 120 dots, filtered step by step
 * as the visitor scrolls, until six fits remain. The steps are real text; the
 * canvas only illustrates them.
 */
export function SiftStory({ selected, fontFamily }: { selected: readonly string[]; fontFamily: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const dots = useMemo(() => buildDots(), []);
  const live = useRef({ progress: 0, selected, draw: () => {} });

  useEffect(() => {
    live.current.selected = selected;
    live.current.draw();
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = live.current;
    let width = 0;
    let height = 0;

    const draw = () => {
      const position = live.current.progress * (storySteps.length - 1);
      const from = Math.min(storySteps.length - 1, Math.floor(position));
      const to = Math.min(storySteps.length - 1, from + 1);
      const fraction = position - from;
      const t = reduced ? (fraction < 0.5 ? 0 : 1) : ease(Math.min(1, Math.max(0, (fraction - 0.2) / 0.6)));
      const a = layout(dots, from, width, height, live.current.selected);
      const b = layout(dots, to, width, height, live.current.selected);
      const shown = Math.round(position);
      if (counterRef.current) counterRef.current.textContent = String(storySteps[shown]!.remaining);

      context.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      context.clearRect(0, 0, width, height);
      a.forEach((start, index) => {
        const end = b[index]!;
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;
        const r = start.r + (end.r - start.r) * t;
        const kind = t < 0.5 ? start.kind : end.kind;
        context.beginPath();
        context.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
        if (kind === "out") {
          context.strokeStyle = CORAL;
          context.lineWidth = 1.25;
          context.stroke();
          return;
        }
        context.fillStyle = kind === "chosen" ? LEMON : PAPER;
        context.fill();
        const vendor = dots[index]!.vendor;
        if ((kind === "fit" || kind === "chosen") && vendor && r > 16) {
          const data = vendors.find((item) => item.id === vendor)!;
          context.fillStyle = kind === "chosen" ? INK : KLEIN;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.font = `700 ${Math.round(r * 0.62)}px ${fontFamily}`;
          context.fillText(data.masked.slice(-1), x, y - r * 0.14);
          context.font = `600 ${Math.max(10, Math.round(r * 0.26))}px ${fontFamily}`;
          context.fillText(`${data.fit}%`, x, y + r * 0.42);
        }
      });
    };

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw();
    };
    state.draw = draw;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => {
      observer.disconnect();
      state.draw = () => {};
    };
  }, [dots, fontFamily]);

  useScrollProgress(sectionRef, (progress) => {
    live.current.progress = progress;
    live.current.draw();
  });

  return (
    <section ref={sectionRef} className={styles.story} aria-labelledby="sift-hero-title">
      <div className={styles.sticky} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.canvas} />
        <p className={styles.counter}><span ref={counterRef}>{MARKET_SIZE}</span><span className={styles.counterLabel}>in the running</span></p>
      </div>
      <ol className={styles.steps}>
        {storySteps.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <div className={styles.card}>
              {index === 0 ? (
                <>
                  <h1 id="sift-hero-title" className={styles.heroTitle}>From every HR platform to the five worth your time.</h1>
                  <p className={styles.text}>
                    MatchMaker HR checks every approved platform against your needs, so you only meet the ones that fit.
                    Free for your company. Scroll to watch a sample search.
                  </p>
                  <div className={styles.actions}>
                    <a className={styles.primary} href="#sift-needs">Start your needs assessment</a>
                    <a className={styles.secondary} href="#sift-scorecard">Skip to the scorecard</a>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.stepCount}>Step {index} of {storySteps.length - 1}</p>
                  <h2 className={styles.stepTitle}>{step.title}</h2>
                  <p className={styles.text}>{step.body}</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
