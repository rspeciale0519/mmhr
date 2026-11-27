import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { WhyItsFreeBody } from "./Body";

afterEach(cleanup);

const css = readFileSync(join(process.cwd(), "src/designs/cobalt/pages/why-its-free/why-its-free.css"), "utf8");

/** The entrance variants used inside one section, in order. */
function variants(container: HTMLElement, section: string) {
  return [...container.querySelectorAll(`#${section} [data-co-reveal][data-co-variant]:not([data-co-variant="split"])`)].map((element) =>
    element.getAttribute("data-co-variant"),
  );
}

describe("why-its-free motion", () => {
  test("scroll reveals no longer depend on CSS scroll-driven animations", () => {
    // Firefox and older Safari lack animation-timeline; reveals are the
    // toolkit's IntersectionObserver Reveal instead.
    expect(css).not.toMatch(/animation-timeline|@supports\s*\(animation-timeline/);
  });

  test("cards and rows enter with the toolkit Reveal, in varied variants", () => {
    const { container } = render(<WhyItsFreeBody />);
    // Section intros are Reveal "rise" too; the cards follow them.
    expect(variants(container, "who-pays")).toEqual(["rise", "scale", "scale", "scale"]);
    expect(variants(container, "what-keeps-it-honest")).toEqual(["rise", "left", "rise", "right"]);
    expect(variants(container, "what-mmhr-does-not-do")).toEqual(["left", "left", "left", "left", "left"]);
    expect(variants(container, "ranking")).toContain("scale");
  });

  test("every card tilts with a spotlight, every row has a spotlight, decor uses Parallax", () => {
    const { container } = render(<WhyItsFreeBody />);
    expect(container.querySelectorAll(".co-tilt > .co-tilt-in.co-spot.co-wif-card")).toHaveLength(9);
    expect(container.querySelectorAll(".co-wif-not.co-spot")).toHaveLength(5);
    expect(container.querySelectorAll(".co-wif-decor .co-parallax").length).toBeGreaterThanOrEqual(6);
    expect(container.querySelector(".co-wif-decor")).toHaveAttribute("aria-hidden", "true");
  });

  test("the hero buttons lean toward the mouse, and headings keep their names", () => {
    render(<WhyItsFreeBody />);
    const start = screen.getAllByRole("link", { name: "Start your needs list" })[0]!;
    expect(start.parentElement).toHaveClass("co-mag");
    expect(screen.getByRole("link", { name: "Follow the money" }).parentElement).toHaveClass("co-mag");
    expect(screen.getByRole("heading", { level: 2, name: "Why the fee cannot change your ranking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "You pay nothing" })).toBeInTheDocument();
  });
});
