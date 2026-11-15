import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("../actions", () => ({ signIn: vi.fn() }));
vi.mock("../auth-form", () => ({ AuthForm: () => <form aria-label="Sign-in form" /> }));
vi.mock("../agentid-button", () => ({ AgentIdButton: () => null }));
import SignInPage from "./page";

afterEach(cleanup);
const page = (query: Record<string, string | string[] | undefined>) => SignInPage({ searchParams: Promise.resolve(query) });

test("shows the email confirmed message after a confirmation link", async () => {
  render(await page({ notice: "email-confirmed" }));
  expect(screen.getByRole("status")).toHaveTextContent("Email confirmed. Sign in to continue.");
  expect(screen.getByRole("form", { name: "Sign-in form" })).toBeInTheDocument();
});

test("explains an expired or used confirmation link", async () => {
  render(await page({ notice: "confirmation-link-invalid" }));
  expect(screen.getByRole("status")).toHaveTextContent("expired or was already used");
});

test.each([{}, { notice: "Free money" }, { notice: ["email-confirmed"] }])(
  "shows no notice for a missing or unknown value %#", async (query) => {
    render(await page(query));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Free money")).not.toBeInTheDocument();
  },
);
