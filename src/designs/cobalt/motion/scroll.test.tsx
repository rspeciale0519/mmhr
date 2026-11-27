import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { onScrollFrame, perFrame } from "./frame";
import { Parallax, useInView, useScrollProgress } from "./scroll";
import { flushFrames, installMotionDoubles, observers, setMedia } from "./test-helpers";

beforeEach(() => {
  installMotionDoubles();
  vi.stubGlobal("innerHeight", 800);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("onScrollFrame", () => {
  test("runs every read before any write, once per frame, until stopped", () => {
    const calls: string[] = [];
    const stopA = onScrollFrame({ read: () => calls.push("read a"), write: () => calls.push("write a") });
    const stopB = onScrollFrame({ read: () => calls.push("read b"), write: () => calls.push("write b") });
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(calls).toEqual(["read a", "read b", "write a", "write b"]);

    stopA();
    stopB();
    calls.length = 0;
    window.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(calls).toEqual([]);
  });

  test("perFrame hands the latest event to the handler once per frame", () => {
    const seen: number[] = [];
    const handler = perFrame((value: number) => seen.push(value));
    handler(1);
    handler(2);
    flushFrames();
    expect(seen).toEqual([2]);
  });
});

function Progress({ page = false }: { page?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollProgress(ref, { page });
  return <div ref={ref} data-testid="bar" />;
}

describe("useScrollProgress", () => {
  test("writes progress through the element as --co-progress", () => {
    // The doubles place it at top 100, 100px tall: (800 - 100) / (800 + 100).
    render(<Progress />);
    flushFrames();
    expect(screen.getByTestId("bar").style.getPropertyValue("--co-progress")).toBe((700 / 900).toFixed(4));
  });

  test("with page, writes progress through the whole page", () => {
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(2800);
    vi.stubGlobal("scrollY", 500);
    render(<Progress page />);
    flushFrames();
    expect(screen.getByTestId("bar").style.getPropertyValue("--co-progress")).toBe("0.2500");
  });
});

function Watcher() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  return <div ref={ref} data-testid="watched" data-in={String(inView)} />;
}

test("useInView reports when the element enters and leaves the screen", () => {
  render(<Watcher />);
  const element = screen.getByTestId("watched");
  expect(element).toHaveAttribute("data-in", "false");
  act(() => observers[0]!.fire(element, true));
  expect(element).toHaveAttribute("data-in", "true");
  act(() => observers[0]!.fire(element, false));
  expect(element).toHaveAttribute("data-in", "false");
});

describe("Parallax", () => {
  test("moves only while near the screen, opposite to its distance from the middle, clamped", () => {
    render(<Parallax speed={0.5} max={100} data-testid="layer" aria-hidden="true" />);
    const layer = screen.getByTestId("layer");
    expect(layer).toHaveClass("co-parallax");
    flushFrames();
    expect(layer.style.getPropertyValue("--co-parallax")).toBe("");

    act(() => observers[0]!.fire(layer, true));
    flushFrames();
    // Middle at 150px, screen middle at 400px: (150 - 400) * -0.5 = 125, clamped to 100.
    expect(layer.style.getPropertyValue("--co-parallax")).toBe("100.0px");
  });

  test("stays put with reduced motion", () => {
    setMedia({ reduce: true });
    render(<Parallax data-testid="layer" />);
    expect(observers).toEqual([]);
  });
});
