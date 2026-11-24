export const sixSteps = [
  { n: "01", title: "Share your needs", body: "Size, modules, must-haves and timeline." },
  { n: "02", title: "Compare masked", body: "Every match scored on fit, names hidden." },
  { n: "03", title: "Advisor review", body: "Confirm requirements, then see names." },
  { n: "04", title: "Pick up to five", body: "Your contenders for the RFP." },
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
    body: "Vendors stay masked until your advisor review.",
    icon: "lock",
  },
] as const;
