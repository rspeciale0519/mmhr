import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import ContactPage from "@/app/(marketing)/(site)/contact/page";

test("keeps the unwired contact form disabled and free of an action", () => {
  const { container } = render(<ContactPage />);
  const form = container.querySelector("form");
  const fieldset = container.querySelector("fieldset");

  expect(form).not.toHaveAttribute("action");
  expect(fieldset).toBeDisabled();
  expect(
    screen.getByText(/Online contact is not active yet/i),
  ).toBeInTheDocument();
});
