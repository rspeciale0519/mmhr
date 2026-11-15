/**
 * Shared Pulse homepage content.
 *
 * FR-MKT-03: public claims must be approved and traceable, and placeholder
 * claims must not ship. Every statement here restates the launch path in
 * docs/LAUNCH.md or the approved customer journey in docs/PRD.md. Do not add
 * figures, freshness or "verified" claims, or vendor names without owner approval.
 */

/**
 * Named vendors are not approved for the homepage. Only the blocked /platform
 * page still reads this list; trim task 6 removes that page.
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

/** The customer launch path, in order (docs/LAUNCH.md, "The launch path"). */
export const TOOLS = [
  {
    key: "account",
    name: "Create a free account",
    blurb: "You get a private workspace for your organization.",
    detail: "Customers never pay MMHR.",
  },
  {
    key: "needs",
    name: "Describe your needs",
    blurb: "Enter your HR software needs and submit them.",
    detail: "Your needs stay in your private workspace.",
  },
  {
    key: "compare",
    name: "Compare options",
    blurb: "See all published vendor options in the comparison matrix.",
    detail: "Vendor names are hidden at this step.",
  },
  {
    key: "select",
    name: "Choose up to five",
    blurb: "Select a maximum of five options for your RFP.",
    detail: "MMHR staff then talk with you about your choices.",
  },
  {
    key: "discuss",
    name: "Talk with MMHR staff",
    blurb: "Staff discuss your required capabilities with you.",
    detail: "Vendor names become visible after this discussion. Staff record the disclosure.",
  },
  {
    key: "respond",
    name: "Get vendor responses",
    blurb: "Staff approve your RFP and issue it to the vendors you selected.",
    detail: "Each vendor reads the RFP in the portal and submits a response.",
  },
] as const;

/** Protections from docs/LAUNCH.md, "Five protections that must hold". */
export const ADVANTAGES = [
  {
    title: "Private workspace",
    tag: "WORKSPACE",
    lead: "Your data stays with your organization.",
    body: "One customer cannot see the data of a different customer.",
    points: [
      "Free customer account",
      "Private workspace",
      "Needs saved in your workspace",
    ],
  },
  {
    title: "Names hidden",
    tag: "MATRIX",
    lead: "Compare options before you see vendor names.",
    body: "You see all published vendor options in the comparison matrix. Vendor names stay hidden until staff record the disclosure.",
    points: [
      "All published options",
      "Vendor names hidden",
      "Up to five selections",
    ],
  },
  {
    title: "Private responses",
    tag: "RFP",
    lead: "Vendors reply in the portal.",
    body: "Each vendor reads the RFP in the portal and submits a response. One vendor cannot see the replies of a competitor.",
    points: [
      "RFP issued by MMHR staff",
      "Responses in the vendor portal",
      "Competitor replies kept private",
    ],
  },
] as const;

/** Payment roles from docs/PRD.md, "Approved Customer Journey", and FR-MAT-04. */
export const TRUST = [
  {
    title: "Customers never pay MMHR",
    body: "Customers do not pay MMHR a fee. Providers pay us under commission or referral arrangements.",
  },
  {
    title: "Rates can differ",
    body: "Providers pay MMHR a commission or referral fee. This does not imply identical rates.",
  },
  {
    title: "Commission does not change a score",
    body: "Commission amounts stay hidden and do not change a score.",
  },
] as const;

/** Plain facts of the launch path, not performance figures. */
export const STATS = [
  { n: "Free", label: "Customer accounts" },
  { n: "Private", label: "Workspace for each customer" },
  { n: "Hidden", label: "Vendor names until disclosure" },
  { n: "Five", label: "Most options you can select" },
] as const;

export const NAV = ["Platform", "Broker model", "Case studies", "Resources"];
