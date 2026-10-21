import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ProfileReview } from "./profile-review";
const state = vi.hoisted(() => ({ approve: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ vendorEvidence: { approveProfile: { mutationOptions: () => ({}) } } }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: state.approve }) }));
const profile = { organizationId: "org", profileId: "profile", revision: 3, status: "active" as const, approvedAt: null };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
test.each(["paused", "archived"] as const)("does not activate a %s profile", status => {
  render(<ProfileReview profile={{...profile,status}}/>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
test("shows existing approval without another write control", () => {
  render(<ProfileReview profile={{...profile,approvedAt:"2026-09-16T01:00:00Z"}}/>);
  expect(screen.getByText(/Catalog approved on/)).toHaveTextContent("2026-09-16");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
test("preserves the reviewed revision and request on an uncertain retry", async () => {
  state.approve.mockRejectedValueOnce(new Error("Network failed")).mockResolvedValueOnce({});
  render(<ProfileReview profile={profile}/>);
  fireEvent.change(screen.getByLabelText("Catalog review reference"),{target:{value:"review:catalog"}});
  fireEvent.change(screen.getByLabelText("Catalog approval reason"),{target:{value:"Verified scope"}});
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button",{name:"Approve vendor for catalog"}));
  fireEvent.click(await screen.findByRole("button",{name:"Retry same request"}));
  await waitFor(() => expect(state.approve).toHaveBeenCalledTimes(2));
  expect(state.approve.mock.calls[0][0]).toEqual(state.approve.mock.calls[1][0]);
  expect(state.approve.mock.calls[0][0]).toMatchObject({profileId:"profile",expectedRevision:3,approvalReference:"review:catalog",reason:"Verified scope"});
});
