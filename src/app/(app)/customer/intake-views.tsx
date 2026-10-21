import Link from "next/link";
import type { ReactNode } from "react";
import type { getIntake, getIntakesPage } from "@/server/commands/intake-read";

type Intake = Awaited<ReturnType<typeof getIntake>>;
type IntakePage = Awaited<ReturnType<typeof getIntakesPage>>;
const linkStyle = "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const statusLabels: Record<Intake["status"], string> = {
  draft: "Draft", in_progress: "In progress", submitted: "Submitted",
  under_review: "Under review", completed: "Completed", archived: "Archived",
};
const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
});

function SavedTime({ value }: { value: string }) {
  return <time dateTime={value} className="tabular-nums">{dateFormat.format(new Date(value))} UTC</time>;
}

export function CustomerFrame({ children, title = "Your software needs", description = "Review the intake information saved in your selected workspace." }: {
  children: ReactNode; title?: string; description?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-10 border-b pb-6">
        <nav aria-label="Customer workspace" className="mb-8 flex flex-wrap gap-2">
          <Link href="/home" prefetch={false} className={linkStyle}>Home</Link>
          <Link href="/customer" prefetch={false} className={linkStyle}>Your intakes</Link>
          <Link href="/customer/proposals" prefetch={false} className={linkStyle}>Proposals and pricing</Link>
          <Link href="/customer/contracts" prefetch={false} className={linkStyle}>Vendor selection and contracts</Link>
          <Link href="/workspaces" prefetch={false} className={linkStyle}>Change workspace</Link>
          <Link href="/customer/demos" prefetch={false} className={linkStyle}>Demo coordination</Link>
          <Link href="/documents" prefetch={false} className={linkStyle}>Workspace documents</Link>
        </nav>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Customer workspace</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-pretty text-base leading-7 text-muted-foreground">
          {description}
        </p>
      </header>
      {children}
    </main>
  );
}

export function IntakeNotice({ title, description }: { title: string; description?: string }) {
  return (
    <section className="border-l-2 border-foreground pl-5">
      <div role="alert">
        <h2 className="text-balance text-xl font-semibold">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-pretty leading-7 text-muted-foreground">{description}</p>}
      </div>
      <Link href="/customer" prefetch={false} className={`${linkStyle} mt-4`}>Return to saved intakes</Link>
    </section>
  );
}

export function IntakeList({ page, hasCursor, canCreate = false }: { page: IntakePage; hasCursor: boolean; canCreate?: boolean }) {
  return (
    <section aria-labelledby="saved-intakes">
      <h2 id="saved-intakes" className="text-balance text-xl font-semibold">Saved intakes</h2>
      <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
        {canCreate ? "Start an intake to record your software needs. You can save it and return later."
          : "You can view saved information here. Your current access does not allow intake changes."}
      </p>
      {canCreate && <Link href="/customer?new=1" prefetch={false} className={`${linkStyle} mt-4`}>Start an intake</Link>}
      {page.intakes.length === 0 ? (
        <p role="status" className="mt-6 rounded-lg bg-muted p-6 text-pretty leading-7">
          {hasCursor ? "There are no more saved intakes in this list." : "There are no saved intakes in this workspace."}
        </p>
      ) : (
        <ul className="mt-6 divide-y border-y">
          {page.intakes.map((intake) => (
            <li key={intake.intakeId} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-base font-semibold">Intake created <SavedTime value={intake.createdAt} /></h3>
                  <span className="rounded bg-muted px-2 py-1 text-xs font-medium">{statusLabels[intake.status]}</span>
                </div>
                <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
                  Last saved <SavedTime value={intake.updatedAt} />. Revision <span className="tabular-nums">{intake.revision}</span>.
                </p>
                <p className="mt-1 break-all text-xs leading-5 text-muted-foreground [font-family:ui-monospace,monospace]">Reference: {intake.intakeId}</p>
              </div>
              <Link href={`/customer?intake=${intake.intakeId}`} prefetch={false} className={`${linkStyle} justify-self-start sm:justify-self-end`}
                aria-label={`View intake ${intake.intakeId}`}>View intake</Link>
            </li>
          ))}
        </ul>
      )}
      {(hasCursor || page.nextCursor) && (
        <nav aria-label="Saved intake pages" className="mt-5 flex flex-wrap justify-between gap-3">
          {hasCursor && <Link href="/customer" prefetch={false} className={linkStyle}>Back to first page</Link>}
          {page.nextCursor && <Link href={`/customer?after=${page.nextCursor}`} prefetch={false} className={linkStyle}>Next page</Link>}
        </nav>
      )}
    </section>
  );
}

