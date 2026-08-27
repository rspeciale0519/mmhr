/**
 * Content for the marketing pages that need it in more than one place —
 * case studies (index + detail), blog posts, FAQs.
 *
 * PLACEHOLDER. Company names, figures and outcomes below are illustrative so
 * the pages can be built and reviewed; they are not claims. FR-MKT-04 requires
 * managed, approved content before public release.
 */

export type CaseStudy = {
  slug: string;
  stat: string;
  statLabel: string;
  title: string;
  summary: string;
  industry: string;
  size: string;
  outcome: string;
  challenge: string;
  approach: string[];
  result: string;
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "northwind-payroll-renegotiation",
    stat: "40%",
    statLabel: "off annual payroll fees",
    title: "How Northwind cut payroll spend without switching providers",
    summary:
      "A 900-person manufacturer used our benchmarks to renegotiate mid-contract.",
    industry: "Manufacturing",
    size: "900 employees",
    outcome: "Renegotiated in place, no migration",
    challenge:
      "Northwind was three years into a payroll contract and assumed the price was the price. Renewal was eleven months out and their provider had already floated an uplift tied to headcount growth.",
    approach: [
      "Benchmarked their per-employee-per-month rate against verified pricing for comparable manufacturers in the same headcount band.",
      "Identified two line items — implementation amortisation and a module they had stopped using — that were still being billed.",
      "Drafted the counter-position and briefed their CFO before the renewal call.",
    ],
    result:
      "The provider matched the benchmark rather than risk the renewal. Northwind stayed on the same system, kept their configuration, and removed the unused module.",
  },
  {
    slug: "vantage-nine-day-shortlist",
    stat: "75%",
    statLabel: "less evaluation time",
    title: "How Vantage shortlisted three vendors in nine days",
    summary: "Requirements in, scores out. The committee agreed on the first pass.",
    industry: "Professional services",
    size: "340 employees",
    outcome: "Three-vendor shortlist in nine days",
    challenge:
      "Vantage had a seven-person buying committee spanning HR, finance and IT, and no shared definition of what they needed. Two previous attempts at a shortlist had stalled in disagreement.",
    approach: [
      "Ran every committee member through the Requirements Builder independently, so preferences were recorded before anyone argued.",
      "Weighted the criteria by function, which surfaced that IT and HR were optimising for different things.",
      "Scored the full marketplace against the agreed weights and cut to three.",
    ],
    result:
      "The disagreement turned out to be about integration depth, not vendors. Once that was explicit, the committee approved the shortlist on the first review.",
  },
  {
    slug: "copperline-year-end-selection",
    stat: "3",
    statLabel: "best-fit vendors in 48h",
    title: "How Copperline found the right HRIS before year-end close",
    summary:
      "250 employees, a hard deadline, and no time for a six-month RFP.",
    industry: "Logistics",
    size: "250 employees",
    outcome: "Signed before year-end close",
    challenge:
      "Copperline's incumbent system was being sunset by its vendor with four months' notice, landing directly on top of year-end close.",
    approach: [
      "Filtered the marketplace to systems with proven migration paths off the incumbent.",
      "Pulled verified pricing so budget approval could run in parallel with evaluation rather than after it.",
      "Reviewed both finalist proposals line by line before signature.",
    ],
    result:
      "Three viable options inside 48 hours, and a signed contract with implementation scheduled to start after close rather than during it.",
  },
];

export function getCaseStudy(slug: string) {
  return CASE_STUDIES.find((c) => c.slug === slug);
}

export type Post = {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  body: string[];
};

