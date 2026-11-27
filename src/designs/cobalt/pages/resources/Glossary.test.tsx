import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { glossaryTerms } from "./content";
import { Glossary } from "./Glossary";

afterEach(cleanup);

/** The terms whose cards are showing, in page order. */
function shownTerms(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".co-res-terms > li:not([hidden])")].map((item) => item.dataset.term);
}

describe("Glossary", () => {
  test("puts every term and definition in the page before any search", () => {
    const { container } = render(<Glossary terms={glossaryTerms} />);
    expect(shownTerms(container)).toEqual(glossaryTerms.map((entry) => entry.term));
    for (const entry of glossaryTerms) expect(screen.getByText(entry.definition)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(`${glossaryTerms.length} of ${glossaryTerms.length} terms`);
  });

  test("filters as you type, highlights the matches, and counts them", () => {
    const { container } = render(<Glossary terms={glossaryTerms} />);
    fireEvent.change(screen.getByLabelText("Search terms"), { target: { value: "capital" } });
    expect(shownTerms(container)).toEqual(["HCM"]);
    expect(screen.getByRole("status")).toHaveTextContent(`1 of ${glossaryTerms.length} terms`);
    expect(container.querySelector("mark")).toHaveTextContent("capital");
    // Hidden cards stay in the page (for search engines), just not shown.
    expect(container.querySelectorAll(".co-res-terms > li")).toHaveLength(glossaryTerms.length);
  });

  test("letter chips narrow to one letter, and All brings everything back", () => {
    const { container } = render(<Glossary terms={glossaryTerms} />);
    const chip = screen.getByRole("button", { name: "P" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(shownTerms(container)).toEqual(glossaryTerms.filter((entry) => entry.term.startsWith("P")).map((entry) => entry.term));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(shownTerms(container)).toHaveLength(glossaryTerms.length);
  });

  test("shows an empty state that clears the search", () => {
    const { container } = render(<Glossary terms={glossaryTerms} />);
    fireEvent.change(screen.getByLabelText("Search terms"), { target: { value: "zzz" } });
    expect(shownTerms(container)).toEqual([]);
    expect(screen.getByText(/No terms match/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByLabelText("Search terms")).toHaveValue("");
    expect(shownTerms(container)).toHaveLength(glossaryTerms.length);
  });

  test("More opens a card to its related terms", () => {
    const { container } = render(<Glossary terms={glossaryTerms} />);
    const card = container.querySelector<HTMLElement>('li[data-term="HRMS"]')!;
    const more = within(card).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(card).toHaveAttribute("data-open");
    expect(within(card).getByRole("button", { name: "HRIS" })).toBeVisible();
    expect(within(card).getByRole("button", { name: "Copy link" })).toBeVisible();
  });
});
