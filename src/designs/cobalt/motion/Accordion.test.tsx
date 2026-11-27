import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AccordionItem } from "./Accordion";
import { setMedia } from "./test-helpers";

beforeEach(() => setMedia());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderRows() {
  return render(
    <>
      <AccordionItem title="Do customers pay MMHR?" defaultOpen>
        <p>No. Customers never pay MMHR.</p>
      </AccordionItem>
      <AccordionItem title="Does the fee change rank?" headingLevel={4}>
        <p>No. It is never an input to rank.</p>
      </AccordionItem>
    </>,
  );
}

const button = (name: string) => screen.getByRole("button", { name });
const panelOf = (name: string) => document.getElementById(button(name).getAttribute("aria-controls") ?? "")!;

test("the server HTML (and so every visitor without JavaScript) has every answer open", () => {
  const html = renderToString(
    <AccordionItem title="Q">
      <p>Answer text</p>
    </AccordionItem>,
  );
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('data-open="true"');
  expect(html).toContain("Answer text");
  expect(html).not.toMatch(/\shidden[=\s>]/);
});

test("each question is a button inside a heading that controls its panel", () => {
  renderRows();
  expect(screen.getByRole("heading", { level: 3, name: "Do customers pay MMHR?" })).toContainElement(button("Do customers pay MMHR?"));
  expect(screen.getByRole("heading", { level: 4, name: "Does the fee change rank?" })).toBeInTheDocument();
  expect(panelOf("Do customers pay MMHR?")).toHaveTextContent("No. Customers never pay MMHR.");
});

test("the default-open row is open; the others are closed but keep their answer in the page", () => {
  renderRows();
  expect(button("Do customers pay MMHR?")).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("No. Customers never pay MMHR.")).toBeVisible();

  expect(button("Does the fee change rank?")).toHaveAttribute("aria-expanded", "false");
  const closed = panelOf("Does the fee change rank?");
  expect(closed).toHaveAttribute("hidden");
  expect(closed).toHaveTextContent("No. It is never an input to rank.");
});

test("clicking opens a row at once and closes it after its height animation", () => {
  vi.useFakeTimers();
  renderRows();
  fireEvent.click(button("Does the fee change rank?"));
  expect(button("Does the fee change rank?")).toHaveAttribute("aria-expanded", "true");
  expect(panelOf("Does the fee change rank?")).not.toHaveAttribute("hidden");
  expect(panelOf("Does the fee change rank?").closest(".co-acc")).toHaveAttribute("data-open", "true");

  fireEvent.click(button("Does the fee change rank?"));
  expect(button("Does the fee change rank?")).toHaveAttribute("aria-expanded", "false");
  // Still visible while the height animates down...
  expect(panelOf("Does the fee change rank?")).not.toHaveAttribute("hidden");
  vi.advanceTimersByTime(500);
  // ...then hidden (but still in the page).
  expect(panelOf("Does the fee change rank?")).toHaveAttribute("hidden");
});

test("with reduced motion a row closes at once", () => {
  setMedia({ reduce: true });
  renderRows();
  fireEvent.click(button("Do customers pay MMHR?"));
  expect(panelOf("Do customers pay MMHR?")).toHaveAttribute("hidden");
});

test("find-in-page (beforematch) opens a closed row", () => {
  renderRows();
  fireEvent(panelOf("Does the fee change rank?"), new Event("beforematch"));
  expect(button("Does the fee change rank?")).toHaveAttribute("aria-expanded", "true");
});
