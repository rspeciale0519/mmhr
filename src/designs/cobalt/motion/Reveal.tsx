"use client";

import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from "react";

import { watchReveal, REVEAL_ATTRIBUTE } from "./reveal-observer";

/** How an element enters. The CSS for each lives in motion-kit.css. */
export type RevealVariant = "rise" | "fade" | "scale" | "left" | "right" | "clip";

/** Elements Reveal can render as. */
export type RevealTag =
  | "div"
  | "section"
  | "article"
  | "aside"
  | "header"
  | "footer"
  | "figure"
  | "ul"
  | "ol"
  | "li"
  | "p"
  | "span";

type RevealProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** The element to render. Default "div". */
  as?: RevealTag;
  /** Entrance style. Default "rise". */
  variant?: RevealVariant;
  /** Position in a row of siblings; each step waits 70ms longer. */
  index?: number;
  /** Extra wait before the entrance, in milliseconds. */
  delay?: number;
  children?: ReactNode;
};

/** Builds the CSS variables that time an entrance. */
export function timing(index?: number, delay?: number, stagger?: number): CSSProperties {
  const style: Record<string, string | number> = {};
  if (index !== undefined) style["--i"] = index;
  if (delay !== undefined) style["--co-delay"] = `${delay}ms`;
  if (stagger !== undefined) style["--co-stagger"] = `${stagger}ms`;
  return style as CSSProperties;
}

/** Shared body of Reveal and RevealGroup. */
function useRevealElement() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => watchReveal(ref.current), []);
  return ref;
}

/**
 * Plays an entrance when the element scrolls into view, in every browser.
 *
 * The server HTML is fully visible. After the page loads, only an element
 * that is still below the screen is hidden; it then rises (or fades, scales,
 * slides, wipes) in as it arrives. Reduced motion: always shown, no movement.
 *
 * Reveal is its own wrapper element. Put hover effects and transitions on a
 * child, not on the Reveal element, because the entrance animation owns the
 * wrapper's `animation`, `opacity`, `translate` and `scale`.
 */
export function Reveal({ as = "div", variant = "rise", index, delay, style, children, ...rest }: RevealProps) {
  const ref = useRevealElement();
  const Tag = as as "div";
  return (
    <Tag
      {...rest}
      ref={ref as RefObject<HTMLDivElement>}
      data-co-reveal=""
      data-co-variant={variant}
      style={{ ...timing(index, delay), ...style }}
    >
      {children}
    </Tag>
  );
}

/**
 * Like Reveal, but the wrapper stays still and its direct children rise in
 * one after another (`stagger` ms apart, default 70). Children get their
 * position from CSS (up to 12 steps), or from their own `--i` style.
 */
export function RevealGroup({
  as = "div",
  stagger,
  delay,
  style,
  children,
  ...rest
}: Omit<RevealProps, "variant" | "index"> & { stagger?: number }) {
  const ref = useRevealElement();
  const Tag = as as "div";
  return (
    <Tag
      {...rest}
      ref={ref as RefObject<HTMLDivElement>}
      data-co-reveal=""
      data-co-variant="group"
      style={{ ...timing(undefined, delay, stagger), ...style }}
    >
      {children}
    </Tag>
  );
}

/**
 * For markup you cannot wrap (Server Components, long lists): put
 * `data-co-reveal=""` (and optionally `data-co-variant="fade"` etc.) on any
 * element in the server HTML and render `<RevealAll />` once in the page.
 * It watches every such element present when the page mounts.
 */
export function RevealAll() {
  useEffect(() => {
    const stops = [...document.querySelectorAll(`[${REVEAL_ATTRIBUTE}]`)].map(watchReveal);
    return () => {
      for (const stopWatching of stops) stopWatching();
    };
  }, []);
  return null;
}
