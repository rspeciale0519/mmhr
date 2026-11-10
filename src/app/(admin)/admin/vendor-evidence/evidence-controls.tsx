"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { WorkflowCommand, workflowInputClass } from "@/components/workflow-command";
import { Button } from "@/components/ui/button";
import type { VendorEvidencePage } from "@/server/crm/vendor-evidence-contract";
import { ScopeFields, scopeValueFromForm } from "./scope-fields";
import { DeliveryFields, deliveryValueFromForm } from "./delivery-fields";

type Choice = { recordId: string; label: string };
export function EvidenceCapture({ organizationId, vendorProfileId, products }: {
  organizationId: string; vendorProfileId: string; products: readonly Choice[];
}) {
  const trpc = useTRPC();
  const record = useMutation(trpc.vendorEvidence.record.mutationOptions());
  const [captureNumber, setCaptureNumber] = useState(0);
  const [saved, setSaved] = useState(false);
  const [recordType, setRecordType] = useState("fact");
  return <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-7" aria-labelledby="capture-heading">
    <h2 id="capture-heading" className="text-xl font-semibold">Record a new vendor fact</h2>
    <p className="text-sm leading-6 text-muted-foreground">Record the source and product scope. Save the draft, then review it below.</p>
    <WorkflowCommand<Parameters<typeof record.mutateAsync>[0]> key={captureNumber} label="Save evidence draft" success="Evidence draft saved. Review the saved record below."
      disabled={products.length === 0} prepare={(data) => {
        const sourceId = crypto.randomUUID(), factId = crypto.randomUUID(), evidenceId = crypto.randomUUID();
        const capturedAt = new Date(String(data.get("capturedAt"))).toISOString();
        const freshUntil = new Date(String(data.get("freshUntil"))).toISOString();
        if (freshUntil <= capturedAt) throw new Error("Invalid evidence dates");
        const productId = String(data.get("product"));
        if (!products.some((product) => product.recordId === productId)) throw new Error("Invalid product");
        return {
          source: { sourceId, organizationId, vendorProfileId, uri: String(data.get("uri")), sourceType: "vendor_owned",
            licenseNote: String(data.get("licenseNote")) || null, capturedAt, active: true,
            captureMethod: "manual", cadenceDays: Number(data.get("cadenceDays")) },
          fact: { factId, organizationId, vendorProfileId, productId,
            fieldKey: data.get("recordType") === "scope" ? "comparison_fact_scopes" : data.get("recordType") === "addon" ? "comparison_addon_inclusions" : data.get("recordType") === "limits" ? "comparison_limitation_reviews" : String(data.get("fieldKey")),
            value: data.get("recordType") === "scope" ? scopeValueFromForm(data) : data.get("recordType") === "addon" || data.get("recordType") === "limits" ? deliveryValueFromForm(data) : String(data.get("value")), observedAt: capturedAt, status: "draft" },
          evidence: { evidenceId, organizationId, factId, sourceId, version: 1, contentHash: "",
            capturedAt, freshUntil, citation: String(data.get("citation")).trim() },
        };
      }} execute={async (input) => {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.evidence.citation));
        const contentHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
        const result = await record.mutateAsync({ ...input, evidence: { ...input.evidence, contentHash } });
        setSaved(true);
        return result;
      }}>
      <label className="block text-sm font-medium">Product<select name="product" required className={workflowInputClass}>
        <option value="">Select a product</option>{products.map((product) => <option key={product.recordId} value={product.recordId}>{product.label}</option>)}
      </select></label>
      <label className="block text-sm font-medium">Record type<select name="recordType" value={recordType} onChange={(event) => setRecordType(event.target.value)} className={workflowInputClass}>
        <option value="fact">Capability or estimate</option><option value="scope">Package and regional conditions</option>
        <option value="addon">Paid addition inclusion</option><option value="limits">Feature limits review</option>
      </select></label>
      {recordType === "scope" ? <ScopeFields/> : recordType === "addon" || recordType === "limits" ? <DeliveryFields key={recordType} kind={recordType}/> : <>
        <label className="block text-sm font-medium">Approved field key<input name="fieldKey" required pattern="[a-z][a-z0-9_]*" maxLength={100} className={workflowInputClass}/></label>
        <label className="block text-sm font-medium">Fact value<textarea name="value" required maxLength={2000} rows={3} className={workflowInputClass}/></label>
      </>}
      <label className="block text-sm font-medium">Official source URL<input name="uri" type="url" pattern="https://.*" required className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">Source permission or license note<input name="licenseNote" maxLength={500} className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">Source review interval in days<input name="cadenceDays" type="number" min={1} max={3650} defaultValue={90} required className={workflowInputClass}/></label>
      <p className="text-sm">You become the source owner when you save. This form records a manual source review. Use 30 days for cost or setup sources.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Source capture date<input name="capturedAt" type="datetime-local" required className={workflowInputClass}/></label>
        <label className="block text-sm font-medium">Evidence expiry<input name="freshUntil" type="datetime-local" required className={workflowInputClass}/></label>
      </div>
      <label className="block text-sm font-medium">Evidence notes<textarea name="citation" required maxLength={1000} rows={4} className={workflowInputClass}/></label>
      <p className="text-sm leading-6 text-muted-foreground">Record the plan, purchased modules, region, worker types, and restrictions. Keep unsupported facts unknown.</p>
    </WorkflowCommand>
    {saved && <Button type="button" variant="outline" onClick={() => { setSaved(false); setCaptureNumber((value) => value + 1); }}>Record another fact</Button>}
  </section>;
}

