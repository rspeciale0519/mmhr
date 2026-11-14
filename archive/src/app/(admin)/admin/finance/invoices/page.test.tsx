import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Owner decision D2 hides this area at launch; src/lib/launch-surface tests cover that guard.
vi.mock("@/lib/launch-surface-guard", () => ({ requireLaunchArea: vi.fn() }));
import ManagedInvoicePage from "./page";
import ManagedInvoiceError from "./error";
import ManagedInvoiceLoading from "./loading";
import { AuthorizationError } from "@/server/auth/authorization";
import { invoiceActor, invoiceDetail, invoiceId, invoiceRequest } from "@/components/workflow/managed-invoice-ui-fixtures";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), authority: vi.fn(), rpc: vi.fn(), detail: vi.fn(), client: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: mocks.authorize }));
vi.mock("@/server/commands/finance-document-upload", () => ({ requireFinanceDocumentAuthority: mocks.authority }));
vi.mock("@/server/commands/managed-invoice", () => ({ getManagedInvoiceDetail: mocks.detail }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("forbidden"); }, notFound: () => { throw new Error("not found"); } }));
vi.mock("@/components/workflow/managed-invoice-client", () => ({ ManagedInvoiceClientWorkspace: (props: { workspaceLabel: string }) => {
  mocks.client(props); return <p>{props.workspaceLabel}</p>;
} }));
const organizationId = invoiceRequest.organizationId;
const membership = { organization_id: organizationId, organization_name: "Synthetic customer finance", organization_type: "customer",
  organization_status: "active", role_key: null };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ authorization: { scope: { kind: "organization", organizationId }, assurance: "aal2", supabase: { rpc: mocks.rpc } } });
  mocks.authority.mockResolvedValue({ identityId: invoiceActor, supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data: [membership], error: null });
  mocks.detail.mockImplementation(async input => ({ ...invoiceDetail(), correlationId: input.correlationId }));
});
afterEach(cleanup);
const page = (input: Record<string, string | string[] | undefined> = { commissionEventId: invoiceRequest.commissionEventId }) =>
  ManagedInvoicePage({ searchParams: Promise.resolve(input) });

test("uses selected customer scope and trusted finance actor for the exact stored event", async () => {
  render(await page());
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith("finance.manage");
  expect(mocks.authority).toHaveBeenCalledWith(organizationId, expect.any(String), { supabase: { rpc: mocks.rpc } });
  expect(mocks.detail).toHaveBeenCalledWith({ organizationId, commissionEventId: invoiceRequest.commissionEventId, correlationId: expect.any(String) },
    { supabase: { rpc: mocks.rpc } });
  expect(mocks.client).toHaveBeenCalledWith(expect.objectContaining({ actorIdentityId: invoiceActor, workspaceType: "customer" }));
  expect(screen.getByText("Synthetic customer finance")).toBeInTheDocument();
});
test.each(["aal1", null])("denies %s before private finance reads", async assurance => {
  mocks.authorize.mockResolvedValue({ authorization: { scope: { kind: "organization", organizationId }, assurance } });
  await expect(page()).rejects.toThrow("forbidden"); expect(mocks.authority).not.toHaveBeenCalled();
});
test("denies platform scope without an authorized selected customer", async () => {
  mocks.authorize.mockResolvedValue({ authorization: { scope: { kind: "platform" }, assurance: "aal2" } });
  await expect(page()).rejects.toThrow("forbidden"); expect(mocks.detail).not.toHaveBeenCalled();
});
test.each([{}, { commissionEventId: "invalid" }, { commissionEventId: [invoiceRequest.commissionEventId] },
  { commissionEventId: invoiceRequest.commissionEventId, organizationId: invoiceId(99) },
  { commissionEventId: invoiceRequest.commissionEventId, actorIdentityId: invoiceId(99) },
  { commissionEventId: invoiceRequest.commissionEventId, invoiceId: "invalid" }])("rejects malformed or injected route input %j", async input => {
  await expect(page(input)).rejects.toThrow("not found"); expect(mocks.authority).not.toHaveBeenCalled();
});
test.each([{ data: [] }, { data: [{ ...membership, organization_type: "internal" }] }, { data: [{ ...membership, organization_type: "vendor" }] },
  { data: [{ ...membership, organization_id: invoiceId(99) }] }])("denies absent, foreign, or non-customer membership %j", async ({ data }) => {
  mocks.rpc.mockResolvedValue({ data, error: null }); await expect(page()).rejects.toThrow("not found");
  expect(mocks.detail).not.toHaveBeenCalled();
});
test("fails closed on duplicate memberships", async () => {
  mocks.rpc.mockResolvedValue({ data: [membership, membership], error: null });
  await expect(page()).rejects.toThrow("Invoice workspace could not load"); expect(mocks.detail).not.toHaveBeenCalled();
});
test("uses the actual redacted label without showing an organization identifier", async () => {
  mocks.rpc.mockResolvedValue({ data: [{ ...membership, organization_name: null }], error: null }); render(await page());
  expect(screen.getByText("Organization name restricted")).toBeInTheDocument(); expect(screen.queryByText(organizationId)).not.toBeInTheDocument();
});
test("passes an exact issued invoice and proposal cursor without changing actor or scope", async () => {
  mocks.detail.mockImplementation(async input => ({ ...invoiceDetail("issued"), preparations: [], correlationId: input.correlationId }));
  await page({ commissionEventId: invoiceRequest.commissionEventId, invoiceId: invoiceId(5), afterPreparationId: invoiceId(40) });
  expect(mocks.detail).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: invoiceId(5), afterPreparationId: invoiceId(40), organizationId }), expect.any(Object));
});
test("stops after revoked authority before membership or invoice reads", async () => {
  mocks.authority.mockRejectedValue(new AuthorizationError()); await expect(page()).rejects.toThrow("not found");
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled();
});
test("denies revoked target reads without rendering a client", async () => {
  mocks.detail.mockRejectedValue(new AuthorizationError()); await expect(page()).rejects.toThrow("not found"); expect(mocks.client).not.toHaveBeenCalled();
});
test("rejects a valid-shaped output bound to a different actor before rendering", async () => {
  mocks.detail.mockImplementation(async input => ({ ...invoiceDetail(), correlationId: input.correlationId, currentActorIdentityId: invoiceId(99) }));
  await expect(page()).rejects.toThrow(); expect(mocks.client).not.toHaveBeenCalled();
});
test("uses generic boundaries and the installed Next retry callback", () => {
  const retry = vi.fn(); render(<><ManagedInvoiceLoading /><ManagedInvoiceError retry={retry} /></>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading the authorized invoice record.");
  expect(screen.getByRole("alert")).toHaveTextContent("The invoice record could not load.");
  fireEvent.click(screen.getByRole("button", { name: "Reload invoice record" })); expect(retry).toHaveBeenCalledOnce();
});
