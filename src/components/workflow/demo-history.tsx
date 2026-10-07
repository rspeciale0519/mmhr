import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getDemoCoordinationHistory } from "@/server/commands/demo-coordination";
import type { AuthorizationOptions } from "@/server/auth/authorization";
import { displayDemoTime } from "./demo-format";

export async function DemoHistory({ organizationId, view, demoId, afterRevision, basePath, options }: {
  organizationId: string; view: "staff" | "customer" | "vendor"; demoId: string;
  afterRevision: number; basePath: string; options: AuthorizationOptions;
}) {
  const page = await getDemoCoordinationHistory({ organizationId, view, demoId, afterRevision, correlationId: randomUUID() }, options);
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
    <Link className="inline-flex min-h-11 items-center underline" href={basePath}>Back to demo plans</Link>
    <h1 className="text-3xl font-semibold">Demo change history</h1>
    <p className="text-sm leading-7">Each saved change has a separate revision. Earlier plans, times, and outcomes remain available.</p>
    {page.items.length === 0 && <p>No later revisions are available.</p>}
    {page.items.map((item) => <article key={item.revision} className="space-y-4 rounded-lg border p-5 text-sm [overflow-wrap:anywhere]">
      <h2 className="text-lg font-semibold">Revision {item.revision} · {item.action.replaceAll("_", " ")}</h2>
      <p>Status: {item.status.replaceAll("_", " ")}</p>
      <p>Recorded: {displayDemoTime(item.occurredAt, "UTC")} UTC</p>
      <dl className="space-y-3 whitespace-pre-wrap">
        <div><dt className="font-medium">Round and format</dt><dd>{item.coordination.plan.round} · {item.coordination.plan.format}</dd></div>
        <div><dt className="font-medium">Audience</dt><dd>{item.coordination.plan.audience}</dd></div>
        <div><dt className="font-medium">Purpose</dt><dd>{item.coordination.plan.purpose}</dd></div>
        <div><dt className="font-medium">Participants</dt><dd><ul>{item.coordination.plan.participants.map((person, index) =>
          <li key={index}>{person.name} · {person.role} · {person.organization}</li>)}</ul></dd></div>
        <div><dt className="font-medium">Required topics</dt><dd><ul>{item.coordination.plan.requiredTopics.map((topic, index) => <li key={index}>{topic}</li>)}</ul></dd></div>
        {(["customerAvailability", "vendorAvailability"] as const).map((key) => {
          const availability = item.coordination[key];
          return availability && <div key={key}><dt className="font-medium">{key === "customerAvailability" ? "Customer" : "Vendor"} acceptable times</dt>
            <dd>{availability.timeZone}<ul>{availability.windows.map((window) => <li key={window.startAt}>
              {displayDemoTime(window.startAt, availability.timeZone)} to {displayDemoTime(window.endAt, availability.timeZone)}</li>)}</ul>{availability.note}</dd></div>;
        })}
        {item.coordination.schedule && <div><dt className="font-medium">Recorded meeting</dt><dd>
          {displayDemoTime(item.coordination.schedule.window.startAt, item.coordination.schedule.timeZone)} to {displayDemoTime(item.coordination.schedule.window.endAt, item.coordination.schedule.timeZone)}
          <br />Time zone: {item.coordination.schedule.timeZone}<br />Location: {item.coordination.schedule.location}
          <br />Reminder due: {displayDemoTime(item.coordination.schedule.reminderAt, item.coordination.schedule.timeZone)}<br />{item.coordination.schedule.confirmationNote}</dd></div>}
        {item.coordination.outcome && <div><dt className="font-medium">Outcome</dt><dd>{item.coordination.outcome.feedback}
          <br />Score: {item.coordination.outcome.score} of 5<br />Next action: {item.coordination.outcome.nextAction}
          <br />Due: {displayDemoTime(item.coordination.outcome.nextActionAt, "UTC")} UTC
          <ul>{item.coordination.outcome.attendance.map((person, index) => <li key={index}>{person.name}: {person.attended ? "attended" : "did not attend"}</li>)}</ul>
          <ul>{item.coordination.outcome.commitments.map((text, index) => <li key={index}>Commitment: {text}</li>)}</ul>
          <ul>{item.coordination.outcome.requestedChanges.map((text, index) => <li key={index}>Requested change: {text}</li>)}</ul></dd></div>}
        {item.coordination.reason && <div><dt className="font-medium">Staff reason</dt><dd>{item.coordination.reason}</dd></div>}
      </dl>
    </article>)}
    {page.nextRevision && <Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?demo=${demoId}&afterRevision=${page.nextRevision}`}>Next revisions</Link>}
  </main>;
}
