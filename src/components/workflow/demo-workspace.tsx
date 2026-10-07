import { requireLaunchArea } from "@/lib/launch-surface-guard";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden, notFound } from "next/navigation";
import { requirePagePermission, requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getDemoCoordination } from "@/server/commands/demo-coordination";
import type { DemoAvailability } from "@/lib/demo-planning";
import { DemoPlanForm } from "./demo-plan-form";
import { DemoHistory } from "./demo-history";
import { displayDemoTime as displayTime } from "./demo-format";
import { DemoAvailabilityForm, DemoConfirmationForm, DemoOutcomeForm, DemoStateForm } from "./demo-controls";

function AcceptableTimes({ label, value }: { label: string; value: DemoAvailability | null }) {
  return <div className="space-y-2"><h3 className="text-sm font-medium">{label}</h3>
    {value ? <><p className="text-sm text-muted-foreground">Time zone: {value.timeZone}</p>
      <ul className="space-y-2 text-sm">{value.windows.map((window) => <li key={`${window.startAt}-${window.endAt}`}>
        {displayTime(window.startAt, value.timeZone)} to {displayTime(window.endAt, value.timeZone)}</li>)}</ul>
      {value.note && <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{value.note}</p>}</>
      : <p className="text-sm text-muted-foreground">Acceptable times have not been supplied.</p>}
  </div>;
}
export async function DemoWorkspace({ view, searchParams }: {
  view: "staff" | "customer" | "vendor"; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  requireLaunchArea("candidate-b");
  if (view === "staff") await requirePagePermission("admin.access", { kind: "platform" });
  const { authorization } = view === "staff" ? await requireSelectedOrganizationPermission("rfp.approve") : await requirePortalPageAccess(view);
  if (authorization.scope.kind !== "organization") forbidden();
  const query = z.object({ after: z.uuid().optional(), choiceCandidate: z.uuid().optional(), choiceRecipient: z.uuid().optional(),
    demo: z.uuid().optional(), afterRevision: z.coerce.number().int().min(0).max(9999).optional() })
    .refine((value) => Boolean(value.choiceCandidate) === Boolean(value.choiceRecipient))
    .refine((value) => value.afterRevision === undefined || value.demo !== undefined).safeParse(await searchParams);
  if (!query.success || (view !== "staff" && query.data.choiceCandidate)) notFound();
  const organizationId = authorization.scope.organizationId;
  const basePath = view === "staff" ? "/admin/demos" : `/${view}/demos`;
  if (query.data.demo) return <DemoHistory organizationId={organizationId} view={view} demoId={query.data.demo}
    afterRevision={query.data.afterRevision ?? 0} basePath={basePath} options={{ supabase: authorization.supabase }} />;
  const page = await getDemoCoordination({ view, organizationId, correlationId: randomUUID(), afterId: query.data.after,
    afterChoice: query.data.choiceCandidate ? { candidateId: query.data.choiceCandidate, recipientId: query.data.choiceRecipient! } : undefined }, { supabase: authorization.supabase });
  function pageLink(values: Record<string, string>) {
    const params = new URLSearchParams();
    if (query.success) for (const key of ["after", "choiceCandidate", "choiceRecipient"] as const) {
      const value = query.data[key]; if (value) params.set(key, value);
    }
    for (const [key, value] of Object.entries(values)) params.set(key, value);
    return `${basePath}?${params}`;
  }
  return <main className="mx-auto w-full max-w-4xl space-y-8 px-6 py-10">
    <header className="space-y-3"><Link className="inline-flex min-h-11 items-center text-sm underline" href={view === "staff" ? "/admin" : `/${view}`}>Back to {view === "staff" ? "administration" : `${view} workspace`}</Link>
      <h1 className="text-balance text-3xl font-semibold">Demo coordination</h1>
      <p className="text-sm leading-7">Customer and vendor users supply acceptable times. MMHR confirms the schedule and records the outcome.</p>
      {view === "staff" && <Link className="inline-flex min-h-11 items-center text-sm underline" href="/workspaces">Change customer workspace</Link>}
    </header>
    {view === "staff" && <DemoPlanForm key={`${query.data.choiceCandidate ?? "first"}:${query.data.choiceRecipient ?? "first"}`} organizationId={organizationId} choices={page.choices} />}
    {view === "staff" && page.nextChoiceCursor && <Link className="inline-flex min-h-11 items-center underline"
      href={pageLink({ choiceCandidate: page.nextChoiceCursor.candidateId, choiceRecipient: page.nextChoiceCursor.recipientId })}>More products and requests</Link>}
    {page.items.length === 0 && <p className="rounded-lg border p-5 text-sm">No demo plans have been recorded in this workspace.</p>}
    <div className="space-y-6">{page.items.map((item) => {
      const state = item.coordination, schedule = state.schedule, outcome = state.outcome;
      return <article key={item.demoId} className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]">
        <header className="space-y-2"><h2 className="text-xl font-semibold">{item.vendorName} · Round {state.plan.round}</h2>
          <p className="text-sm">Customer: {item.customerName}</p><p className="text-sm font-medium">Status: {item.status === "scheduled" ? "Confirmed" : item.status.replaceAll("_", " ")} · Revision {item.revision}</p></header>
        <Link className="inline-flex min-h-11 items-center text-sm underline" href={`${basePath}?demo=${item.demoId}`}>View change history</Link>
        <dl className="space-y-3 text-sm"><div><dt className="font-medium">Audience</dt><dd>{state.plan.audience}</dd></div>
          <div><dt className="font-medium">Purpose</dt><dd className="whitespace-pre-wrap">{state.plan.purpose}</dd></div>
          <div><dt className="font-medium">Format</dt><dd>{state.plan.format}</dd></div></dl>
        <div className="space-y-2"><h3 className="text-sm font-medium">Required topics</h3><ul className="list-disc space-y-2 pl-5 text-sm">{state.plan.requiredTopics.map((topic, index) => <li key={index}>{topic}</li>)}</ul></div>
        <div className="space-y-2"><h3 className="text-sm font-medium">Participants</h3><ul className="space-y-2 text-sm">{state.plan.participants.map((person, index) => <li key={index}>{person.name} · {person.role} · {person.organization}</li>)}</ul></div>
        <AcceptableTimes label="Customer acceptable times" value={state.customerAvailability} />
        <AcceptableTimes label="Vendor acceptable times" value={state.vendorAvailability} />
        {schedule && <section className="space-y-2 rounded-md bg-muted p-4 text-sm"><h3 className="font-semibold">{item.status === "scheduled" ? "Confirmed meeting" : "Recorded meeting"}</h3>
          <p>{displayTime(schedule.window.startAt, schedule.timeZone)} to {displayTime(schedule.window.endAt, schedule.timeZone)}</p>
          <p>Time zone: {schedule.timeZone}</p><p className="whitespace-pre-wrap">Location: {schedule.location}</p>
          <p>Reminder due: {displayTime(schedule.reminderAt, schedule.timeZone)}</p><p className="whitespace-pre-wrap">{schedule.confirmationNote}</p></section>}
        {state.reason && <p className="whitespace-pre-wrap text-sm">Staff reason: {state.reason}</p>}
        {outcome && <section className="space-y-3 border-t pt-4 text-sm"><h3 className="font-semibold">Meeting outcome</h3>
          <p className="whitespace-pre-wrap">{outcome.feedback}</p><p>Score: {outcome.score} of 5</p>
          <ul className="space-y-2">{outcome.attendance.map((person, index) => <li key={index}>{person.name}: {person.attended ? "attended" : "did not attend"}</li>)}</ul>
          {outcome.commitments.length > 0 && <div><h4 className="font-medium">Commitments</h4><ul className="list-disc pl-5">{outcome.commitments.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
          {outcome.requestedChanges.length > 0 && <div><h4 className="font-medium">Requested changes</h4><ul className="list-disc pl-5">{outcome.requestedChanges.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
          <p className="whitespace-pre-wrap">Next action: {outcome.nextAction}</p><p>Due: {displayTime(outcome.nextActionAt, "UTC")} UTC</p></section>}
        {view === "staff" ? <><DemoConfirmationForm organizationId={organizationId} item={item} /><DemoStateForm key={item.revision} organizationId={organizationId} item={item} />
          <DemoOutcomeForm organizationId={organizationId} item={item} meetingEnded={schedule !== null && Date.parse(schedule.window.endAt) <= Date.parse(page.checkedAt)} /></>
          : <DemoAvailabilityForm organizationId={organizationId} item={item} view={view} />}
      </article>;
    })}</div>
    {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={pageLink({ after: page.nextCursor })}>Next demo plans</Link>}
  </main>;
}
