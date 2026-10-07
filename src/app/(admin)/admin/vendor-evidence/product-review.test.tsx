import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ProductReview } from "./product-review";
const state = vi.hoisted(() => ({ activate: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ vendorEvidence: { activateProduct: { mutationOptions: () => ({}) } } }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: state.activate }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("does not offer activation without the current revision", () => {
  render(<ProductReview organizationId="organization" products={[{ recordId: "product", label: "Payroll", status: "draft" }]}/>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("current product revision");
});

test("uses the observed revision and preserves the request when retrying", async () => {
  state.activate.mockRejectedValueOnce(new Error("Network failed")).mockResolvedValueOnce({});
  render(<ProductReview organizationId="organization" products={[{ recordId: "product", label: "Payroll", status: "draft", revision: 4 }]}/>);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Activate Payroll" }));
  await screen.findByRole("button", { name: "Retry same request" });
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(state.activate).toHaveBeenCalledTimes(2));
  expect(state.activate.mock.calls[0][0]).toEqual(state.activate.mock.calls[1][0]);
  expect(state.activate.mock.calls[0][0]).toMatchObject({ organizationId: "organization", productId: "product", expectedRevision: 4 });
});
