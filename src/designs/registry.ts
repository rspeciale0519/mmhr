import type { ComponentType } from "react";

import Advocate from "./advocate/Design";
import Beacon from "./beacon/Design";
import Blueprint from "./blueprint/Design";
import Harbor from "./harbor/Design";
import Ledger from "./ledger/Design";
import Scorecard from "./scorecard/Design";
import Terminal from "./terminal/Design";

export type DesignOption = {
  slug: string;
  name: string;
  /** Which exploration round it came from. */
  round: number;
  /** One line: what this direction is arguing for. */
  line: string;
  /** What the hero leads with — the thing that most distinguishes it. */
  hero: string;
  /** The pitch, in a sentence or two. */
  note: string;
  /** Swatches shown on the directory card, most dominant first. */
  swatch: string[];
  /** Typefaces, for the card. */
  type: string;
  /** Full-length homepage, or a shorter exploration of a direction. */
  scope: "full homepage" | "direction study";
  Component: ComponentType;
};

/**
 * Every layout option we've built, newest round first.
 *
 * To add one: drop a folder under src/designs/<slug>/ with Design.tsx +
 * styles.css, then add an entry here. It appears in the directory and gets its
 * own URL automatically — nothing else to wire up.
 */
export const DESIGNS: DesignOption[] = [
  {
    slug: "harbor",
    name: "Harbor",
    round: 2,
    line: "OutSail's blue lineage, elevated",
    hero: "Live match card",
    note: "Deep navy with one electric blue accent. The hero pairs the lead-capture form with a live match card — real vendors, fit bars, verified pricing. The most category-familiar and conversion-proven of the set.",
    swatch: ["#0f1e3d", "#2563eb", "#eef2ff", "#ffffff"],
    type: "Plus Jakarta Sans",
    scope: "full homepage",
    Component: Harbor,
  },
  {
    slug: "beacon",
    name: "Beacon",
    round: 2,
    line: "The advisor, front and centre",
    hero: "Advisor thread",
    note: "Deep pine and bright teal on warm off-white. The hero is a real advisor conversation ending in a marked-up quote — the one thing a vendor's own website structurally cannot show you.",
    swatch: ["#0e2f2b", "#12857a", "#f4f2ed", "#fbfcfb"],
    type: "Sora + Manrope",
    scope: "full homepage",
    Component: Beacon,
  },
  {
    slug: "terminal",
    name: "Terminal",
    round: 2,
    line: "Data authority",
    hero: "Working comparison table",
    note: "Cobalt, tabular figures, monospace labels, hairline rules. The page looks like the data set it's selling, with a 'last verified' date on every row. The strongest expression of the research-pipeline moat.",
    swatch: ["#0b0f19", "#1d4ed8", "#eef3ff", "#fcfcfd"],
    type: "Archivo + IBM Plex Mono",
    scope: "full homepage",
    Component: Terminal,
  },
  {
    slug: "scorecard",
    name: "Scorecard",
    round: 1,
    line: "The hero is the artifact",
    hero: "Vendor scorecard table",
    note: "Cool and analytical. Leads with the product's output — a scored vendor table — instead of a headline over a form. Built before we studied OutSail, so it's a shorter study, not a full homepage.",
    swatch: ["#101828", "#b47b12", "#0f766e", "#f7f9fb"],
    type: "Instrument Sans + IBM Plex Mono",
    scope: "direction study",
    Component: Scorecard,
  },
  {
    slug: "advocate",
    name: "Advocate",
    round: 1,
    line: "Set like a letter from your advisor",
    hero: "Signed promise",
    note: "Plum and teal, literary serif. Warm and human; sells the person in your corner. The tonal ancestor of Beacon.",
    swatch: ["#3d2140", "#17635e", "#faf6f3", "#ffffff"],
    type: "Newsreader + Karla",
    scope: "direction study",
    Component: Advocate,
  },
  {
    slug: "blueprint",
    name: "Blueprint",
    round: 1,
    line: "The purchase as an engineering project",
    hero: "Dimensioned schedule",
    note: "Drafting grid, title block, dimension lines, one red markup swipe. Frames the HRIS selection as a dated engineering project. Coldest and most procedural of the set.",
    swatch: ["#16222e", "#0b6f9d", "#c8452f", "#eef2f6"],
    type: "Saira Semi Condensed + IBM Plex",
    scope: "direction study",
    Component: Blueprint,
  },
  {
    slug: "ledger",
    name: "Ledger",
    round: 1,
    line: "The CFO's artifact",
    hero: "Green-bar accounting ledger",
    note: "Green-bar paper, tabular figures, outflows in parentheses, a double rule under the total. Leads with money: what you should pay versus what you were quoted.",
    swatch: ["#1c211c", "#2c5d48", "#9e3327", "#f4f6f1"],
    type: "Spectral + IBM Plex Mono",
    scope: "direction study",
    Component: Ledger,
  },
];

export function getDesign(slug: string) {
  return DESIGNS.find((d) => d.slug === slug);
}

export const ROUNDS = [
  {
    n: 2,
    title: "Round 2 — full homepages",
    blurb:
      "Built on OutSail's proven section order (hero + capture → vendor wall → six tools → broker advantage → trust → stats → case studies → newsletter → footer), which also happens to match our own FR-M2 spec. Same skeleton, three very different arguments.",
  },
  {
    n: 1,
    title: "Round 1 — direction studies",
    blurb:
      "Built before we studied OutSail. Each takes its cues from a different artifact in the buyer's world rather than from a SaaS template. Shorter than the round-2 pages, but the ideas still stand — Advocate in particular is Beacon's ancestor.",
  },
];
