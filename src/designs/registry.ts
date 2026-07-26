import type { ComponentType } from "react";

import Advocate from "./advocate/Design";
import Aperture from "./aperture/Design";
import Beacon from "./beacon/Design";
import Blueprint from "./blueprint/Design";
import Bureau from "./bureau/Design";
import Calibrate from "./calibrate/Design";
import Console from "./console/Design";
import Dossier from "./dossier/Design";
import Grid from "./grid/Design";
import Harbor from "./harbor/Design";
import Itinerary from "./itinerary/Design";
import Lattice from "./lattice/Design";
import Ledger from "./ledger/Design";
import Marquee from "./marquee/Design";
import Memo from "./memo/Design";
import Pulse from "./pulse/Design";
import Redline from "./redline/Design";
import Report from "./report/Design";
import Scorecard from "./scorecard/Design";
import Specimen from "./specimen/Design";
import Sticker from "./sticker/Design";
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
    slug: "pulse",
    name: "Pulse",
    round: 5,
    line: "Verification, live",
    hero: "A signal that never flatlines",
    note: "The hero is a literal live signal — an oscilloscope trace standing in for the automated research pipeline that re-checks vendor pricing on a schedule. Signal-green light enters at the lower-left of the canvas and decays toward the upper-right, fixed to the viewport so it reads as ambient room light. Ships with dark and light themes on one toggle. Geologica for the interface, Martian Mono for every timestamp and figure.",
    swatch: ["#080C11", "#2FE6C4", "#EEF3F2", "#097061"],
    type: "Geologica + Martian Mono",
    scope: "full homepage",
    Component: Pulse,
  },
  {
    slug: "console",
    name: "Console",
    round: 5,
    line: "Your evaluation, as mission control",
    hero: "Six live instrument tiles",
    note: "Not vendor data — the buyer's own evaluation, shown as a mission-control tile wall: requirements locked, committee scored, shortlist size, advisor ETA. Unbounded carries the headline; Hanken Grotesk and Red Hat Mono do the rest.",
    swatch: ["#0B0D12", "#5B79FF", "#EDEFF5", "#232838"],
    type: "Unbounded + Hanken Grotesk + Red Hat Mono",
    scope: "full homepage",
    Component: Console,
  },
  {
    slug: "lattice",
    name: "Lattice",
    round: 5,
    line: "You, at the center of the market",
    hero: "A node graph of 52 systems",
    note: "A literal fit graph: a central 'you' node with thin lines to vendor nodes, sized and colored by score. Bricolage Grotesque throughout, Azeret Mono for every fit percentage.",
    swatch: ["#16151B", "#8B5CF6", "#FAFAFC", "#E5E3EC"],
    type: "Bricolage Grotesque + Azeret Mono",
    scope: "full homepage",
    Component: Lattice,
  },
  {
    slug: "calibrate",
    name: "Calibrate",
    round: 5,
    line: "A quote, calibrated",
    hero: "A precision gauge, needle and all",
    note: "The benchmark rendered as an actual instrument: a semicircular gauge with zone labels and a needle pointing to exactly where a $161,400 quote sits against a $124,100 verified median. Figtree and Overpass Mono keep it clinical.",
    swatch: ["#12151C", "#2E90FA", "#F5F6F8", "#E2E5EA"],
    type: "Figtree + Overpass Mono",
    scope: "full homepage",
    Component: Calibrate,
  },
  {
    slug: "aperture",
    name: "Aperture",
    round: 5,
    line: "The whole picture, in focus",
    hero: "One glass card, three numbers",
    note: "The most minimal page in the gallery: a single floating glass card over a soft magenta-violet gradient mesh, holding nothing but three huge verified numbers. Albert Sans and Geist Mono, and otherwise just restraint.",
    swatch: ["#0A0A0F", "#C026D3", "#7C3AED", "#F7F6FA"],
    type: "Albert Sans + Geist Mono",
    scope: "full homepage",
    Component: Aperture,
  },
  {
    slug: "redline",
    name: "Redline",
    round: 4,
    line: "The buyer's own legal markup",
    hero: "A contract, actually redlined",
    note: "The hero is a real contract clause shown with tracked-changes markup — vendor language struck in red, buyer-favorable language inserted in green, with an advisor's margin note explaining why. Source Serif 4 for the document, Courier Prime for every annotation.",
    swatch: ["#1B1B18", "#B3261E", "#FBFAF7", "#2F6B3A"],
    type: "Source Serif 4 + Courier Prime",
    scope: "full homepage",
    Component: Redline,
  },
  {
    slug: "specimen",
    name: "Specimen",
    round: 4,
    line: "A field guide to HR software",
    hero: "Plate No. 014 — Rippling",
    note: "Fifty-two systems catalogued like species: habitat, distinguishing marks, field notes. A thin scale-bar rule recurs as the page's only structural device. Fraunces carries the naturalist-book warmth; Work Sans stays out of the way.",
    swatch: ["#232019", "#8A5A34", "#F7F4EC", "#ffffff"],
    type: "Fraunces + Work Sans",
    scope: "full homepage",
    Component: Specimen,
  },
  {
    slug: "itinerary",
    name: "Itinerary",
    round: 4,
    line: "The buyer's journey, boarded",
    hero: "An actual boarding pass",
    note: "RFP to signed contract is a real five-stop sequence, so a literal boarding pass and departure board earn their place — perforated stub, gate and seat fields, a split-flap status board with 'Negotiation' lit up as 'you are here.' Space Grotesk for the cities, Space Mono for every code.",
    swatch: ["#14151A", "#C97A1D", "#FAFAF8", "#FFFDF6"],
    type: "Space Grotesk + Space Mono + DM Sans",
    scope: "full homepage",
    Component: Itinerary,
  },
  {
    slug: "memo",
    name: "Memo",
    round: 4,
    line: "The declassified internal memo",
    hero: "A redaction bar, peeled back",
    note: "The broker's whole pitch is reversed information asymmetry, so the hero shows it happening: a memo with black bars over the numbers, one bar peeled at the corner to reveal $161,400 underneath. Special Elite's typewriter roughness against clean Inter figures is the whole tension.",
    swatch: ["#1A1A1A", "#A1281F", "#F1EEE6", "#17181C"],
    type: "Special Elite + Inter",
    scope: "full homepage",
    Component: Memo,
  },
  {
    slug: "sticker",
    name: "Sticker",
    round: 4,
    line: "The window sticker, for HRIS",
    hero: "MSRP vs. invoice price",
    note: "Everyone knows to distrust a car's window sticker. The hero applies the same instinct to an HRIS quote: an itemized label, a struck-through sticker price, a barcode, and the real negotiated number sitting right below it. Barlow Condensed reads like a government form; Roboto Mono carries every figure.",
    swatch: ["#101114", "#B23A2E", "#FFFFFF", "#C7A600"],
    type: "Barlow Condensed + Roboto Mono",
    scope: "full homepage",
    Component: Sticker,
  },
  {
    slug: "report",
    name: "Report",
    round: 3,
    line: "Data journalism",
    hero: "Where your quote lands",
    note: "The hero is a real distribution chart: what 214 comparable companies actually paid, with your quote marked in ochre above the median. It turns the benchmarking service into the picture. Libre Franklin with a mono for every figure.",
    swatch: ["#0f0f10", "#b45309", "#fafafa", "#ffffff"],
    type: "Libre Franklin + Chivo Mono",
    scope: "full homepage",
    Component: Report,
  },
  {
    slug: "bureau",
    name: "Bureau",
    round: 3,
    line: "The published brief",
    hero: "Fig. 1 — a typeset figure",
    note: "Set like a research publication: a masthead with an edition line, a typeset thesis, and the match table presented as a numbered figure with a caption. Instrument Serif against Geist. Oxblood appears four times on the whole page.",
    swatch: ["#14110f", "#8c2b22", "#f5f4f2", "#ffffff"],
    type: "Instrument Serif + Geist",
    scope: "full homepage",
    Component: Bureau,
  },
  {
    slug: "grid",
    name: "Grid",
    round: 3,
    line: "International style",
    hero: "The construction grid, left visible",
    note: "A selection is a system, so the page is built as one and shows its work: a visible 12-column grid, everything snapped to it, numerals set enormous, and a single Swiss red used only where the eye must go.",
    swatch: ["#0a0a0a", "#e4002b", "#fafafa", "#ffffff"],
    type: "Schibsted Grotesk + JetBrains Mono",
    scope: "full homepage",
    Component: Grid,
  },
  {
    slug: "marquee",
    name: "Marquee",
    round: 3,
    line: "Type as the art",
    hero: "A shout, then the receipts",
    note: "Every site in this category whispers. This one says it at 108px — then puts a small, precise match table directly underneath to prove it isn't bluster. The whole design is that tension. Syne shouts; Epilogue stays calm.",
    swatch: ["#121013", "#5b21b6", "#faf9f8", "#ffffff"],
    type: "Syne + Epilogue",
    scope: "full homepage",
    Component: Marquee,
  },
  {
    slug: "dossier",
    name: "Dossier",
    round: 3,
    line: "The case file",
    hero: "A tabbed folder",
    note: "Your advisor keeps a file on your purchase — requirements, quotes, the marked-up proposal. This page is that file: tabbed dividers, typed clause labels, an advisor's note in the margin. Brass, not gold: an archive, not a luxury brand.",
    swatch: ["#17181a", "#8a6e2f", "#f2f2f2", "#ffffff"],
    type: "Literata + Public Sans",
    scope: "full homepage",
    Component: Dossier,
  },
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
    n: 5,
    title: "Round 5 — professional, elegant, a touch of high-tech",
    blurb:
      "A different register from round 4's paper-and-ink artifacts: precision instrumentation instead. A live verification signal, a mission-control tile wall, a node graph of the whole market, a calibration gauge, one glass card and three numbers. Cool electric accents throughout — no brown or tan anywhere in this round.",
  },
  {
    n: 4,
    title: "Round 4 — five more angles, same brief",
    blurb:
      "Round 3's neutral-canvas rule carries over — ink and paper, no color backgrounds — but each of these five takes a completely different real-world artifact as its signature: a redlined contract, a field-guide specimen plate, a boarding pass, a declassified memo, a car's window sticker. Five more arguments for what this page could be.",
  },
  {
    n: 3,
    title: "Round 3 — neutral canvases, five type systems",
    blurb:
      "Same OutSail-derived skeleton, but the background stays neutral in every one — white, off-white, or paper-grey — so the typography and one accent carry the whole identity. Five genuinely different type systems, from a high-contrast serif to a Swiss grotesque to a display face doing the shouting.",
  },
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
