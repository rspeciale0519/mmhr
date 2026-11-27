import { vi } from "vitest";

/**
 * Test doubles shared by the motion toolkit tests (not shipped to the
 * browser: only *.test.tsx files import this).
 */

/** Every IntersectionObserver the code under test created, newest last. */
export const observers: FakeObserver[] = [];

export class FakeObserver {
  elements: Element[] = [];
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(element: Element) {
    this.elements.push(element);
  }
  unobserve(element: Element) {
    this.elements = this.elements.filter((item) => item !== element);
  }
  disconnect() {
    this.elements = [];
  }
  /** Pretends `element` scrolled into (or out of) view. */
  fire(element: Element, isIntersecting = true) {
    this.callback([{ target: element, isIntersecting } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

/** All elements currently observed by any fake observer. */
export const observed = () => observers.flatMap((observer) => observer.elements);

/** Sets which media queries match: reduced motion and/or a fine pointer. */
export function setMedia({ reduce = false, fine = true }: { reduce?: boolean; fine?: boolean } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: (query.includes("reduce") && reduce) || (query.includes("pointer: fine") && fine),
  }));
}

/** Animation frames run when `flushFrames()` is called. */
let frames: FrameRequestCallback[] = [];
export function flushFrames(time = performance.now()) {
  const pending = frames;
  frames = [];
  for (const frame of pending) frame(time);
}

/**
 * Puts the usual doubles in place: fake observers, manual animation frames,
 * no reduced motion, a fine pointer, and elements below the screen when
 * their data-testid includes "below" (top 5000px) or on screen otherwise.
 */
export function installMotionDoubles() {
  observers.length = 0;
  frames = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  setMedia();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const below = this.closest("[data-testid*='below']") !== null;
    const top = below ? 5000 : 100;
    return { top, bottom: top + 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: top, toJSON: () => ({}) };
  });
}
