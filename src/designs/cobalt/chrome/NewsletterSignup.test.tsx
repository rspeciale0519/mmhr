import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NewsletterSignup } from "./NewsletterSignup";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill({ email = "alex@example.com", consent = true } = {}) {
  render(<NewsletterSignup />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  if (consent) fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
}

const status = () => screen.getByRole("status");

describe("newsletter signup", () => {
  test("has a visible email label, a consent box, and honest copy", () => {
    const { container } = render(<NewsletterSignup />);
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    const text = container.textContent ?? "";
    expect(text).toContain("HR software news and buyer guides");
    expect(text).toContain("I can unsubscribe at any time.");
    // Only promise what exists: no download, kit, or report.
    expect(text).not.toMatch(/download|kit\b|report/i);
  });

  test("posts the exact contract fields and shows success", async () => {
    fetchMock.mockResolvedValue(Response.json({ accepted: true }));
    fill({ email: "  Alex@Example.com " });

    await waitFor(() => expect(status()).toHaveTextContent("You are on the list"));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/newsletter");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(Object.keys(body).sort()).toEqual(["consentAt", "email", "idempotencyKey"]);
    expect(body.email).toBe("Alex@Example.com");
    expect(new Date(body.consentAt!).toISOString()).toBe(body.consentAt);
    expect(body.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // The form clears after success.
    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });

  test("asks for a valid email before sending anything", () => {
    fill({ email: "not-an-email" });
    expect(status()).toHaveTextContent("Check the email address");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("requires consent before sending anything", () => {
    fill({ consent: false });
    expect(status()).toHaveTextContent("Tick the box");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    [400, "Check the email address"],
    [403, "Reload the page and try again"],
    [409, "Please try again"],
    [503, "could not subscribe you right now"],
  ])("explains a %s answer inline", async (code, text) => {
    fetchMock.mockResolvedValue(Response.json({ error: "x" }, { status: code }));
    fill();
    await waitFor(() => expect(status()).toHaveTextContent(text));
    expect(status()).toHaveClass("co-news-error");
  });

  test("explains a network failure inline", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    fill();
    await waitFor(() => expect(status()).toHaveTextContent("could not subscribe you right now"));
  });

  test("disables the button while sending", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    fill();
    expect(screen.getByRole("button", { name: "Subscribing…" })).toBeDisabled();
    resolve(Response.json({ accepted: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled());
  });
});
