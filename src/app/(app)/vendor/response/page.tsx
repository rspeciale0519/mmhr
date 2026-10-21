import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden, notFound } from "next/navigation";
import { AuthorizationError } from "@/server/auth/authorization";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getPortalResponses } from "@/server/commands/rfp-portal-response";
import { ResponseList } from "@/components/workflow/response-list";
import { ResponseForm } from "./response-form";
import { getPortalClarifications } from "@/server/commands/portal-clarification";
import { VendorClarifications } from "@/components/workflow/clarification-controls";

export default async function VendorResponse({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { authorization } = await requirePortalPageAccess("vendor");
  if (authorization.scope.kind !== "organization") forbidden();
  const query = z.object({ recipient: z.uuid(), after: z.uuid().optional(), clarificationsAfter: z.uuid().optional() }).safeParse(await searchParams);
  if (!query.success) notFound();
  const organizationId = authorization.scope.organizationId;
  let page;
  let clarifications;
  try {
    [page, clarifications] = await Promise.all([
      getPortalResponses({ organizationId, recipientId: query.data.recipient, afterId: query.data.after, view: "vendor", correlationId: randomUUID() }, { supabase: authorization.supabase }),
      getPortalClarifications({ organizationId, recipientId: query.data.recipient, afterId: query.data.clarificationsAfter, view: "vendor", correlationId: randomUUID() }, { supabase: authorization.supabase }),
    ]);
  } catch (error) { if (error instanceof AuthorizationError) notFound(); throw error; }
  if (!page.request || page.currentRevision === null) notFound();
  return <main className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">
    <Link className="inline-flex min-h-11 items-center text-sm underline" href="/vendor">Back to vendor inbox</Link>
    <header className="space-y-3"><h1 className="text-balance text-3xl font-semibold">{page.request.title}</h1>
      <p className="text-sm">Response deadline: {new Date(page.request.deadlineAt).toLocaleString()}</p></header>
    <section className="space-y-3 border-b pb-8"><h2 className="text-xl font-semibold">RFP questionnaire</h2>
      <div className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{page.request.content}</div></section>
    <ResponseForm key={page.currentRevision} organizationId={organizationId} recipientId={query.data.recipient} expectedRevision={page.currentRevision} closed={page.request.closed} />
    <section className="space-y-5 border-t pt-8"><h2 className="text-xl font-semibold">Staff clarification questions</h2>
      {clarifications.items.length === 0 && <p className="text-sm">No clarification questions have been recorded.</p>}
      <VendorClarifications organizationId={organizationId} items={clarifications.items} />
      {clarifications.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/vendor/response?recipient=${query.data.recipient}&clarificationsAfter=${clarifications.nextCursor}`}>Next clarification questions</Link>}
    </section>
    <section className="space-y-5 border-t pt-8"><h2 className="text-xl font-semibold">Saved responses</h2>
      {page.items.length === 0 && <p className="text-sm">No response has been submitted.</p>}
      <ResponseList items={page.items} />
      {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/vendor/response?recipient=${query.data.recipient}&after=${page.nextCursor}`}>Next saved responses</Link>}
    </section>
  </main>;
}
