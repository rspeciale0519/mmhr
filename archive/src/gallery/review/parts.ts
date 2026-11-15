// The shared vocabulary of "pieces" a reviewer can comment on, pick, and mix.
// Every design has the same sections, so a pick in one design maps cleanly onto
// the same piece in another. tagParts() finds each section in a rendered design.

export type PartGroup = "Look and feel" | "Home page";

export type Part = { id: string; label: string; group: PartGroup; hint: string };

export const parts: readonly Part[] = [
  { id: "typography", label: "Fonts and type", group: "Look and feel", hint: "The typefaces and how headlines are set." },
  { id: "colors", label: "Colors", group: "Look and feel", hint: "The overall color palette." },
  { id: "motion", label: "Motion and 3D", group: "Look and feel", hint: "The signature animation, depth, and interaction." },
  { id: "theme", label: "Light and dark modes", group: "Look and feel", hint: "How the design looks in both themes." },
  { id: "navigation", label: "Header and menu", group: "Look and feel", hint: "The top bar, menu, and mobile menu." },
  { id: "footer", label: "Footer", group: "Look and feel", hint: "The bottom of the page." },

  { id: "hero", label: "Opening hero", group: "Home page", hint: "The first screen visitors see." },
  { id: "promises", label: "Promises", group: "Home page", hint: "The short list of what MMHR promises." },
  { id: "scorecard", label: "Vendor scorecard", group: "Home page", hint: "The sample scorecard with evidence and contenders." },
  { id: "steps", label: "How it works", group: "Home page", hint: "The steps from first request to decision." },
  { id: "case", label: "Case progress", group: "Home page", hint: "The case board with stages, replies, and next action." },
  { id: "needs", label: "Needs form", group: "Home page", hint: "The needs assessment form." },
  { id: "faq", label: "Questions", group: "Home page", hint: "The questions and answers list." },
  { id: "closing", label: "Closing call to action", group: "Home page", hint: "The last invitation to start." },
];

export const partGroups: readonly PartGroup[] = ["Look and feel", "Home page"];

export const partIds = parts.map((part) => part.id);

export const partById: Readonly<Record<string, Part>> = Object.fromEntries(parts.map((part) => [part.id, part]));

/** Pieces that have no single section on the page; the dock offers them as buttons. */
export const pageWideParts = ["typography", "colors", "motion", "theme"] as const;

/**
 * Where each piece lives in a design. Designs share id and label conventions
 * (see src/gallery/README.md), so one selector list covers all of them.
 * The first match wins.
 */
const partSelectors: ReadonlyArray<readonly [string, string]> = [
  ["navigation", "header"],
  ["hero", 'section[aria-labelledby$="-hero-title"]'],
  [
    "promises",
    [
      'section[aria-label="Our promises"]',
      'section[aria-label="How MMHR stays on your side"]',
      'section[aria-label="The terms of our counsel"]',
      'section[aria-labelledby="margin-terms-title"]',
      'section[aria-labelledby="console-spec-title"]',
      'section[aria-labelledby="principles-title"]',
    ].join(", "),
  ],
  ["scorecard", '[id$="-scorecard"]'],
  [
    "steps",
    ['[id$="-how"]', '[id$="-steps"]', '[id$="-flow"]', '[id$="-engagement"]', '[id$="-method"]', '[id$="-journey"]'].join(", "),
  ],
  ["case", 'section[id$="-case"]'],
  ["needs", 'section[id$="-needs"]'],
  ["faq", 'section[id$="-faq"]'],
  ["closing", 'section[aria-labelledby$="-closing-title"]'],
];

/** Marks each section of the design inside root with data-part. Returns the ids it found. */
export function tagParts(root: ParentNode): string[] {
  const found: string[] = [];
  for (const [id, selector] of partSelectors) {
    const element = root.querySelector<HTMLElement>(`[data-part="${id}"]`)
      ?? [...root.querySelectorAll<HTMLElement>(selector)].find((node) => !node.closest("[data-review-ui]") && !node.dataset.part);
    if (!element) continue;
    element.dataset.part = id;
    found.push(id);
  }
  const footers = [...root.querySelectorAll<HTMLElement>("footer")].filter((node) => !node.closest("[data-review-ui]"));
  const footer = footers.at(-1);
  if (footer) {
    footer.dataset.part = "footer";
    found.push("footer");
  }
  return found;
}