export const POSTS: Post[] = [
  {
    slug: "what-hris-pricing-actually-looks-like",
    title: "What HRIS pricing actually looks like behind the quote",
    date: "2026-07-14",
    category: "Pricing",
    excerpt:
      "List price, negotiated price and effective price are three different numbers. Only one of them ends up on your invoice.",
    body: [
      "Almost every HRIS quote is built from a per-employee-per-month rate, a set of module fees, and an implementation charge. Buyers tend to negotiate the first and ignore the other two, which is backwards — the PEPM rate is the most visible number and therefore the one the vendor has already decided how far to move on.",
      "Implementation is where the variance actually lives. It is quoted as a fixed fee often enough that buyers treat it as fixed, but it is scoped from assumptions about your data, your integrations and how much of the configuration your team will do. Change the assumptions and the number changes.",
      "The effective price is what you pay across the whole term divided by the employees you actually have. Headcount forecasts in the contract matter more than the headline rate, because a rate tier you never reach is a discount you never receive.",
    ],
  },
  {
    slug: "questions-vendors-hope-you-skip",
    title: "The questions HRIS vendors hope you skip in the demo",
    date: "2026-07-02",
    category: "Evaluation",
    excerpt:
      "A demo is a performance of the happy path. These are the questions that move it off script.",
    body: [
      "Demos are rehearsed against clean data. Ask to see a record that failed validation, a mid-cycle termination, or a retroactive pay change — the operations your team will actually spend its time on.",
      "Ask what happens at renewal if your headcount falls. Most contracts price growth carefully and are silent on contraction, which is a problem if your business is cyclical.",
      "Ask who does the implementation: the vendor, a partner, or a partner you have not met yet. The answer changes the timeline and often the price.",
    ],
  },
  {
    slug: "why-we-publish-our-commission",
    title: "Why we publish our commission",
    date: "2026-06-21",
    category: "Broker model",
    excerpt:
      "A broker who will not tell you how they are paid is telling you how they are paid.",
    body: [
      "We are paid by the vendor, at the same rate regardless of which one you choose. That structure is the whole reason our recommendations can be trusted, so it would be strange to hide it.",
      "The alternative models are worse for buyers. Percentage-of-contract creates an incentive to steer you toward the expensive option. Vendor-specific rates create an incentive to steer you toward whoever pays best.",
      "We also resell one system, CBIZ Centrally HR. It is labelled everywhere it appears and it is scored on the same data as everything else. If it is not right for you, the ranking will say so.",
    ],
  },
];

export function getPost(slug: string) {
  return POSTS.find((p) => p.slug === slug);
}

export const FAQS = [
  {
    q: "What does this cost me?",
    a: "Nothing. There is no fee, no subscription, and nothing added to the price the vendor quotes you. We are paid a commission by the vendor you select, at the same rate whichever one that is.",
  },
  {
    q: "If the vendor pays you, how can your advice be neutral?",
    a: "Because the rate is identical across every vendor in the marketplace. Steering you toward one system rather than another cannot make us more money, which removes the incentive that makes most referral models untrustworthy.",
  },
  {
    q: "Do you sell your own HRIS?",
    a: "We resell one system, CBIZ Centrally HR. It is labelled as ours wherever it appears, and it is scored against the same criteria and the same data as every other system. When it is not the right fit, our ranking says so.",
  },
  {
    q: "Where does your pricing data come from?",
    a: "An automated research pipeline re-checks vendor pricing on a schedule rather than when someone remembers to. Every profile carries the date its pricing was last verified, so you can see how current the number is before you rely on it.",
  },
  {
    q: "Do I have to talk to anyone?",
    a: "No. The marketplace, requirements builder and scorecards work on their own. An advisor is there when you want one — to review a proposal, benchmark a quote, or sit in on a demo.",
  },
  {
    q: "Why do you require my work email and phone number?",
    a: "Vendor pricing is commercially sensitive and provided to us on the basis that it reaches real buyers rather than competitors. Registration is what lets us honour that.",
  },
  {
    q: "Can you help if we have already chosen a vendor?",
    a: "Yes, and this is often where we save the most. Send us the proposal and we will tell you what comparable companies actually paid, which terms are unusual, and where there is room to move.",
  },
  {
    q: "What size company do you work with?",
    a: "Most of the companies we guide are between 100 and 5,000 employees. Below that the market is simpler and you may not need us; above it, evaluations tend to involve procurement teams who run their own process.",
  },
] as const;
