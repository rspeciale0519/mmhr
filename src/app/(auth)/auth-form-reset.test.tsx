import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "./auth-form";

afterEach(cleanup);
test("preserves business fields and consent after an actual React action error, while clearing the password", async () => {
  const action = vi.fn(async (_state: unknown, data: FormData) => {
    expect(data.get("company")).toBe("Synthetic Company");
    return { error: "Use a company email address." };
  });
  const { container } = render(<AuthForm action={action} mode="sign-up" submitLabel="Sign up" initialEmail="person@example.invalid" />);
  for (const [label, value] of [["Full name", "Synthetic Tester"], ["Company", "Synthetic Company"],
    ["Direct company phone", "+1 555 010 0100"], ["Password", "Disposable-password-123"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByLabelText(/I agree that MatchMaker HR/));
  expect(screen.getByLabelText(/I agree that MatchMaker HR/)).toBeChecked();
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Use a company email address."));
  expect(action).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Full name")).toHaveValue("Synthetic Tester");
  expect(screen.getByLabelText("Company")).toHaveValue("Synthetic Company");
  expect(screen.getByLabelText("Work email")).toHaveValue("person@example.invalid");
  expect(screen.getByLabelText("Direct company phone")).toHaveValue("+1 555 010 0100");
  expect(screen.getByLabelText(/I agree that MatchMaker HR/)).toBeChecked();
  expect(screen.getByLabelText("Password")).toHaveValue("");
});
