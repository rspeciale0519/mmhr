"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode, type RefObject } from "react";

import { perFrame } from "./frame";
import { FINE_POINTER, matches, motionAllowed } from "./media";

/** Where the pointer is over a surface, in px from its top-left corner. */
type PointerSpot = { x: number; y: number; width: number; height: number };

type PointerHandlers = {
  /** Called at most once per frame while a mouse moves over the surface. */
  move: (spot: PointerSpot) => void;
  /** Called when the mouse leaves; put things back. */
  leave: () => void;
};

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/**
 * Follows the mouse over `ref`'s element. Shared by Spotlight, Tilt and
 * Magnetic.
 *
 * - Only with a mouse or trackpad (`(hover: hover) and (pointer: fine)`), and
 *   only without reduced motion. Touch screens get CSS press states instead.
 * - The element is measured at most once per frame, only while hovered.
 * - `data-co-hover` is set on the element while the mouse is over it.
 * - A touch press sets `data-co-press` and the light position, so a tap
 *   still lights the surface where the finger is.
 */
function usePointer(ref: RefObject<HTMLElement | null>, handlers: PointerHandlers, light: (spot: PointerSpot) => void) {
  // The latest handlers, read inside the listeners (set after each render).
  const latest = useRef({ handlers, light });
  useEffect(() => {
    latest.current = { handlers, light };
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || !motionAllowed()) return;
    const fine = matches(FINE_POINTER);

    const spotOf = (event: PointerEvent): PointerSpot => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
    };
    const onMove = perFrame((event: PointerEvent) => {
      if (!element.hasAttribute("data-co-hover")) return;
      const spot = spotOf(event);
      latest.current.light(spot);
      latest.current.handlers.move(spot);
    });
    const onEnter = (event: PointerEvent) => {
      if (!fine || event.pointerType !== "mouse") return;
      element.setAttribute("data-co-hover", "");
      onMove(event);
    };
    const onLeave = () => {
      onMove.cancel();
      element.removeAttribute("data-co-hover");
      latest.current.handlers.leave();
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      latest.current.light(spotOf(event));
      element.setAttribute("data-co-press", "");
    };
    const onUp = () => element.removeAttribute("data-co-press");

    element.addEventListener("pointerenter", onEnter);
    element.addEventListener("pointermove", onMove, { passive: true });
    element.addEventListener("pointerleave", onLeave);
    element.addEventListener("pointerdown", onDown, { passive: true });
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    return () => {
      onMove.cancel();
      element.removeEventListener("pointerenter", onEnter);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
    };
  }, [ref]);
}

/** Writes the light position as CSS variables on `target`. */
function setLight(target: HTMLElement | null, spot: PointerSpot) {
  target?.style.setProperty("--co-mx", `${spot.x.toFixed(1)}px`);
  target?.style.setProperty("--co-my", `${spot.y.toFixed(1)}px`);
}

const noop = () => {};

type SurfaceTag = "div" | "article" | "section" | "li" | "aside" | "figure";
type SurfaceProps = Omit<HTMLAttributes<HTMLElement>, "children"> & { as?: SurfaceTag; children?: ReactNode };

/** The light layer: a soft glow under the content plus a glowing border. */
const lightLayer = <span className="co-spot-light" aria-hidden="true" />;

/**
 * A surface (card, panel, stage) with a soft light that follows the mouse,
 * plus a border that glows nearest the pointer. Put the card's own classes
 * on it: `<Spotlight className="co-gl co-card">...</Spotlight>`.
 *
 * The light sits under the content (it never covers text). On touch, a tap
 * lights the spot under the finger.
 */
export function Spotlight({ as = "div", className, children, ...rest }: SurfaceProps) {
  const ref = useRef<HTMLElement>(null);
  usePointer(ref, { move: noop, leave: noop }, (spot) => setLight(ref.current, spot));
  const Tag = as as "div";
  return (
    <Tag {...rest} ref={ref as RefObject<HTMLDivElement>} className={className ? `co-spot ${className}` : "co-spot"}>
      {lightLayer}
      {children}
    </Tag>
  );
}

/**
 * A card that tilts a few degrees toward the mouse and springs back when it
 * leaves. The outer element (`className`) never moves, so the hover area is
 * stable at the edges; the inner layer (`innerClassName`, where the card's
 * look belongs) does the tilting.
 *
 *   <Tilt innerClassName="co-gl co-card" spotlight>...</Tilt>
 */
export function Tilt({
  as = "div",
  max = 6,
  spotlight = false,
  className,
  innerClassName,
  children,
  ...rest
}: SurfaceProps & {
  /** Largest tilt in degrees. Default 6. Keep it subtle (3 to 8). */
  max?: number;
  /** Also add the Spotlight light to the tilting layer. */
  spotlight?: boolean;
  innerClassName?: string;
}) {
  const outer = useRef<HTMLElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  usePointer(
    outer,
    {
      move: ({ x, y, width, height }) => {
        const rx = (0.5 - y / Math.max(height, 1)) * 2 * max;
        const ry = (x / Math.max(width, 1) - 0.5) * 2 * max;
        inner.current?.style.setProperty("--co-rx", `${rx.toFixed(2)}deg`);
        inner.current?.style.setProperty("--co-ry", `${ry.toFixed(2)}deg`);
      },
      leave: () => {
        inner.current?.style.setProperty("--co-rx", "0deg");
        inner.current?.style.setProperty("--co-ry", "0deg");
      },
    },
    (spot) => (spotlight ? setLight(inner.current, spot) : undefined),
  );
  const innerClasses = ["co-tilt-in", spotlight ? "co-spot" : "", innerClassName ?? ""].filter(Boolean).join(" ");
  const Tag = as as "div";
  return (
    <Tag {...rest} ref={outer as RefObject<HTMLDivElement>} className={className ? `co-tilt ${className}` : "co-tilt"}>
      <div ref={inner} className={innerClasses}>
        {spotlight ? lightLayer : null}
        {children}
      </div>
    </Tag>
  );
}

/**
 * Makes a button or link lean toward the mouse (at most `max` px), then
 * spring back. Wrap one element:
 *
 *   <Magnetic><Link className="co-btn co-btn-p" href="/sign-up">Start free</Link></Magnetic>
 *
 * The wrapper is an inline-flex span that never moves (stable hover area);
 * the child moves with the CSS `translate` property, so it combines with the
 * child's own `transform` and the press squash (`scale`).
 */
export function Magnetic({
  children,
  strength = 0.3,
  max = 8,
  className,
}: {
  children: ReactNode;
  /** Share of the distance from the center the child follows. Default 0.3. */
  strength?: number;
  /** Largest move in px. Default 8. */
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  usePointer(
    ref,
    {
      move: ({ x, y, width, height }) => {
        ref.current?.style.setProperty("--co-mag-x", `${clamp((x - width / 2) * strength, max).toFixed(1)}px`);
        ref.current?.style.setProperty("--co-mag-y", `${clamp((y - height / 2) * strength, max).toFixed(1)}px`);
      },
      leave: () => {
        ref.current?.style.setProperty("--co-mag-x", "0px");
        ref.current?.style.setProperty("--co-mag-y", "0px");
      },
    },
    noop,
  );
  return (
    <span ref={ref} className={className ? `co-mag ${className}` : "co-mag"}>
      {children}
    </span>
  );
}
