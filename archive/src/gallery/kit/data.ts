/**
 * Sample content shared by every gallery design. All companies, people, and
 * vendor names are fictional. Designs show this data as a labeled sample.
 */
export type Score = 0 | 1 | 2 | 3 | 4 | 5 | null;

export type Vendor = {
  id: string;
  masked: string;
  name: string;
  fit: number;
  price: string;
  evidence: string;
  verified: string;
};

export type Criterion = {
  id: string;
  label: string;
  weight: "Must have" | "Important" | "Nice to have";
  scores: Record<string, Score>;
};

export const vendors: Vendor[] = [
  { id: "a", masked: "Vendor A", name: "Larkspur People", fit: 92, price: "$11 per employee monthly", evidence: "Product demo notes and a signed capability statement", verified: "Verified September 28" },
  { id: "b", masked: "Vendor B", name: "Quillfield HCM", fit: 88, price: "$9 to $13 per employee monthly", evidence: "Public documentation and reference call", verified: "Verified September 21" },
  { id: "c", masked: "Vendor C", name: "Brightmoor Payroll", fit: 84, price: "$8 per employee monthly", evidence: "Capability statement; time tracking unconfirmed", verified: "Verified September 30" },
  { id: "d", masked: "Vendor D", name: "Tallis Workforce", fit: 79, price: "Quote required", evidence: "Public documentation only", verified: "Verified August 30" },
  { id: "e", masked: "Vendor E", name: "Covewell HR", fit: 74, price: "$14 per employee monthly", evidence: "Demo notes; compliance reporting under review", verified: "Verified September 12" },
  { id: "f", masked: "Vendor F", name: "Ardent Suite", fit: 68, price: "$7 per employee monthly", evidence: "Capability statement", verified: "Verified September 8" },
];

const row = (a: Score, b: Score, c: Score, d: Score, e: Score, f: Score) => ({ a, b, c, d, e, f });

export const criteria: Criterion[] = [
  { id: "payroll", label: "Payroll in three states", weight: "Must have", scores: row(5, 5, 4, 4, 3, 3) },
  { id: "benefits", label: "Benefits administration", weight: "Must have", scores: row(5, 4, 4, 3, 4, 2) },
  { id: "time", label: "Time and attendance", weight: "Important", scores: row(4, 4, null, 4, 3, 3) },
  { id: "aca", label: "ACA compliance reporting", weight: "Must have", scores: row(5, 4, 4, 3, null, 3) },
  { id: "hiring", label: "Applicant tracking", weight: "Nice to have", scores: row(3, 4, 2, 4, 3, null) },
  { id: "mobile", label: "Mobile self-service", weight: "Important", scores: row(4, 5, 4, 3, 4, 3) },
  { id: "launch", label: "Live within 90 days", weight: "Important", scores: row(4, 3, 5, 2, 3, 4) },
  { id: "api", label: "Open API and integrations", weight: "Nice to have", scores: row(4, 4, 3, null, 3, 2) },
];

export const stages = ["Needs", "Comparison", "Discussion", "RFP", "Responses", "Demos", "Proposals", "Contract"] as const;
export const currentStageIndex = 3;

export const caseSummary = {
  company: "Fernwood Dental Group",
  employees: 240,
  goal: "Replace payroll and benefits with one platform",
  advisor: "Dana Ortiz",
  nextAction: "Approve the RFP draft",
  due: "Thursday, October 15",
};

export type Response = { vendor: string; status: "Submitted" | "In review" | "Clarification needed" | "Not started"; tone: "success" | "info" | "warning" | "neutral"; updated: string };

export const responses: Response[] = [
  { vendor: "Vendor A", status: "Submitted", tone: "success", updated: "Today, 9:40 AM" },
  { vendor: "Vendor B", status: "In review", tone: "info", updated: "Yesterday" },
  { vendor: "Vendor C", status: "Clarification needed", tone: "warning", updated: "October 5" },
  { vendor: "Vendor E", status: "Not started", tone: "neutral", updated: "Invited October 2" },
];

export const journey = [
  { title: "Tell us what you need", body: "Answer a guided assessment about your company, current systems, and must-have features. Save it and come back anytime." },
  { title: "Compare every fit", body: "See every approved option in one scorecard. Names stay hidden so the evidence decides, not the brand." },
  { title: "Talk it through", body: "Your advisor reviews your requirements with you, then reveals the names of the contenders you chose." },
  { title: "Send one request", body: "MMHR approves and sends a single RFP. Vendors answer in a structured portal, and you see only approved replies." },
  { title: "Choose with confidence", body: "Compare demos and quotes side by side, pick your provider, and sign directly with them." },
] as const;

export const principles = [
  { title: "Customers never pay", body: "Software providers pay MMHR a referral fee. You pay nothing for our help." },
  { title: "Fees never rank vendors", body: "Referral fees stay outside every score. Rankings come only from approved evidence." },
  { title: "Evidence before names", body: "You compare capabilities first. Names appear after you discuss your needs with an advisor." },
] as const;

export const faqs = [
  { q: "Why are vendor names hidden at first?", a: "Hidden names keep the first comparison about evidence. Your advisor reveals the names of your chosen contenders after you review your requirements together, before any request goes out." },
  { q: "How does MMHR earn money if I pay nothing?", a: "The provider you choose pays MMHR a referral fee after you sign with them. Fees differ by provider, and they never affect scores or the order of options." },
  { q: "Can I change my answers after I submit?", a: "Yes. You can revise your needs assessment. Your advisor sees each revision and updates the comparison if your requirements change." },
  { q: "What does Unknown mean in the scorecard?", a: "Unknown means MMHR has no verified evidence for that capability yet. It is not the same as a missing feature. Your advisor confirms it before the request goes out." },
] as const;
