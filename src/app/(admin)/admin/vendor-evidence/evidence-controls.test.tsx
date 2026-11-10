import { randomUUID, webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EvidenceCapture, EvidenceReview, EvidenceRenewal } from "./evidence-controls";
import type { VendorEvidencePage } from "@/server/crm/vendor-evidence-contract";
const state = vi.hoisted(() => ({ record: vi.fn(), decide: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ vendorEvidence: {
  record: { mutationOptions: () => ({ kind: "record" }) }, decide: { mutationOptions: () => ({ kind: "decide" }) },
} }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: ({ kind }: { kind: "record" | "decide" }) => ({ mutateAsync: state[kind] }) }));
const organizationId = randomUUID(), vendorProfileId = randomUUID(), productId = randomUUID();
beforeEach(() => {
  vi.clearAllMocks(); state.record.mockReset().mockResolvedValue({}); state.decide.mockReset().mockResolvedValue({});
  vi.stubGlobal("crypto", { randomUUID, subtle: webcrypto.subtle });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function capture(products = [{ recordId: productId, label: "Reviewed HR and Payroll" }]) {
  render(<EvidenceCapture organizationId={organizationId} vendorProfileId={vendorProfileId} products={products}/>);
}
function fillCapture() {
  for (const [label, value] of Object.entries({ Product: productId, "Approved field key": "payroll_us",
    "Fact value": "yes", "Official source URL": "https://vendor.example/payroll", "Source capture date": "2026-09-15T10:00",
    "Evidence expiry": "2026-10-15T10:00", "Evidence notes": "US payroll module; W-2 employees; purchased module required." })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
test("requires an available product before capture", () => {
  capture([]);
  expect(screen.getByRole("button", { name: "Save evidence draft" })).toBeDisabled();
});

test("renews the unchanged fact and retains the version guard on retry", async () => {
  const factId = randomUUID(), sourceId = randomUUID();
  const item: VendorEvidencePage["items"][number] = {
    productName: "Synthetic payroll",
    source: { sourceId, organizationId, vendorProfileId, uri: "https://vendor.example/payroll", sourceType: "manual",
      licenseNote: null, capturedAt: "2026-09-01T00:00:00Z", active: true },
    fact: { factId, organizationId, vendorProfileId, productId, fieldKey: "payroll_us", value: "yes",
      observedAt: "2026-09-01T00:00:00Z", status: "published" },
    evidence: { evidenceId: randomUUID(), organizationId, factId, sourceId, version: 2, contentHash: "a".repeat(64),
      capturedAt: "2026-09-01T00:00:00Z", freshUntil: "2026-09-10T00:00:00Z", citation: "Original source" },
    review: { approvalId: randomUUID(), organizationId, evidenceId: randomUUID(), reviewerIdentityId: randomUUID(),
      decision: "approved", decidedAt: "2026-09-02T00:00:00Z", reason: "Checked" },
  };
  state.record.mockRejectedValueOnce(new Error("Uncertain"));
  render(<EvidenceRenewal item={item}/>);
  fireEvent.click(screen.getByText("Record updated source evidence"));
  for (const [label, value] of Object.entries({ "New capture date": "2026-09-15T10:00",
    "New evidence expiry": "2026-10-15T10:00", "New source findings": "The source confirms the same payroll scope." })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.submit(screen.getByText("Save new evidence version").closest("form")!);
  await screen.findByText("Retry same request");
  const first = state.record.mock.calls[0][0];
  expect(first).toMatchObject({ expectedEvidenceVersion: 2, fact: { factId, value: "yes", status: "draft" }, evidence: { version: 3 } });
  expect(first.source.sourceId).not.toBe(sourceId);
  expect(first.source).toMatchObject({ captureMethod: "manual", cadenceDays: 30 });
  fireEvent.click(screen.getByText("Retry same request"));
  await waitFor(() => expect(state.record).toHaveBeenCalledTimes(2));
  expect(state.record.mock.calls[1][0]).toEqual(first);
});

test("saves typed package conditions through the existing evidence command", async () => {
  capture(); fillCapture();
  fireEvent.change(screen.getByLabelText("Record type"), { target: { value: "scope" } });
  for (const [label, value] of Object.entries({ "Capability key": "payroll_us", "Saved question key": "configuration",
    "Answer field path": "modules\npayroll", "Answer type": "boolean", "Allowed answers": "true" })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await waitFor(() => expect(state.record).toHaveBeenCalledTimes(1));
  const { fact } = state.record.mock.calls[0][0];
  expect(fact.fieldKey).toBe("comparison_fact_scopes");
  expect(JSON.parse(fact.value)).toEqual({ payroll_us: { version: 1, conditions: [
    { kind: "module", requirementKey: "configuration", responsePath: ["modules", "payroll"], allowedValues: [true] },
  ] } });
});

test("requires an explicit unrestricted choice and rejects invalid boolean answers", async () => {
  capture(); fillCapture();
  fireEvent.change(screen.getByLabelText("Record type"), { target: { value: "scope" } });
  fireEvent.change(screen.getByLabelText("Capability key"), { target: { value: "payroll_us" } });
  fireEvent.change(screen.getByLabelText("Saved question key"), { target: { value: "configuration" } });
  fireEvent.change(screen.getByLabelText("Answer type"), { target: { value: "boolean" } });
  fireEvent.change(screen.getByLabelText("Allowed answers"), { target: { value: "yes" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await screen.findByRole("alert");
  expect(state.record).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Condition type"), { target: { value: "unrestricted" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await waitFor(() => expect(state.record).toHaveBeenCalledTimes(1));
  expect(JSON.parse(state.record.mock.calls[0][0].fact.value)).toEqual({ payroll_us: { version: 1, conditions: [] } });
});
test("retains the captured bundle and content hash when retrying an uncertain save", async () => {
  state.record.mockRejectedValueOnce(new Error("unavailable"));
  capture(); fillCapture();
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await screen.findByRole("button", { name: "Retry same request" });
  const first = state.record.mock.calls[0][0];
  expect(first.fact).toMatchObject({ productId, vendorProfileId, status: "draft", fieldKey: "payroll_us" });
  expect(first.source).toMatchObject({ captureMethod: "manual", cadenceDays: 90 });
  expect(first.evidence.contentHash).toMatch(/^[a-f0-9]{64}$/);
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(state.record).toHaveBeenCalledTimes(2));
  expect(state.record.mock.calls[1][0]).toEqual(first);
  await screen.findByText("Evidence draft saved. Review the saved record below.");
});
test("rejects expiry before capture without sending a record", async () => {
  capture(); fillCapture();
  fireEvent.change(screen.getByLabelText("Evidence expiry"), { target: { value: "2026-09-01T10:00" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await screen.findByRole("alert");
  expect(state.record).not.toHaveBeenCalled();
});
test("keeps an existing review read-only", () => {
  const item = { review: { decision: "approved", decidedAt: "2026-09-15T10:00:00Z" } } as VendorEvidencePage["items"][number];
  render(<EvidenceReview item={item}/>);
  expect(screen.getByText("Review: approved · 2026-09-15")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(state.decide).not.toHaveBeenCalled();
});

test.each([
  ["addon", "comparison_addon_inclusions"],
  ["limits", "comparison_limitation_reviews"],
])("records reviewed delivery conditions for %s", async (kind, fieldKey) => {
  capture(); fillCapture();
  fireEvent.change(screen.getByLabelText("Record type"), { target: { value: kind } });
  fireEvent.change(screen.getByLabelText("Capability key"), { target: { value: "payroll_us" } });
  fireEvent.change(screen.getByLabelText("Reviewed answer"), { target: { value: "true" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await waitFor(() => expect(state.record).toHaveBeenCalledTimes(1));
  const { fact } = state.record.mock.calls[0][0];
  expect(fact.fieldKey).toBe(fieldKey);
  expect(JSON.parse(fact.value)).toEqual({ payroll_us: true });
});

test("supports several reviewed features and rejects duplicate keys", async () => {
  capture(); fillCapture();
  fireEvent.change(screen.getByLabelText("Record type"), { target: { value: "addon" } });
  fireEvent.click(screen.getByRole("button", { name: "Add feature" }));
  const keys = screen.getAllByLabelText("Capability key"), answers = screen.getAllByLabelText("Reviewed answer");
  fireEvent.change(keys[0], { target: { value: "payroll_us" } });
  fireEvent.change(keys[1], { target: { value: "payroll_us" } });
  fireEvent.change(answers[0], { target: { value: "true" } });
  fireEvent.change(answers[1], { target: { value: "false" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await screen.findByRole("alert");
  expect(state.record).not.toHaveBeenCalled();
  fireEvent.change(keys[1], { target: { value: "time_tracking" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save evidence draft" }).closest("form")!);
  await waitFor(() => expect(state.record).toHaveBeenCalledTimes(1));
  expect(JSON.parse(state.record.mock.calls[0][0].fact.value)).toEqual({ payroll_us: true, time_tracking: false });
});
