import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, describe, expect, test, vi } from "vitest";

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
