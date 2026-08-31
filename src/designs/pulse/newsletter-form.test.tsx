import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import NewsletterForm from "./newsletter-form";

const email = "alex@example.com";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";

function fillForm({ consent = true } = {}) {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  if (consent) fireEvent.click(screen.getByLabelText(/I agree to receive The Weekly Signal/));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("crypto", { randomUUID: () => idempotencyKey });
});

afterEach(() => {
  cleanup();
});

describe("Pulse newsletter form", () => {
  test("submits the consent-aware newsletter DTO and shows a safe success state", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    render(<NewsletterForm />);
    fillForm();

    fireEvent.submit(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/you are subscribed/i));
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({ email, idempotencyKey });
    expect(body.consentAt).toEqual(expect.any(String));
    expect(screen.getByRole("status")).not.toHaveTextContent(email);
  });

  test("requires explicit consent before sending", () => {
    render(<NewsletterForm />);
    fillForm({ consent: false });

    fireEvent.submit(screen.getByRole("button", { name: "Subscribe" }));

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/consent/i);
  });

  test.each([
    [400, /check your email/i],
    [403, /reload the page/i],
    [503, /try again later/i],
  ])("maps a public error response to a safe message", async (status, message) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "private detail" }), { status }));
    render(<NewsletterForm />);
    fillForm();

    fireEvent.submit(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(message));
    expect(screen.getByRole("status")).not.toHaveTextContent(/private detail|alex@example.com/);
  });

  test("maps a network failure to a safe unavailable message", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("private network detail"));
    render(<NewsletterForm />);
    fillForm();

    fireEvent.submit(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/try again later/i));
    expect(screen.getByRole("status")).not.toHaveTextContent(/private network detail/);
  });
});
