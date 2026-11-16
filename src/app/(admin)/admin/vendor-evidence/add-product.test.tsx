import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AddProduct } from "./add-product";

const state = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ vendorEvidence: { createProduct: { mutationOptions: () => ({}) } } }) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: state.create }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function fill(values: { name?: string; key?: string; description?: string }) {
  fireEvent.change(screen.getByLabelText("Product name"), { target: { value: values.name ?? "" } });
  fireEvent.change(screen.getByLabelText(/^Product key/), { target: { value: values.key ?? "" } });
  if (values.description !== undefined) {
    fireEvent.change(screen.getByLabelText("Description (optional)"), { target: { value: values.description } });
  }
}

test("adds a draft product for the selected vendor with normalized fields", async () => {
  state.create.mockResolvedValue({ recordId: "product" });
  render(<AddProduct organizationId="organization" vendorProfileId="profile"/>);
  fill({ name: "  Payroll core ", key: "payroll_core" });
  fireEvent.click(screen.getByRole("button", { name: "Add product" }));
  await screen.findByText("Product added as a draft. Activate it in Catalog products.");
  expect(state.create).toHaveBeenCalledExactlyOnceWith({
    organizationId: "organization", vendorProfileId: "profile", stableKey: "payroll_core", name: "Payroll core",
    description: null, idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(state.refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Add another product" }));
  expect(screen.getByLabelText("Product name")).toHaveValue("");
});

test("explains a bad product key without sending a request", async () => {
  render(<AddProduct organizationId="organization" vendorProfileId="profile"/>);
  fill({ name: "Payroll", key: "9-payroll" });
  fireEvent.submit(screen.getByRole("button", { name: "Add product" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Use a product key that starts with a letter");
  expect(state.create).not.toHaveBeenCalled();
});

test("keeps the same request when the result is uncertain", async () => {
  state.create.mockRejectedValueOnce(new Error("Network failed")).mockResolvedValueOnce({ recordId: "product" });
  render(<AddProduct organizationId="organization" vendorProfileId="profile"/>);
  fill({ name: "Payroll", key: "payroll", description: "Core payroll" });
  fireEvent.click(screen.getByRole("button", { name: "Add product" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
  expect(state.create.mock.calls[0][0]).toEqual(state.create.mock.calls[1][0]);
  expect(state.create.mock.calls[0][0]).toMatchObject({ description: "Core payroll" });
});
