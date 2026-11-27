import type { GlossaryTerm } from "./content";

/**
 * Pure helpers behind the glossary's search box and letter chips on
 * /resources (Glossary.tsx). Kept apart so they are easy to test.
 */

/** The anchor id of a term, for links such as /resources#term-hris. */
export function termId(term: string): string {
  return `term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

/** The letter a term files under in the A to Z chips. */
export function firstLetter(term: string): string {
  return term.trim().charAt(0).toUpperCase();
}

/** Every first letter that has at least one term, A to Z. */
export function letters(terms: readonly GlossaryTerm[]): string[] {
  return [...new Set(terms.map((entry) => firstLetter(entry.term)))].sort();
}

/**
 * Does the entry match the search text (anywhere in its name, what it
 * stands for, or its definition, ignoring case) and the chosen letter?
 * An empty search and no letter match everything.
 */
export function matchesTerm(entry: GlossaryTerm, query: string, letter: string | null): boolean {
  if (letter && firstLetter(entry.term) !== letter) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [entry.term, entry.expansion ?? "", entry.definition].some((text) => text.toLowerCase().includes(needle));
}

/** One piece of a text, marked when it is part of a match. */
export type TextPart = { text: string; hit: boolean };

/**
 * Splits `text` around every case-insensitive occurrence of `query`, so the
 * matches can be highlighted. Joined back together, the parts are exactly
 * the original text. An empty query gives one unmarked part.
 */
export function splitMatches(text: string, query: string): TextPart[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const parts: TextPart[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * For each term, the other terms it is linked to by the glossary's own
 * words: terms its definition mentions, and terms whose definitions mention
 * it (whole words, ignoring case). Nothing is added that the page does not
 * already say.
 */
export function relatedTerms(terms: readonly GlossaryTerm[]): Map<string, string[]> {
  const mentions = (entry: GlossaryTerm, other: GlossaryTerm) =>
    new RegExp(`\\b${escape(other.term)}\\b`, "i").test(entry.definition);
  const related = new Map<string, string[]>();
  for (const entry of terms) {
    related.set(
      entry.term,
      terms
        .filter((other) => other !== entry && (mentions(entry, other) || mentions(other, entry)))
        .map((other) => other.term),
    );
  }
  return related;
}
