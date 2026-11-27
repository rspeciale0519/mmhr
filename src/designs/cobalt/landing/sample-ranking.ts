/**
 * The buyer journey in six steps, in the order the owner approved on
 * 2026-11-27 ("pick first"): the buyer picks up to five while names are
 * still masked, and only then, at the advisor review, sees the names of the
 * providers they picked. A pick they recognize and do not want can be
 * swapped for another match. The home stepper, the How it works page, its
 * 3D story and its HowTo structured data all read this list.
 */
export const sixSteps = [
  { n: "01", title: "Share your needs", body: "Size, modules, must-haves and timeline." },
  { n: "02", title: "Compare masked", body: "Every match scored on fit, names hidden." },
  { n: "03", title: "Pick up to five", body: "Chosen on fit, names still masked." },
  { n: "04", title: "Advisor review", body: "Confirm requirements, then see who you picked." },
  { n: "05", title: "One approved RFP", body: "MMHR sends it once you approve." },
  { n: "06", title: "Sign direct", body: "Your contract is with the provider." },
] as const;

export const rankingRules = [
  {
    title: "Buyers never pay",
    body: "MMHR is free for you. Providers pay us a referral fee.",
    icon: "minus",
  },
  {
    title: "Fees never rank",
    body: "Who pays, and how much, never changes your results.",
    icon: "bars",
  },
  {
    title: "Names come later",
    body: "You pick on fit. Your picks are named at the advisor review.",
    icon: "lock",
  },
] as const;
