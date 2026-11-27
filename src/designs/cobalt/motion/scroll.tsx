"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";

import { onScrollFrame } from "./frame";
import { motionAllowed } from "./media";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Tracks how far the page has scrolled through an element, from 0 to 1, and
 * writes it as the CSS variable `--co-progress` on that element.
 *
 * - 0 when the element's top reaches the bottom of the screen, 1 when its
 *   bottom leaves the top. With `{ page: true }`, progress through the whole
 *   page instead (0 at the top, 1 at the bottom).
 * - Drive visuals from CSS, e.g. `scale: var(--co-progress) 1`, so React
 *   does not re-render on every frame. `onChange` is there for the rare case
 *   that needs the number in script (keep it cheap: it runs every frame).
 * - Runs on the shared frame loop: one measurement per frame, passive
 *   listeners, nothing while the page is still. Works with reduced motion too
 *   (it only reports position); decide in CSS whether anything moves.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  options: { page?: boolean; onChange?: (progress: number) => void } = {},
) {
  const { page = false } = options;
  const onChange = useRef(options.onChange);
  useEffect(() => {
    onChange.current = options.onChange;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let progress = -1;
    let next = 0;
    return onScrollFrame({
      read: () => {
        if (page) {
          const room = document.documentElement.scrollHeight - window.innerHeight;
          next = room > 0 ? clamp01(window.scrollY / room) : 0;
        } else {
          const rect = element.getBoundingClientRect();
          next = clamp01((window.innerHeight - rect.top) / (window.innerHeight + rect.height));
        }
      },
      write: () => {
        if (Math.abs(next - progress) < 0.0005) return;
        progress = next;
        element.style.setProperty("--co-progress", progress.toFixed(4));
        onChange.current?.(progress);
      },
    });
  }, [ref, page]);
}

/**
 * True while the element is on screen (or within `rootMargin` of it). Use it
 * to start and pause your own loops (canvas, timers) so nothing runs off
 * screen. With `once`, it stays true after the first time.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { once = false, rootMargin = "0px", threshold = 0 }: { once?: boolean; rootMargin?: string; threshold?: number } = {},
) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        setInView(visible);
        if (visible && once) observer.disconnect();
      },
      { rootMargin, threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, once, rootMargin, threshold]);
  return inView;
}

type ParallaxProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  as?: "div" | "span" | "figure" | "aside";
  /**
   * How much slower than the page it moves. 0.2 (default) drifts back like a
   * distant layer; negative values move faster, like a near layer.
   */
  speed?: number;
  /** Largest move in px either way. Default 120. */
  max?: number;
  children?: ReactNode;
};

/**
 * A decorative layer that scrolls at a different rate than the page, for
 * depth (glows, shapes, illustrations; not text people read).
 *
 * Moves with the CSS `translate` property only, clamped to `max`, measured on
 * the shared frame loop and only while near the screen. Reduced motion: it
 * stays put.
 */
export function Parallax({ as = "div", speed = 0.2, max = 120, className, children, ...rest }: ParallaxProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !motionAllowed() || typeof IntersectionObserver === "undefined") return;
    let offset = 0;
    let next = 0;
    let stopFrames: (() => void) | null = null;
    const task = {
      read: () => {
        const rect = element.getBoundingClientRect();
        // The rect includes the current offset; take it out to get the
        // element's natural place, then compare its middle with the screen's.
        const middle = rect.top - offset + rect.height / 2;
        next = Math.max(-max, Math.min(max, (middle - window.innerHeight / 2) * -speed));
      },
      write: () => {
        if (Math.abs(next - offset) < 0.1) return;
        offset = next;
        element.style.setProperty("--co-parallax", `${offset.toFixed(1)}px`);
      },
    };
    // Follow the scroll only while the layer is near the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const near = entries.some((entry) => entry.isIntersecting);
        if (near && !stopFrames) stopFrames = onScrollFrame(task);
        if (!near && stopFrames) {
          stopFrames();
          stopFrames = null;
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      stopFrames?.();
      element.style.removeProperty("--co-parallax");
    };
  }, [speed, max]);

  const Tag = as as "div";
  return (
    <Tag {...rest} ref={ref as RefObject<HTMLDivElement>} className={className ? `co-parallax ${className}` : "co-parallax"}>
      {children}
    </Tag>
  );
}
