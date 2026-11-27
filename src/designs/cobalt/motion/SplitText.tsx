"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

import { timing } from "./Reveal";
import { REVEAL_ATTRIBUTE, watchReveal } from "./reveal-observer";

type SplitTextProps = {
  /** The sentence. Plain text only, so the words can be split safely. */
  text: string;
  /** The element to render. Default "h2". */
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /**
   * "load": plays as soon as the page paints (pure CSS, also without
   * JavaScript). Use for the h1 and anything at the top of the page.
   * "view" (default): plays when it scrolls into view, like Reveal.
   */
  trigger?: "load" | "view";
  /** Wait before the first word, in milliseconds. */
  delay?: number;
  /** Time between words, in milliseconds. Default 45. */
  stagger?: number;
  id?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * A headline whose words rise into place one after another, each from
 * behind its own invisible edge (a "masked rise").
 *
 * Accessibility and search: the words stay real text in the element, in
 * order, with the real spaces between them, so `textContent`, the accessible
 * name, find-in-page, copy and search engines all see the plain sentence
 * once. No aria-label tricks, no duplicate hidden copy.
 *
 * No layout shift: each word is an inline-block of its own natural size,
 * and the movement is `translate` inside a clip, so the heading occupies
 * exactly the same lines and height before, during and after.
 *
 * Reduced motion: the words simply appear.
 */
export function SplitText({ text, as = "h2", trigger = "view", delay, stagger, id, className, style }: SplitTextProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (trigger === "view" ? watchReveal(ref.current) : undefined), [trigger]);

  // "a b  c" -> ["a", " ", "b", "  ", "c"]: words and the spaces between.
  let word = 0;
  const parts = text.split(/(\s+)/).map((part, index) => {
    if (part === "" || /^\s+$/.test(part)) return part;
    const position = word++;
    return (
      <span className="co-split-w" key={index} style={{ ["--w" as string]: position }}>
        <span className="co-split-i">{part}</span>
      </span>
    );
  });

  const triggerProps = trigger === "load" ? { "data-co-split": "load" } : { [REVEAL_ATTRIBUTE]: "", "data-co-variant": "split" };

  // One concrete tag for the type checker; React renders whichever `as` is.
  const Tag = as as "h2";
  return (
    <Tag
      ref={ref as RefObject<HTMLHeadingElement>}
      id={id}
      className={className ? `co-split ${className}` : "co-split"}
      {...triggerProps}
      style={{ ...timing(undefined, delay, stagger), ...style }}
    >
      {parts}
    </Tag>
  );
}
