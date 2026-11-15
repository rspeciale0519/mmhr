import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getVendorRfps } from "@/server/commands/rfp-portal";
import { getRfpReceiptStatus } from "@/server/commands/rfp-receipt";

vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));
vi.mock("@/server/commands/rfp-portal", () => ({ getVendorRfps: vi.fn() }));
vi.mock("@/server/commands/rfp-receipt", () => ({ getRfpReceiptStatus: vi.fn() }));
vi.mock("@/components/workflow/rfp-receipt-status", () => ({ RfpReceiptStatus: () => null }));
import VendorHome from "./page";

beforeEach(() => {
  vi.mocked(requirePortalPageAccess).mockResolvedValue({ authorization: {
    scope: { kind: "organization", organizationId: "11111111-1111-4111-8111-111111111111" }, supabase: {},
  } } as never);
  vi.mocked(getVendorRfps).mockResolvedValue({ items: [], nextCursor: null } as never);
  vi.mocked(getRfpReceiptStatus).mockResolvedValue({ items: [], nextCursor: null } as never);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const menuLinks = async () => {
  render(await VendorHome({ searchParams: Promise.resolve({}) }));
  return within(screen.getByRole("navigation", { name: "Vendor workspace" })).getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);
};

test("hides demo, proposal, contract, and document links in Candidate A", async () => {
  vi.stubEnv("MMHR_LAUNCH_CANDIDATE", "A");
  expect(await menuLinks()).toEqual([["Home", "/home"], ["Change workspace", "/workspaces"]]);
});

test("shows the Candidate B areas and never the archived documents link", async () => {
  vi.stubEnv("MMHR_LAUNCH_CANDIDATE", "B");
  expect(await menuLinks()).toEqual([
    ["Home", "/home"], ["Change workspace", "/workspaces"], ["Demo coordination", "/vendor/demos"],
    ["Proposals and pricing", "/vendor/proposals"], ["Contract handoff", "/vendor/contracts"],
  ]);
});
