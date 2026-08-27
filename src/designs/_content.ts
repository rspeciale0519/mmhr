/**
 * Shared marketing content for the design explorations, so the three directions
 * differ in *expression* rather than in what they say.
 *
 * Section order mirrors FR-MKT-02 and OutSail's proven homepage
 * skeleton): hero + lead capture, vendor wall, six-tool tour, broker-model
 * explainer, stats, case studies, newsletter, footer.
 *
 * All figures below are PLACEHOLDERS for layout evaluation, not claims.
 */

export const VENDORS = [
  "Rippling",
  "Workday",
  "ADP",
  "Paylocity",
  "UKG",
  "Gusto",
  "BambooHR",
  "Dayforce",
  "Paycom",
  "TriNet",
  "Deel",
  "HiBob",
  "Paycor",
  "isolved",
  "Personio",
  "SAP SuccessFactors",
];

export const TOOLS = [
  {
    key: "marketplace",
    name: "Vendor Marketplace",
    blurb:
      "52 HRIS profiles with verified pricing, module-level capability scores, and honest pros and cons.",
    detail:
      "Filter by what you actually need. Every profile carries the date its pricing was last verified.",
  },
  {
    key: "requirements",
    name: "Requirements Builder",
    blurb:
      "Tag ~200 HRIS features as must-have, nice-to-have, or irrelevant.",
    detail:
      "Your answers drive every match score you see. Export the list for your RFP.",
  },
  {
    key: "scorecards",
    name: "Scorecards",
    blurb:
      "Weighted criteria, expert question banks, and live scoring during demos.",
    detail:
      "Your whole team scores independently. Aggregate views show where you disagree.",
  },
  {
    key: "plans",
    name: "Project Plans",
    blurb: "Set a go-live date and get a phased timeline with owners and tasks.",
    detail:
      "Every step has a guide. Check things off, reassign, re-date as reality shifts.",
  },
  {
    key: "team",
    name: "Team Collaboration",
    blurb: "Invite HR, finance, IT, and the execs who sign. Roles and permissions included.",
    detail:
      "Everyone sees the same requirements, the same scores, the same plan.",
  },
  {
    key: "advisor",
    name: "Advisor",
    blurb:
      "A dedicated expert who has run hundreds of these. Chat, meet, get proposals reviewed.",
    detail:
      "Send us a quote and we'll tell you what comparable companies actually paid.",
  },
] as const;

export const ADVANTAGES = [
  {
    title: "Market expertise",
    lead: "Become an HRIS expert overnight.",
    body: "Pricing, service models, geography, module depth — for every system worth considering, kept current by an automated research pipeline rather than a stale spreadsheet.",
    points: [
      "52 HRIS profiles",
      "Verified pricing estimates",
      "Module capability scores",
      "Ranked against your needs",
    ],
  },
  {
    title: "Evaluation tools",
    lead: "Run the process a consultant would run.",
    body: "Requirements, weighted scorecards, expert-written vendor questions, and a project plan your whole buying committee works from.",
    points: [
      "Team roles & permissions",
      "Expert question bank",
      "Shared scorecards",
      "Project plans & timelines",
    ],
  },
  {
    title: "Advisor support",
    lead: "Lean on someone who's done this before.",
    body: "A dedicated advisor reviews your proposals, benchmarks the price, and tells you plainly when a vendor is wrong for you — including ours.",
    points: [
      "Dedicated HRIS expert",
      "Proposal review",
      "Negotiation guidance",
      "Implementation readiness",
    ],
  },
] as const;

export const TRUST = [
  {
    title: "The same rate, every vendor",
    body: "Whichever system you pick, we're paid the identical commission. Steering you cannot make us more money.",
  },
  {
    title: "No cost, ever, to you",
    body: "Not a fee, not a subscription, and not passed along in the price the vendor quotes you.",
  },
  {
    title: "We say when we're the vendor",
    body: "We resell one system, CBIZ Centrally HR. It's labelled wherever it appears and ranks on the same data as everything else.",
  },
] as const;

/** Placeholder figures — not claims. */
export const STATS = [
  { n: "52", label: "HRIS in the marketplace" },
  { n: "74", label: "Net promoter score" },
  { n: "310", label: "Selections guided" },
  { n: "$0", label: "What buyers pay us" },
] as const;

/** Placeholder case studies — not claims. */
export const CASES = [
  {
    stat: "40%",
    statLabel: "off annual payroll fees",
    title: "How Northwind cut payroll spend without switching payroll providers",
    body: "A 900-person manufacturer used our benchmarks to renegotiate mid-contract.",
  },
  {
    stat: "75%",
    statLabel: "less evaluation time",
    title: "How Vantage shortlisted three vendors in nine days",
    body: "Requirements in, scores out. The committee agreed on the first pass.",
  },
  {
    stat: "3",
    statLabel: "best-fit vendors in 48h",
    title: "How Copperline found the right HRIS before year-end close",
    body: "250 employees, a hard deadline, and no time for a six-month RFP.",
  },
] as const;

export const NAV = ["Platform", "Broker model", "Case studies", "Resources"];
