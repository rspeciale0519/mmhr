"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { motionAllowed } from "../../motion/media";
import { Tilt } from "../../motion/pointer";
import { Reveal } from "../../motion/Reveal";
import { Parallax } from "../../motion/scroll";
import type { GlossaryTerm } from "./content";
import { letters as lettersOf, matchesTerm, relatedTerms, splitMatches, termId } from "./glossary-filter";

/** Draws `text` with every match of `query` in a <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  const parts = splitMatches(text, query);
  if (parts.length === 1 && !parts[0].hit) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark className="co-res-hit" key={index}>
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="14">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

/** Rectangles of the cards before a change, keyed by term id. */
type Rects = Map<string, DOMRect>;

/**
 * The glossary on /resources, with a live search box, A to Z letter chips,
 * and cards that open to show related terms and a link to the term.
 *
 * - Server HTML: every term, with its expansion and full definition, as an
 *   <h3><dfn> heading and text (the page's DefinedTermSet JSON-LD lists the
 *   same terms). Nothing is hidden until the visitor filters.
 * - "Search terms" matches the name, what it stands for, and the
 *   definition; matches are highlighted. The letter chips narrow to one
 *   first letter. The count of matches is a polite live region; when
 *   nothing matches, an empty state offers to clear the search.
 * - Filtering animates FLIP-style: cards that stay glide from their old
 *   place to their new one, cards that come back fade and scale in. Only
 *   transform and opacity move, so nothing reflows mid-animation.
 * - "More" (aria-expanded) opens a card: related terms (from the glossary's
 *   own words), which jump to that card, and "Copy link".
 * - Reduced motion: the same, without the movement.
 */
