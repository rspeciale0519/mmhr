import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { headers } from "next/headers";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { getWorkspaceDocuments } from "@/server/commands/workspace-documents";
import { searchWorkspaceDocumentsAction } from "./actions";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: vi.fn() }));
vi.mock("@/server/commands/workspace-documents", () => ({ getWorkspaceDocuments: vi.fn() }));
const organizationId = randomUUID(), page = { organizationId, correlationId: randomUUID(), canUpload: false, items: [], nextCursor: null };
function form(query = "Synthetic") {
  const input = new FormData(); input.set("organizationId", organizationId); input.set("query", query); return input;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.mocked(headers).mockReset().mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
  vi.mocked(readSelectedOrganizationId).mockReset().mockResolvedValue(organizationId);
  vi.mocked(getWorkspaceDocuments).mockReset().mockResolvedValue(page);
});
afterEach(() => vi.unstubAllEnvs());
test("searches the selected workspace through the scoped command without trusting prior state", async () => {
  const prior = { status: "success" as const, query: "untrusted", page: { ...page, organizationId: randomUUID() } };
  await expect(searchWorkspaceDocumentsAction(prior, form())).resolves.toEqual({ status: "success", query: "Synthetic", page });
  expect(getWorkspaceDocuments).toHaveBeenCalledWith({ organizationId, correlationId: expect.any(String), searchQuery: "Synthetic", afterId: undefined });
});
test("supports an exact continuation and an empty query for all current files", async () => {
  const input = form(""); const afterId = randomUUID(); input.set("afterId", afterId);
  await expect(searchWorkspaceDocumentsAction({ status: "idle" }, input)).resolves.toMatchObject({ status: "success", query: "" });
  expect(getWorkspaceDocuments).toHaveBeenCalledWith({ organizationId, correlationId: expect.any(String), searchQuery: undefined, afterId });
});
test.each([null, "http://foreign.example", "http://localhost:3000.evil.example"])("rejects an untrusted origin before reading cookies or private data", async (origin) => {
  vi.mocked(headers).mockResolvedValue(new Headers(origin ? { origin } : {}) as never);
  await expect(searchWorkspaceDocumentsAction({ status: "idle" }, form())).resolves.toEqual({ status: "error" });
  expect(readSelectedOrganizationId).not.toHaveBeenCalled(); expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test.each([null, randomUUID()])("rejects a missing or changed selected workspace", async (selected) => {
  vi.mocked(readSelectedOrganizationId).mockResolvedValue(selected);
  await expect(searchWorkspaceDocumentsAction({ status: "idle" }, form())).resolves.toEqual({ status: "error" });
  expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test.each(["actorIdentityId", "storageReference", "page", "canUpload"])("rejects forged authority field %s", async (field) => {
  const input = form(); input.set(field, "forged");
  await expect(searchWorkspaceDocumentsAction({ status: "idle" }, input)).resolves.toEqual({ status: "error" });
  expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test("rejects repeated fields, files, excessive terms, and invalid cursors", async () => {
  const inputs = [form(), form(), form("x".repeat(121)), form(), form("a\nb")];
  inputs[0].append("query", "duplicate"); inputs[1].set("query", new File(["text"], "synthetic.pdf")); inputs[3].set("afterId", "invalid");
  for (const input of inputs) await expect(searchWorkspaceDocumentsAction({ status: "idle" }, input)).resolves.toEqual({ status: "error" });
  expect(getWorkspaceDocuments).not.toHaveBeenCalled();
});
test("ignores framework action markers without accepting additional application fields", async () => {
  const input = form(); input.set("$ACTION_ID_synthetic", "");
  await expect(searchWorkspaceDocumentsAction({ status: "idle" }, input)).resolves.toMatchObject({ status: "success" });
});
test("returns a visible safe failure without prior rows or provider details", async () => {
  vi.mocked(getWorkspaceDocuments).mockRejectedValue(new Error("private object, token, or customer detail"));
  await expect(searchWorkspaceDocumentsAction({ status: "success", query: "old", page }, form())).resolves.toEqual({ status: "error" });
  expect(getWorkspaceDocuments).toHaveBeenCalledTimes(1);
});
