import type { CSSProperties, ReactNode } from "react";

/**
 * Small line drawings for the six steps (home page stepper, SixSteps.tsx).
 * Pure decoration: the step's title and text say the same thing in words,
 * so the drawing is hidden from screen readers.
 *
 * Every stroke has `pathLength={1}`, so home.css can draw it from 0 to 1
 * with one stroke-dash rule whatever its real length. `--d` orders the
 * strokes: each one starts a little after the one before. Filled shapes
 * (class "co-g-f") pop in instead. A new step remounts its drawing (React
 * `key`), which replays the drawing. Reduced motion: drawn at once.
 */

/** One stroke that draws itself; `d` is its order in the drawing. */
function Line({ d, order, ...rest }: { d: string; order: number; opacity?: number }) {
  return <path className="co-g-d" d={d} pathLength={1} style={{ ["--d" as string]: order } as CSSProperties} {...rest} />;
}

/** A filled shape that pops in, in `order`. */
function Pop({ order, children }: { order: number; children: ReactNode }) {
  return (
    <g className="co-g-f" style={{ ["--d" as string]: order } as CSSProperties}>
      {children}
    </g>
  );
}

const drawings: ReactNode[] = [
  // 01 Share your needs: a checklist (size, modules, must-haves, timeline).
  <>
    <Line order={0} d="M34 20h52a8 8 0 0 1 8 8v66a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8Z" />
    {[40, 56, 72, 88].map((y, i) => (
      <g key={y}>
        <Line order={1 + i} d={`M38 ${y}l4 4 8-9`} />
        <Line order={1.5 + i} d={`M58 ${y + 1}h24`} opacity={0.55} />
      </g>
    ))}
  </>,
  // 02 Compare masked: score bars of different lengths, names blocked out.
  <>
    {[34, 56, 78].map((y, i) => (
      <g key={y}>
        <Pop order={i}>
          <rect x="20" y={y - 6} width="22" height="12" rx="4" fill="currentColor" opacity="0.35" />
        </Pop>
        <Line order={0.5 + i} d={`M52 ${y}h${[48, 38, 28][i]}`} />
      </g>
    ))}
    <Line order={3.5} d="M20 98h80" opacity={0.4} />
  </>,
  // 03 Advisor review: a padlock whose shackle lifts open.
  <>
    <Line order={0} d="M34 56h52a6 6 0 0 1 6 6v32a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V62a6 6 0 0 1 6-6Z" />
    <g className="co-g-lift">
      <Line order={1} d="M44 56V42a16 16 0 0 1 32 0v4" />
    </g>
    <Pop order={2.5}>
      <circle cx="60" cy="74" r="5" fill="currentColor" />
    </Pop>
    <Line order={3} d="M60 79v8" />
  </>,
  // 04 Pick up to five: five slots, filled one after another.
  <>
    {[22, 41, 60, 79, 98].map((x, i) => (
      <g key={x}>
        <Line order={i * 0.6} d={`M${x} 52a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z`} />
        <Pop order={1 + i * 0.6}>
          <circle cx={x} cy="60" r="4.5" fill="currentColor" />
        </Pop>
      </g>
    ))}
    <Line order={4} d="M18 84h84" opacity={0.4} />
  </>,
  // 05 One approved RFP: a document with a check, on its way.
  <>
    <Line order={0} d="M34 18h36l18 18v62a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6Z" />
    <Line order={0.8} d="M70 18v18h18" />
    <Line order={1.4} d="M40 52h36M40 64h28" opacity={0.55} />
    <Line order={2.4} d="M44 84l8 8 16-18" />
  </>,
  // 06 Sign direct: a signature written over its line.
  <>
    <Line order={0} d="M16 92h88" opacity={0.45} />
    <Line order={0.6} d="M22 78c8-24 16-40 22-36s-8 34-4 38 12-26 18-24-2 20 4 20 10-14 16-14 4 10 10 10 10-6 14-8" />
    <Line order={2.6} d="M84 34l10 10-30 30-12 3 3-12Z" opacity={0.7} />
  </>,
];

/** The drawing for step `index` (0 to 5). */
export function StepGlyph({ index }: { index: number }) {
  return (
    <svg
      aria-hidden="true"
      className="co-glyph"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      viewBox="0 0 120 120"
    >
      {drawings[index]}
    </svg>
  );
}