export function Glossary({ terms }: { terms: readonly GlossaryTerm[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Where each card was just before the last change (for FLIP).
  const before = useRef<Rects | null>(null);

  const chips = useMemo(() => lettersOf(terms), [terms]);
  const related = useMemo(() => relatedTerms(terms), [terms]);
  const shown = terms.filter((entry) => matchesTerm(entry, query, letter));
  const shownKey = shown.map((entry) => entry.term).join("|");

  /** Measures every visible card, then applies `change` (for FLIP). */
  const withFlip = (change: () => void) => {
    const list = listRef.current;
    if (list && motionAllowed()) {
      const rects: Rects = new Map();
      for (const item of list.querySelectorAll<HTMLElement>(":scope > li:not([hidden])")) {
        rects.set(item.dataset.term ?? "", item.getBoundingClientRect());
      }
      before.current = rects;
    }
    change();
  };

  // After the change is on the page (and before it is painted), move each
  // card back to where it was and let it glide to its new place.
  useLayoutEffect(() => {
    const rects = before.current;
    const list = listRef.current;
    before.current = null;
    // Without the Web Animations API (very old browsers) cards just move.
    if (!rects || !list || typeof list.animate !== "function") return;
    for (const item of list.querySelectorAll<HTMLElement>(":scope > li:not([hidden])")) {
      // A card still waiting for its scroll entrance keeps that entrance.
      if (item.getAttribute("data-co-reveal") === "wait") continue;
      const was = rects.get(item.dataset.term ?? "");
      const now = item.getBoundingClientRect();
      if (!was) {
        item.animate(
          [
            { opacity: 0, transform: "scale(0.94)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
        continue;
      }
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 480,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    }
  }, [shownKey, open]);

  const toggleOpen = (term: string) =>
    withFlip(() =>
      setOpen((current) => {
        const next = new Set(current);
        if (next.has(term)) next.delete(term);
        else next.add(term);
        return next;
      }),
    );

  /** Clears the filters, then brings `term`'s card into view and focus. */
  const goTo = (term: string) => {
    withFlip(() => {
      setQuery("");
      setLetter(null);
    });
    // After the filters are cleared and the card is back on the page.
    requestAnimationFrame(() => {
      const card = document.getElementById(termId(term))?.closest("li");
      if (!card) return;
      card.scrollIntoView({ behavior: motionAllowed() ? "smooth" : "auto", block: "center" });
      card.querySelector<HTMLElement>(".co-res-term-h")?.focus({ preventScroll: true });
      card.setAttribute("data-flash", "");
      window.setTimeout(() => card.removeAttribute("data-flash"), 1400);
    });
  };

  const copyLink = async (term: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${termId(term)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(term);
      window.setTimeout(() => setCopied((current) => (current === term ? null : current)), 2000);
    } catch {
      // No clipboard (or no permission): put the link in the address bar.
      window.location.hash = termId(term);
    }
  };

  const clear = () =>
    withFlip(() => {
      setQuery("");
      setLetter(null);
    });

  return (
    <div className="co-res-gl">
      <Parallax aria-hidden="true" className="co-res-deco co-res-deco-b" max={90} speed={-0.2} />

      <div className="co-res-tools">
        <div className="co-res-search">
          <label className="co-res-search-l" htmlFor={searchId}>
            Search terms
          </label>
          <span className="co-res-search-box">
            <SearchIcon />
            <input
              autoComplete="off"
              className="co-res-search-in"
              id={searchId}
              onChange={(event) => {
                const value = event.target.value;
                withFlip(() => setQuery(value));
              }}
              type="search"
              value={query}
            />
          </span>
        </div>
        <div aria-label="Filter by first letter" className="co-res-az" role="group">
          <button
            aria-pressed={letter === null}
            className="co-res-chip"
            onClick={() => withFlip(() => setLetter(null))}
            type="button"
          >
            All
          </button>
          {chips.map((chip) => (
            <button
              aria-pressed={letter === chip}
              className="co-res-chip"
              key={chip}
              onClick={() => withFlip(() => setLetter(letter === chip ? null : chip))}
              type="button"
            >
              {chip}
            </button>
          ))}
        </div>
        <p className="co-res-matches" role="status">
          {shown.length} of {terms.length} terms
        </p>
      </div>

      <ul className="co-res-terms" ref={listRef}>
        {terms.map((entry, index) => {
          const id = termId(entry.term);
          const isOpen = open.has(entry.term);
          const links = related.get(entry.term) ?? [];
          return (
            <Reveal
              as="li"
              data-open={isOpen ? "" : undefined}
              data-term={entry.term}
              hidden={!matchesTerm(entry, query, letter)}
              index={index % 4}
              key={entry.term}
              variant={index % 2 === 0 ? "scale" : "rise"}
            >
              <Tilt innerClassName="co-res-term" max={5} spotlight>
                {/* tabIndex -1: a related-term jump can move focus here. */}
                <h3 className="co-res-term-h" tabIndex={-1}>
                  <dfn id={id}>
                    <Highlight query={query} text={entry.term} />
                  </dfn>
                </h3>
                {entry.expansion ? (
                  <p className="co-res-exp">
                    <Highlight query={query} text={entry.expansion} />
                  </p>
                ) : null}
                <p className="co-res-def">
                  <Highlight query={query} text={entry.definition} />
                </p>
                <button
                  aria-controls={`${id}-more`}
                  aria-expanded={isOpen}
                  className="co-res-more"
                  onClick={() => toggleOpen(entry.term)}
                  type="button"
                >
                  More
                  <span aria-hidden="true" className="co-res-more-i" />
                </button>
                <div className="co-res-panel" hidden={!isOpen} id={`${id}-more`}>
                  {links.length > 0 ? (
                    <div className="co-res-rel">
                      <span className="co-res-rel-k">Related</span>
                      {links.map((term) => (
                        <button className="co-res-rel-b" key={term} onClick={() => goTo(term)} type="button">
                          {term}
                          <ArrowIcon />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button className="co-link co-res-copy" onClick={() => copyLink(entry.term)} type="button">
                    {copied === entry.term ? "Link copied" : "Copy link"}
                  </button>
                </div>
              </Tilt>
            </Reveal>
          );
        })}
      </ul>

      {shown.length === 0 ? (
        <div className="co-res-empty">
          <p>No terms match &ldquo;{query.trim() || letter}&rdquo;.</p>
          <button className="co-btn co-btn-g co-btn-s" onClick={clear} type="button">
            Clear search
          </button>
        </div>
      ) : null}
    </div>
  );
}
