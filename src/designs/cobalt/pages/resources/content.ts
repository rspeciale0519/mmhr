/**
 * The written content of /resources: the buyer's checklist and the glossary.
 *
 * Kept apart from Body.tsx so the page and its tests read the same text, and
 * so the glossary's structured data (JSON-LD) is built from exactly the words
 * a visitor sees.
 *
 * Rules for this text: general good practice only. No statistics, no vendor
 * or product names, no promises about MMHR beyond what the product does.
 */

/** One step of the buyer's checklist. */
export type ChecklistStep = { readonly title: string; readonly body: string };

/** "How to choose HR software: a short buyer's checklist." */
export const checklistSteps: readonly ChecklistStep[] = [
  {
    title: "Write down the problems to solve",
    body: "List what is not working today, such as manual payroll steps, scattered employee records, or missed approvals, and who feels each problem. A new system should fix these first.",
  },
  {
    title: "Separate must-haves from nice-to-haves",
    body: "Mark each requirement as one or the other. Judge every option on the must-haves first, so a long feature list does not distract you.",
  },
  {
    title: "Count your people now and later",
    body: "Note your headcount today and what you expect in two to three years, the states or countries you employ in, and your worker types: hourly, salaried, and contractors. Fit and price often depend on these.",
  },
  {
    title: "Decide the scope: payroll, benefits, and more",
    body: "Decide whether the system must run payroll and payroll tax filing, administer benefits, track time, or handle recruiting and onboarding, or whether some of that stays with providers you already use.",
  },
  {
    title: "List the systems it must connect to",
    body: "Include accounting, benefits carriers, time clocks, single sign-on, and any tools you keep. For each one, ask whether the connection is built in, offered through a partner, or needs custom work.",
  },
  {
    title: "Ask how implementation works",
    body: "Ask who does the setup, how long it usually takes, what data you must prepare, how records move from your old system, what setup costs, and who your contact is until go-live.",
  },
  {
    title: "Ask how support works after go-live",
    body: "Ask about support hours, channels such as phone, chat, and email, expected response times, whether you get a named contact, and how payroll errors are fixed.",
  },
  {
    title: "Check security and data handling",
    body: "Ask how employee data is protected, who at the provider can see it, which security audits or reports they can share, and how you get your data back if you leave.",
  },
  {
    title: "See it run your own scenarios",
    body: "Ask for a demo built on two or three of your real tasks, such as a payroll with overtime or a new hire's first week, instead of a standard tour.",
  },
  {
    title: "Talk to references like you",
    body: "Ask for customers of a similar size and industry. Ask them how setup went, how support responds, and what they would do differently.",
  },
  {
    title: "Read the contract terms before you sign",
    body: "Check the term length and renewal date, price increases at renewal, minimum charges, how employees are counted for pricing, fees for setup and extra modules, cancellation terms, and how you export your data at the end.",
  },
  {
    title: "Compare the total cost over the full term",
    body: "Add up the subscription, setup, add-ons, and your own team's time across the whole contract, not only the first-year price.",
  },
];

/** One glossary entry. `expansion` is what an abbreviation stands for. */
export type GlossaryTerm = {
  readonly term: string;
  readonly expansion?: string;
  readonly definition: string;
};

/** Core HR software terms, in plain language. */
export const glossaryTerms: readonly GlossaryTerm[] = [
  {
    term: "HRIS",
    expansion: "Human resources information system",
    definition: "Software that keeps employee records, such as personal details, job, pay, and time off, in one place, and often runs the HR tasks around them.",
  },
  {
    term: "HCM",
    expansion: "Human capital management",
    definition: "A broad software suite that usually covers HR records and payroll plus talent work such as recruiting, performance reviews, and learning.",
  },
  {
    term: "HRMS",
    expansion: "Human resource management system",
    definition: "Software that combines HR records with tasks such as payroll and time tracking. HRIS, HRMS, and HCM overlap, and providers use the labels differently, so compare features, not names.",
  },
  {
    term: "Payroll",
    definition: "Working out each employee's pay, withholding taxes and deductions, paying people, and filing payroll taxes. Payroll software automates these steps.",
  },
  {
    term: "Benefits administration",
    definition: "Running employee benefits such as health insurance and retirement plans: enrollment, eligibility, changes after life events, and sending enrollment data to insurance carriers.",
  },
  {
    term: "ATS",
    expansion: "Applicant tracking system",
    definition: "Recruiting software for posting jobs, collecting applications, and moving candidates through interviews to an offer.",
  },
  {
    term: "Onboarding",
    definition: "Getting a new hire ready to work: paperwork, tax and work-eligibility forms, accounts, equipment, and training. Onboarding software turns these into tracked tasks.",
  },
  {
    term: "Time and attendance",
    definition: "Recording when people work, including clock-ins, timesheets, breaks, overtime, and time off. The hours often flow straight into payroll.",
  },
  {
    term: "PEO",
    expansion: "Professional employer organization",
    definition: "A company that co-employs your staff and takes on payroll, benefits, and HR compliance work, often with access to its benefit plans. It is a service arrangement, not only software.",
  },
  {
    term: "RFP",
    expansion: "Request for proposal",
    definition: "A document that sets out your requirements and asks providers to answer in the same structured way, usually with pricing, so their answers are easy to compare.",
  },
  {
    term: "Implementation",
    definition: "Setting up a new system before go-live: configuring it, moving data from old systems, connecting other tools, testing, and training people.",
  },
  {
    term: "Integration",
    definition: "A connection that lets two systems share data automatically, such as hours from a time clock flowing into payroll.",
  },
];
