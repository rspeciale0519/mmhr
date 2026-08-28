import { useActionState } from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthForm } from "@/app/(auth)/auth-form";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: vi.fn() };
});

const action = vi.fn(async () => null);

describe("AuthForm", () => {
  beforeEach(() => {
    vi.mocked(useActionState).mockReturnValue([null, vi.fn(), false] as never);
  });

  afterEach(() => {
    cleanup();
  });

  test("uses the 12-character rule for sign-up", () => {
    render(<AuthForm action={action} mode="sign-up" submitLabel="Sign up" />);

    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "12");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  test("keeps the existing sign-in password rule", () => {
    render(<AuthForm action={action} mode="sign-in" submitLabel="Sign in" />);

    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  test("shows confirmation guidance as a status", () => {
    vi.mocked(useActionState).mockReturnValue([
      { success: "Check your email to confirm your account. Then sign in." },
      vi.fn(),
      false,
    ] as never);

    render(<AuthForm action={action} mode="sign-up" submitLabel="Sign up" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Check your email to confirm your account. Then sign in.",
    );
  });
});
