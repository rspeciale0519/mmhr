"use client";

import Link from "next/link";

import { CustomerIntakeForm } from "@/app/(app)/customer/intake-form";
import { EvaluationOptions } from "@/app/(app)/customer/evaluation/evaluation-options";
import type { EvaluationSelectionRead } from "@/server/commands/evaluation-selection";
import type { PublicationRead } from "@/server/matching/option-publication-contract";

import { AppNav } from "../chrome/AppNav";
import { MobileBar } from "../chrome/MobileBar";
import { PageHead } from "../chrome/PageHead";
import { CobaltGlows } from "../Glow";

const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const organizationId = uuid(1);

const previewNav = [
  { href: "/cobalt-preview?view=questionnaire", label: "Needs list" },
  { href: "/cobalt-preview?view=compare", label: "Compare" },
  { href: "/cobalt-preview?view=workspace", label: "Workspace" },
] as const;

const publication: PublicationRead = {
  organizationId,
  intakeId: uuid(2),
  publicationId: uuid(3),
  correlationId: uuid(4),
  sequence: 1,
  configurationVersion: 1,
  state: "published",
  inputDigest: "a".repeat(64),
  optionCount: 6,
  nextOrdinal: null,
  options: [
    { optionId: uuid(10), ordinal: 1, maskedLabel: "Option 1", eligibility: "eligible", deterministicScore: 9400, confidenceBasisPoints: 9000, fitReasons: ["payroll"], limitations: [], evidenceFreshAt: null, validUntil: null },
    { optionId: uuid(11), ordinal: 2, maskedLabel: "Option 2", eligibility: "eligible", deterministicScore: 8900, confidenceBasisPoints: 8500, fitReasons: ["payroll"], limitations: ["Partial coverage"], evidenceFreshAt: null, validUntil: null },
    { optionId: uuid(12), ordinal: 3, maskedLabel: "Option 3", eligibility: "eligible", deterministicScore: 8400, confidenceBasisPoints: 8000, fitReasons: [], limitations: ["Partial coverage"], evidenceFreshAt: null, validUntil: null },
    { optionId: uuid(13), ordinal: 4, maskedLabel: "Option 4", eligibility: "eligible", deterministicScore: 7800, confidenceBasisPoints: 7200, fitReasons: [], limitations: ["Partial coverage"], evidenceFreshAt: null, validUntil: null },
    { optionId: uuid(14), ordinal: 5, maskedLabel: "Option 5", eligibility: "unknown", deterministicScore: 7100, confidenceBasisPoints: 6000, fitReasons: [], limitations: ["More evidence needed"], evidenceFreshAt: null, validUntil: null },
    { optionId: uuid(15), ordinal: 6, maskedLabel: "Option 6", eligibility: "ineligible", deterministicScore: 6600, confidenceBasisPoints: 5000, fitReasons: [], limitations: ["A required capability does not match"], evidenceFreshAt: null, validUntil: null },
  ],
};

const history: EvaluationSelectionRead = {
  organizationId,
  intakeId: publication.intakeId,
  correlationId: uuid(5),
  initialCandidateCount: 0,
  remainingInitialChoices: 5,
  items: [],
};

const stages = [
  { n: "01", title: "Needs list", hint: "Open intakes", current: true },
  { n: "02", title: "Masked compare", hint: "After a published comparison", current: false },
  // Pick first: contenders are chosen masked, then the advisor review discloses them.
  { n: "03", title: "Contenders", hint: "Up to five", current: false },
  { n: "04", title: "Advisor review", hint: "Staff record disclosure", current: false },
  { n: "05", title: "Approved RFP", hint: "Sent by MMHR", current: false },
  { n: "06", title: "Sign direct", hint: "With the provider", current: false },
] as const;

function PreviewChrome({
  view,
  title,
  description,
  children,
}: {
  view: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const current = previewNav.find((item) => item.href.endsWith(view))?.href;
  return (
    <main className="co-w">
      <CobaltGlows placement="app" />
      <AppNav items={previewNav} currentHref={current} label="Customer workspace" />
      <PageHead kicker="Customer workspace" title={title} description={description} />
      {children}
      <MobileBar items={previewNav} currentHref={current} />
    </main>
  );
}

function QuestionnairePreview() {
  return (
    <PreviewChrome view="questionnaire" title="Your software needs" description="Save a draft now. You can return later and continue where you stopped.">
      <CustomerIntakeForm organizationId={organizationId} />
    </PreviewChrome>
  );
}

function ComparePreview() {
  return (
    <PreviewChrome view="compare" title="Masked comparison" description="Scored against your needs list only. Referral fees are never an input.">
      <EvaluationOptions
        publication={publication}
        history={history}
        canSelect
        requirementLabels={{ payroll: "Multi-state payroll" }}
        requirements={[{ key: "payroll", label: "Multi-state payroll", importance: "must" }]}
      />
    </PreviewChrome>
  );
}

function WorkspacePreview() {
  return (
    <PreviewChrome view="workspace" title="Workspace" description="Your access is active. Only areas available to your account appear here.">
      <div className="co-gl co-stages">
        {stages.map((stage) => (
          <div className={stage.current ? "co-stg co-stg-c" : "co-stg"} key={stage.n}>
            <b>{stage.n}</b>
            <div>
              <h3>{stage.title}</h3>
              <span>{stage.hint}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="co-wg">
        <div className="co-gl co-card">
          <h3>Workspace areas</h3>
          <nav aria-label="Workspace areas" className="flex flex-col gap-2 text-sm">
            <Link className="inline-flex min-h-11 items-center underline" href="/customer">Customer portal</Link>
            <Link className="inline-flex min-h-11 items-center underline" href="/workspaces">Change workspace</Link>
          </nav>
        </div>
        <div className="co-gl co-card">
          <h3>Session</h3>
          <p className="co-ps" style={{ marginTop: 0 }}>Sign out ends this session on this device.</p>
        </div>
        <div className="co-callc">
          <span className="co-lbl">Next</span>
          <h3>Needs list</h3>
          <p>Describe your software needs. Vendor names stay hidden until advisor review.</p>
          <Link className="co-btn" href="/customer" style={{ marginTop: 20, background: "#fff", color: "var(--co-navy)", width: "100%" }}>
            Open intakes
          </Link>
        </div>
      </div>
    </PreviewChrome>
  );
}

export function CobaltPreviewScreens({ view }: { view: string }) {
  if (view === "compare") return <ComparePreview />;
  if (view === "workspace") return <WorkspacePreview />;
  return <QuestionnairePreview />;
}
