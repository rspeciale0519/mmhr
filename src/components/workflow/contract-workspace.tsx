import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden, notFound } from "next/navigation";
import { requirePagePermission, requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getIntakesPage } from "@/server/commands/intake-read";
import { getVendorRfps } from "@/server/commands/rfp-portal";
import { getPortalContractHandoffHistory, getPortalContractHandoffs } from "@/server/commands/contract-handoff-portal";
import { ContractSelectionDecision, ContractSelectionForm } from "./contract-selection-form";
import { ContractHandoffForm } from "./contract-handoff-form";
import { displayProposalTime } from "./proposal-display";

type View = "staff" | "customer" | "vendor";
export async function ContractWorkspace({ view, searchParams }: { view: View; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (view === "staff") await requirePagePermission("admin.access", { kind: "platform" });
  const { authorization } = view === "staff" ? await requireSelectedOrganizationPermission("rfp.approve") : await requirePortalPageAccess(view);
  if (authorization.scope.kind !== "organization") forbidden();
  const query = z.strictObject({ intake: z.uuid().optional(), recipient: z.uuid().optional(), after: z.uuid().optional(), choicesAfter: z.uuid().optional(),
    history: z.uuid().optional(), beforeRevision: z.coerce.number().int().min(1).max(9999).optional() })
    .refine(value => view === "vendor" ? !value.intake : !value.recipient)
    .refine(value => !value.choicesAfter || !(value.intake || value.recipient || value.history || value.after || value.beforeRevision))
    .refine(value => !(value.after || value.history) || (view === "vendor" ? !!value.recipient : !!value.intake))
    .refine(value => !value.beforeRevision || !!value.history).refine(value => !(value.history && value.after)).safeParse(await searchParams);
  if (!query.success) notFound();
  const organizationId = authorization.scope.organizationId, options = { supabase: authorization.supabase };
  const basePath = view === "staff" ? "/admin/contracts" : `/${view}/contracts`;
  const frame = (children: React.ReactNode) => <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10"><header className="space-y-3">
    <Link className="inline-flex min-h-11 items-center text-sm underline" href={view === "staff" ? "/admin" : `/${view}`}>Back to {view === "staff" ? "administration" : `${view} workspace`}</Link>
    <h1 className="text-balance text-3xl font-semibold">Vendor selection and contract handoff</h1>
    <p className="text-sm leading-7">The customer and vendor negotiate legal terms directly. MMHR records decisions, introductions, and contract status.</p>
    {view === "staff" && <Link className="inline-flex min-h-11 items-center text-sm underline" href="/workspaces">Change customer workspace</Link>}</header>{children}</main>;
  if (view === "vendor" && !query.data.recipient) {
    const page = await getVendorRfps({ organizationId, correlationId: randomUUID(), afterId: query.data.choicesAfter }, options);
    return frame(<section className="space-y-5"><h2 className="text-xl font-semibold">Choose a delivered request</h2>{page.items.length === 0 && <p>No delivered requests are available.</p>}
      <ul className="divide-y">{page.items.map(item => <li key={item.recipientId} className="py-3"><Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?recipient=${item.recipientId}`}>{item.title}</Link></li>)}</ul>
      {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?choicesAfter=${page.nextCursor}`}>Next delivered requests</Link>}</section>);
  }
  if (view !== "vendor" && !query.data.intake) {
    const page = await getIntakesPage({ organizationId, afterId: query.data.choicesAfter }, options);
    return frame(<section className="space-y-5"><h2 className="text-xl font-semibold">Choose a customer intake</h2>{page.intakes.length === 0 && <p>No saved intakes are available.</p>}
      <ul className="divide-y">{page.intakes.map(item => <li key={item.intakeId} className="py-3"><Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?intake=${item.intakeId}`}>Intake · {item.status} · {displayProposalTime(item.createdAt)}</Link></li>)}</ul>
      {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?choicesAfter=${page.nextCursor}`}>Next intakes</Link>}</section>);
  }
  const scope = view === "vendor" ? { view, organizationId, recipientId: query.data.recipient! } : { view, organizationId, intakeId: query.data.intake! };
  const params = new URLSearchParams(view === "vendor" ? { recipient: query.data.recipient! } : { intake: query.data.intake! });
  const scopedPath = `${basePath}?${params}`;
  const denied = (error: unknown): never => { if (error instanceof AuthorizationError) notFound(); throw error; };
  if (query.data.history) {
    const history = await getPortalContractHandoffHistory({ ...scope, correlationId: randomUUID(), handoffId: query.data.history, beforeRevision: query.data.beforeRevision }, options).catch(denied);
    const historyParams = new URLSearchParams(params); historyParams.set("history", query.data.history);
    if (history.nextRevision !== null) historyParams.set("beforeRevision", String(history.nextRevision));
    return frame(<section className="space-y-5"><Link className="inline-flex min-h-11 items-center underline" href={scopedPath}>Back to contract records</Link>
      <h2 className="text-xl font-semibold">Contract status history</h2>{history.events.length === 0 && <p>No status changes are recorded.</p>}
      <ul className="divide-y">{history.events.map(event => <li className="space-y-2 py-4 [overflow-wrap:anywhere]" key={event.eventId}>
        <p className="font-medium">{event.fromStatus.replaceAll("_", " ")} → {event.toStatus.replaceAll("_", " ")}</p><p className="text-sm">Recorded: {displayProposalTime(event.occurredAt)}</p><p className="whitespace-pre-wrap text-sm">{event.reason}</p></li>)}</ul>
      {history.nextRevision !== null && <Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?${historyParams}`}>Older contract status changes</Link>}</section>);
  }
  const page = await getPortalContractHandoffs({ ...scope, correlationId: randomUUID(), afterId: query.data.after }, options).catch(denied);
  return frame(<><nav aria-label="Contract record navigation" className="flex flex-wrap gap-x-6 gap-y-2">
    <Link className="inline-flex min-h-11 items-center underline" href={basePath}>Choose another {view === "vendor" ? "request" : "intake"}</Link>
    <Link className="inline-flex min-h-11 items-center text-sm underline" href={`${view === "staff" ? "/admin" : `/${view}`}/proposals?${params}`}>Read proposal quotes and comparisons</Link></nav>
    {view === "customer" && page.canSelect && <ContractSelectionForm key={page.choices.map(choice => `${choice.proposalVersionId}:${choice.quoteRevision}`).join(",")} organizationId={organizationId} intakeId={query.data.intake!} choices={page.choices}/>}
    <section className="space-y-5"><h2 className="text-2xl font-semibold">Saved contract decisions</h2>{page.items.length === 0 && <p>No {view === "vendor" ? "approved " : ""}contract decisions are available.</p>}
      {page.items.map(item => <article key={item.selectionId} className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]">
        <header className="space-y-2"><h3 className="text-xl font-semibold">{item.vendorName}</h3><p className="text-sm">Quote: {item.quoteReference}</p><p className="text-sm">Selection: {item.state}</p>
          <p className="text-sm">Selected: {displayProposalTime(item.selectedAt)}</p>{item.decidedAt && <p className="text-sm">Decision recorded: {displayProposalTime(item.decidedAt)}</p>}
          {item.state === "pending" && !item.current && <p className="text-sm">The selected quote is no longer current. Staff approval is unavailable.</p>}</header>
        {view !== "vendor" && <><section><h4 className="font-medium">Selection reasons</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{item.selectionReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></section>
          <section><h4 className="font-medium">Remaining risks</h4>{item.remainingRisks.length === 0 ? <p className="mt-2 text-sm">No remaining risks were recorded.</p> : <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{item.remainingRisks.map((risk, index) => <li key={index}>{risk}</li>)}</ul>}</section></>}
        {item.decisionReason && <p className="whitespace-pre-wrap text-sm">Staff decision reason: {item.decisionReason}</p>}
        {item.status && <section className="space-y-3"><h4 className="font-medium">Contract status: {item.status.replaceAll("_", " ")}</h4>
          {item.introducedAt && <p className="text-sm">Introduction: {displayProposalTime(item.introducedAt)} · {item.introductionReference}</p>}
          {item.signedAt && <p className="text-sm">Signed: {displayProposalTime(item.signedAt)} · {item.contractReference}</p>}
          {item.events.length > 0 && <ul className="space-y-2 text-sm">{item.events.map(event => <li key={event.eventId}>{event.toStatus.replaceAll("_", " ")} · {displayProposalTime(event.occurredAt)}</li>)}</ul>}
          <Link className="inline-flex min-h-11 items-center text-sm underline" href={`${scopedPath}&history=${item.handoffId}`}>Read contract status history</Link></section>}
        {(item.canApprove || item.canReject || item.canWithdraw) && <ContractSelectionDecision key={`decision:${item.revision}`} organizationId={organizationId} item={item}/>}
        {view === "staff" && item.canIntroduce && <ContractHandoffForm key={`intro:${item.handoffRevision}`} organizationId={organizationId} item={item} introduction/>}
        {view === "staff" && item.canUpdate && <ContractHandoffForm key={`status:${item.handoffRevision}`} organizationId={organizationId} item={item}/>}
      </article>)}
      {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`${scopedPath}&after=${page.nextCursor}`}>Next contract decisions</Link>}
    </section></>);
}
