import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PortalResponsePage } from "@/server/commands/rfp-portal-response";
import { StaffResponses } from "./response-review";
const { mutations, options, refresh } = vi.hoisted(() => ({
  mutations: { review: vi.fn(), approve: vi.fn(), reject: vi.fn() },
  options: { review: vi.fn(), approve: vi.fn(), reject: vi.fn() }, refresh: vi.fn(),
}));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ responses: Object.fromEntries(
  Object.entries(options).map(([name, mutationOptions]) => [name, { mutationOptions }]),
) }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/workflow/clarification-controls", () => ({ ClarificationQuestion: () => null }));
const id="11111111-1111-4111-8111-111111111111";
const item: PortalResponsePage["items"][number] = {
  submissionId:id,recipientId:id,normalizationId:id,rfpId:id,version:1,revision:1,providerName:"Synthetic vendor",
  state:"pending",submittedAt:"2026-09-30T20:00:00Z",approvedAt:null,reviewedByIdentityId:null,
  canReview:true,canApprove:false,isLatest:true,late:false,
  response:{supportedRequirements:["Payroll export support"],unsupportedRequirements:[],caveats:[],dependencies:[],commitments:[],implementationDetails:[],missingAnswers:[],proposedFollowUps:[]},
};
function form(patch: Partial<typeof item> = {}) {
  return render(<QueryClientProvider client={new QueryClient()}><StaffResponses organizationId={id} items={[{ ...item, ...patch }]} /></QueryClientProvider>);
}
beforeEach(() => {
  refresh.mockReset();
  for (const action of ["review","approve","reject"] as const) {
    mutations[action].mockReset();
    options[action].mockReset().mockImplementation((config: object) => ({ mutationFn: mutations[action], ...config }));
  }
});
afterEach(cleanup);
test("requires a staff confirmation and records review before approval", async () => {
  mutations.review.mockResolvedValue({ state:"reviewed" }); form();
  expect(screen.getByRole("button", {name:"Record staff review"})).toBeDisabled();
  expect(screen.queryByRole("button", {name:"Approve for customer"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", {name:"Record staff review"}));
  await screen.findByText(/Review recorded. A different staff member/);
  expect(mutations.review.mock.calls[0]![0]).toMatchObject({action:"review",organizationId:id,normalizationId:id,rfpId:id,version:1});
  expect(mutations.approve).not.toHaveBeenCalled();
});
test("retries approval with the same payload and keeps confirmed status after refresh failure", async () => {
  mutations.approve.mockRejectedValueOnce(new Error("Transport unavailable")).mockResolvedValueOnce({state:"approved"});
  refresh.mockImplementation(() => { throw new Error("Refresh unavailable"); });
  form({state:"reviewed",canReview:false,canApprove:true});
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", {name:"Approve for customer"}));
  await screen.findByText(/We could not confirm this decision/);
  fireEvent.click(screen.getByRole("button", {name:"Retry unchanged decision"}));
  await screen.findByText(/Your decision was recorded/);
  expect(mutations.approve).toHaveBeenCalledTimes(2);
  expect(mutations.approve.mock.calls[1]![0]).toEqual(mutations.approve.mock.calls[0]![0]);
  expect(mutations.approve.mock.calls[0]![0].approvalReference).toMatch(/^approval:portal-response:/);
  expect(screen.queryByRole("button", {name:"Retry unchanged decision"})).not.toBeInTheDocument();
});
test("keeps unavailable and superseded decisions out of the form", () => {
  form({state:"reviewed",canReview:false,canApprove:false});
  expect(screen.getByText(/A different MMHR staff member/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
