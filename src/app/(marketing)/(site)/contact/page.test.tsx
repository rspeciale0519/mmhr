import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import ContactPage from "@/app/(marketing)/(site)/contact/page";

test("renders the public registration fields and explicit consent", () => {
  const { container } = render(<ContactPage />);
  const form = container.querySelector("form");

  expect(form).not.toHaveAttribute("action");
  expect(screen.getByLabelText("Full name")).toBeRequired();
  expect(screen.getByLabelText("Company")).toBeRequired();
  expect(screen.getByLabelText("Work email")).toBeRequired();
  expect(screen.getByLabelText("Direct company phone")).toBeRequired();
  expect(screen.getByLabelText(/I agree that MatchMaker HR/)).toBeRequired();
  expect(screen.getByText(/We use your details only to reply/i)).toBeInTheDocument();
});