function SavedSection({ title, value }: { title: string; value: string[] | Record<string, string | number | boolean> | undefined }) {
  return (
    <section className="grid gap-4 border-t py-6 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-8" aria-label={title}>
      <h3 className="text-balance text-base font-semibold">{title}</h3>
      {!value || Object.keys(value).length === 0 ? <p className="text-sm text-muted-foreground">Not provided</p>
        : Array.isArray(value) ? (
          <ul className="min-w-0 list-disc space-y-2 pl-5 text-sm leading-6">
            {value.map((item, index) => <li key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item}</li>)}
          </ul>
        ) : (
          <dl className="min-w-0 space-y-4 text-sm leading-6">
            {Object.entries(value).map(([label, entry]) => (
              <div key={label}>
                <dt className="whitespace-pre-wrap font-medium [overflow-wrap:anywhere]">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {typeof entry === "boolean" ? (entry ? "Yes" : "No") : entry === "" ? "Not provided" : entry}
                </dd>
              </div>
            ))}
          </dl>
        )}
    </section>
  );
}

export function IntakeDetails({ intake, canEdit = false, staffView = false }: { intake: Intake; canEdit?: boolean; staffView?: boolean }) {
  return (
    <article aria-labelledby="intake-details">
      {!staffView && <Link href="/customer" prefetch={false} className={`${linkStyle} mb-6`}>Back to saved intakes</Link>}
      <div className="mb-7">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="intake-details" className="text-balance text-2xl font-semibold">Saved intake details</h2>
          <span className="rounded bg-muted px-2 py-1 text-sm font-medium">{statusLabels[intake.status]}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Last saved <SavedTime value={intake.updatedAt} />. Revision <span className="tabular-nums">{intake.revision}</span>.
        </p>
        <p className="mt-1 break-all text-xs leading-5 text-muted-foreground [font-family:ui-monospace,monospace]">Reference: {intake.intakeId}</p>
        {intake.submittedAt && <p className="mt-2 text-sm">Submitted <SavedTime value={intake.submittedAt} /></p>}
      </div>
      <p className="mb-7 rounded-lg bg-muted p-4 text-pretty text-sm leading-6">
        {staffView ? "Review the customer's saved answers and requirements below. Prepare the comparison, discuss provider details, and manage the RFP on this page."
          : "This view shows saved intake details and active requirements, including custom requests. Open the comparison to view approved options and saved choices."}
      </p>
      {!staffView && <Link href={`/customer/evaluation?intake=${encodeURIComponent(intake.intakeId)}`} prefetch={false}
        className={`${linkStyle} mb-5`}>View software comparison</Link>}
      {canEdit && !staffView && <Link href={`/customer?intake=${intake.intakeId}&edit=1`} prefetch={false}
        className={`${linkStyle} mb-5`}>Edit intake answers</Link>}
      <SavedSection title="Company context" value={intake.data.companyContext} />
      <SavedSection title="Current systems" value={intake.data.currentSystems} />
      <SavedSection title="Compliance needs" value={intake.data.complianceNeeds} />
      <SavedSection title="Budget" value={intake.data.budget} />
      <SavedSection title="Timeline" value={intake.data.timeline} />
      <SavedSection title="Stakeholders" value={intake.data.stakeholders} />
      <SavedSection title="Decision process" value={intake.data.decisionProcess} />
    </article>
  );
}
