import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { flushFrames, installMotionDoubles, setMedia } from "../motion/test-helpers";
import { CobaltNav } from "./Nav";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

afterEach(cleanup);

function renderNavAt(pathname: string) {
  vi.mocked(usePathname).mockReturnValue(pathname);
  return render(<CobaltNav />);
}

const menuButton = () => screen.getByRole("button", { name: "Menu" });

describe("top menu links", () => {
  test("lists the four menu pages in order, with both account actions", () => {
    renderNavAt("/");
    const primary = screen.getByRole("navigation", { name: "Primary navigation" });
    const links = within(primary).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["How it works", "/how-it-works"],
      ["Why it's free", "/why-its-free"],
      ["For providers", "/for-providers"],
      ["Resources", "/resources"],
    ]);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/sign-up");
    // The blog is not linked until it is built and unblocked.
    expect(screen.queryByRole("link", { name: /blog/i })).toBeNull();
  });

  test.each([
    ["/how-it-works", "How it works"],
    ["/why-its-free", "Why it's free"],
    ["/for-providers", "For providers"],
    ["/resources", "Resources"],
  ])("marks only the active page on %s", (pathname, label) => {
    renderNavAt(pathname);
    const primary = screen.getByRole("navigation", { name: "Primary navigation" });
    const current = within(primary).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  test("marks no menu link on the home page or a page outside the menu", () => {
    for (const pathname of ["/", "/contact"]) {
      renderNavAt(pathname);
      const primary = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(within(primary).getAllByRole("link").some((link) => link.hasAttribute("aria-current"))).toBe(false);
      cleanup();
    }
  });
});

describe("phone menu", () => {
  test("starts closed, with the button pointing at the hidden panel", () => {
    renderNavAt("/");
    const button = menuButton();
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Site menu" })).toBeNull();
  });

  test("opens a panel with the four links and both actions", () => {
    renderNavAt("/why-its-free");
    fireEvent.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(menuButton().getAttribute("aria-controls") ?? "")!;
    expect(panel).toBeVisible();
    const menu = within(panel).getByRole("navigation", { name: "Site menu" });
    expect(within(menu).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/how-it-works",
      "/why-its-free",
      "/for-providers",
      "/resources",
    ]);
    expect(within(menu).getByRole("link", { name: "Why it's free" })).toHaveAttribute("aria-current", "page");
    expect(within(panel).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(within(panel).getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/sign-up");
  });

  test("closes on Escape and returns focus to the button", () => {
    renderNavAt("/");
    fireEvent.click(menuButton());
    const panelLink = within(screen.getByRole("navigation", { name: "Site menu" })).getByRole("link", { name: "Resources" });
    panelLink.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(menuButton()).toHaveFocus();
  });

  test("closes when the button is pressed again", () => {
    renderNavAt("/");
    fireEvent.click(menuButton());
    fireEvent.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("closes when a link in the panel is chosen", () => {
    renderNavAt("/resources");
    fireEvent.click(menuButton());
    const link = within(screen.getByRole("navigation", { name: "Site menu" })).getByRole("link", { name: "Resources" });
    // Stop the browser-level navigation; the menu's own click handler still runs.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("closes when the route changes", () => {
    const view = renderNavAt("/");
    fireEvent.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    vi.mocked(usePathname).mockReturnValue("/for-providers");
    view.rerender(<CobaltNav />);
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("closes on a tap outside the menu bar, but not on a tap inside it", () => {
    renderNavAt("/");
    fireEvent.click(menuButton());
    fireEvent.pointerDown(screen.getByRole("navigation", { name: "Site menu" }));
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("menu motion", () => {
  /** Runs the shared scroll loop after moving the page to `y`. */
  function scrollTo(y: number) {
    vi.stubGlobal("scrollY", y);
    window.dispatchEvent(new Event("scroll"));
    flushFrames();
  }

  beforeEach(installMotionDoubles);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("the gliding pill rests on the current page and follows the hovered link", () => {
    renderNavAt("/why-its-free");
    const primary = screen.getByRole("navigation", { name: "Primary navigation" });
    const list = primary.querySelector("ul")!;
    expect(list).toHaveAttribute("data-co-ind", "on");
    // The pill is decoration: hidden from screen readers, not a link.
    expect(list.querySelector(".co-pills-ind")).toHaveAttribute("aria-hidden", "true");

    const resources = within(primary).getByRole("link", { name: "Resources" });
    fireEvent.pointerOver(resources);
    expect(resources).toHaveAttribute("data-co-hot");
    fireEvent.pointerLeave(list);
    expect(resources).not.toHaveAttribute("data-co-hot");
    expect(list).toHaveAttribute("data-co-ind", "on");
  });

  test("on a page outside the menu the pill only shows while a link is hovered", () => {
    renderNavAt("/contact");
    const list = screen.getByRole("navigation", { name: "Primary navigation" }).querySelector("ul")!;
    expect(list).toHaveAttribute("data-co-ind", "off");
  });

  test("hides on the way down, comes back on the way up, and never near the top", () => {
    scrollTo(0);
    renderNavAt("/");
    const header = screen.getByRole("banner");
    flushFrames();
    scrollTo(60);
    expect(header).not.toHaveAttribute("data-co-hide");
    expect(header).toHaveAttribute("data-co-scrolled");
    scrollTo(400);
    expect(header).toHaveAttribute("data-co-hide");
    scrollTo(380);
    expect(header).not.toHaveAttribute("data-co-hide");
  });

  test("never hides while the phone menu is open or focus is inside the menu", () => {
    scrollTo(0);
    renderNavAt("/");
    const header = screen.getByRole("banner");
    fireEvent.click(menuButton());
    scrollTo(800);
    expect(header).not.toHaveAttribute("data-co-hide");

    fireEvent.click(menuButton());
    menuButton().focus();
    scrollTo(1600);
    expect(header).not.toHaveAttribute("data-co-hide");
  });

  test("writes page reading progress on the progress line", () => {
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(1800);
    vi.stubGlobal("innerHeight", 800);
    renderNavAt("/");
    scrollTo(500);
    const line = screen.getByRole("banner").querySelector<HTMLElement>(".co-nav-progress")!;
    expect(line.style.getPropertyValue("--co-progress")).toBe("0.5000");
  });

  test("with reduced motion the menu stays put", () => {
    setMedia({ reduce: true });
    scrollTo(0);
    renderNavAt("/");
    scrollTo(300);
    scrollTo(900);
    expect(screen.getByRole("banner")).not.toHaveAttribute("data-co-hide");
  });
});