export function EvidenceReview({ item }: { item: VendorEvidencePage["items"][number] }) {
  const trpc = useTRPC();
  const decide = useMutation(trpc.vendorEvidence.decide.mutationOptions());
  if (item.review) return <p className="text-sm font-medium">Review: {item.review.decision} · {new Date(item.review.decidedAt).toISOString().slice(0, 10)}</p>;
  return <WorkflowCommand<Parameters<typeof decide.mutateAsync>[0]> label="Save review decision" success="Evidence review saved."
    prepare={(data) => ({ approvalId: crypto.randomUUID(), organizationId: item.evidence.organizationId,
      evidenceId: item.evidence.evidenceId, decision: data.get("decision") === "approved" ? "approved" : "rejected",
      decidedAt: new Date().toISOString(), reason: String(data.get("reason")) })}
    execute={(input) => decide.mutateAsync(input)}>
    <label className="block text-sm font-medium">Review decision<select name="decision" required className={workflowInputClass} defaultValue="rejected">
      <option value="rejected">Reject evidence</option><option value="approved">Approve evidence</option>
    </select></label>
    <label className="block text-sm font-medium">Review reason<textarea name="reason" required maxLength={500} className={workflowInputClass}/></label>
    <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" required className="mt-1"/>I checked the source, product scope, restrictions, and evidence dates.</label>
  </WorkflowCommand>;
}

export function EvidenceRenewal({ item }: { item: VendorEvidencePage["items"][number] }) {
  const trpc = useTRPC();
  const record = useMutation(trpc.vendorEvidence.record.mutationOptions());
  if (!item.review || item.fact.status === "archived") return null;
  return <details className="rounded-lg border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Record updated source evidence</summary>
    <p className="my-4 text-sm leading-6">Check that the source still supports this exact fact. A new version needs review before a new comparison can use it.</p>
    <WorkflowCommand<Parameters<typeof record.mutateAsync>[0]> label="Save new evidence version" success="New evidence version saved. Review it before preparing a comparison."
      prepare={(data) => {
        const sourceId = crypto.randomUUID(), evidenceId = crypto.randomUUID();
        const capturedAt = new Date(String(data.get("renewCapturedAt"))).toISOString();
        const freshUntil = new Date(String(data.get("renewFreshUntil"))).toISOString();
        if (freshUntil <= capturedAt || Date.parse(capturedAt) < Date.parse(item.evidence.capturedAt)) throw new Error("Invalid renewal dates");
        return { expectedEvidenceVersion: item.evidence.version,
          source: { ...item.source, sourceId, capturedAt, active: true, uri: String(data.get("renewUri")),
            licenseNote: String(data.get("renewLicense")) || null, captureMethod: "manual" as const,
            cadenceDays: Number(data.get("renewCadenceDays")) },
          fact: { ...item.fact, status: "draft" as const },
          evidence: { ...item.evidence, evidenceId, sourceId, version: item.evidence.version + 1,
            capturedAt, freshUntil, contentHash: "", citation: String(data.get("renewCitation")).trim() } };
      }} execute={async (input) => {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.evidence.citation));
        const contentHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
        return record.mutateAsync({ ...input, evidence: { ...input.evidence, contentHash } });
      }}>
      <label className="block text-sm font-medium">Updated source URL<input name="renewUri" type="url" pattern="https://.*" required defaultValue={item.source.uri} className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">Source permission note<input name="renewLicense" maxLength={500} defaultValue={item.source.licenseNote ?? ""} className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">Updated source review interval in days<input name="renewCadenceDays" type="number" min={1} max={3650} defaultValue={item.registry?.cadenceDays ?? 30} required className={workflowInputClass}/></label>
      <p className="text-sm">You become the owner of the new source record. Earlier source records remain unchanged.</p>
      <label className="block text-sm font-medium">New capture date<input name="renewCapturedAt" type="datetime-local" required className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">New evidence expiry<input name="renewFreshUntil" type="datetime-local" required className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">New source findings<textarea name="renewCitation" required maxLength={1000} rows={3} className={workflowInputClass}/></label>
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" required className="mt-1"/>The new source supports the unchanged fact and its restrictions.</label>
    </WorkflowCommand>
  </details>;
}
