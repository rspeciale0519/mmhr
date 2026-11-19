import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";

import { RFP_ANSWER_CHOICES, RFP_REQUESTED_DOCUMENTS, selectRfpTabs } from "@/lib/rfp-form-library";
import { CLIENT_OVERVIEW_FIELDS } from "@/lib/rfp-vendor-form";
import { AuthorizationError } from "@/server/auth/authorization";
import { requirePagePermission } from "@/server/auth/page-guards";
import { getRfpVendorForm } from "@/server/commands/rfp-vendor-forms";
import { RfpTrackingCard } from "../tracking-card";

/**
 * Staff page: everything one vendor entered on one RFP web form.
 * Shows the tracking card, the uploaded files, and every answer by tab.
 */

/** Label for each answer value, e.g. "within_12_months" -> "Within 12 months". */
const answerLabels: Record<string, string> = Object.fromEntries(RFP_ANSWER_CHOICES.map((choice) => [choice.value, choice.label]));
/** Label for each document key. */
const documentLabels: Record<string, string> = { ...Object.fromEntries(RFP_REQUESTED_DOCUMENTS.map((doc) => [doc.key, doc.label])), other: "Other supporting document" };

export default async function StaffRfpFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const { authorization } = await requirePagePermission("admin.access", { kind: "platform" });
  const { formId } = await params;
  if (!z.uuid().safeParse(formId).success) notFound();
  let form;
  try {
    form = await getRfpVendorForm(formId, { supabase: authorization.supabase });
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }
  const tabs = selectRfpTabs(form.tabKeys);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:px-8">
      <header className="space-y-2">
        <Link href="/admin/evaluations" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Customer evaluations</Link>
        <h1 className="text-balance text-3xl font-semibold">{form.vendorName}: RFP response</h1>
        <p className="text-sm text-muted-foreground">{form.customerName} · {form.rfpTitle}</p>
      </header>

      <RfpTrackingCard form={form} heading="vendor" />

      <section className="space-y-3" aria-labelledby="files-heading">
        <h2 id="files-heading" className="text-xl font-semibold">Uploaded files</h2>
        {form.files.length === 0 ? <p className="text-sm">No files uploaded.</p> : (
          <ul className="divide-y border-y">
            {form.files.map((file) => (
              <li key={file.fileId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="[overflow-wrap:anywhere]"><span className="font-medium">{documentLabels[file.documentKey] ?? file.documentKey}:</span> {file.fileName}</span>
                {/* A plain link, so the browser downloads the file. */}
                <a href={`/admin/rfp-forms/${form.formId}/files/${file.fileId}`} className="inline-flex min-h-11 items-center underline underline-offset-4">Download</a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">Files come from outside the company and are not virus-scanned. Open them with care.</p>
      </section>

      <section className="space-y-3" aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="text-xl font-semibold">Client overview sent to the vendor</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {CLIENT_OVERVIEW_FIELDS.filter((field) => form.clientOverview[field.key]).map((field) => (
            <div key={field.key} className="contents"><dt className="text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{form.clientOverview[field.key]}</dd></div>
          ))}
        </dl>
      </section>

      {tabs.map((tab) => (
        <section key={tab.key} className="space-y-2" aria-labelledby={`tab-${tab.key}`}>
          <h2 id={`tab-${tab.key}`} className="text-xl font-semibold">{tab.title}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead><tr className="border-b"><th scope="col" className="py-2 pr-4 font-medium">Requirement</th><th scope="col" className="w-36 py-2 pr-4 font-medium">Answer</th><th scope="col" className="w-64 py-2 font-medium">Comment</th></tr></thead>
              <tbody>
                {tab.items.map((item, index) => item.kind === "heading"
                  ? <tr key={`heading-${index}`} className="border-b bg-muted/60"><th scope="colgroup" colSpan={3} className="px-2 py-2 font-semibold">{item.text}</th></tr>
                  : <tr key={item.key} className="border-b align-top">
                      <td className={`py-2 pr-4 ${item.indent ? "pl-6" : ""}`}>{item.text}</td>
                      <td className="py-2 pr-4 font-medium">{answerLabels[form.answers[item.key]?.answer ?? ""] ?? <span className="font-normal text-muted-foreground">No answer</span>}</td>
                      <td className="whitespace-pre-wrap py-2 [overflow-wrap:anywhere]">{form.answers[item.key]?.comment ?? ""}</td>
                    </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
