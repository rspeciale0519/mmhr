import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import ContactForm from "./contact-form";

const validValues = {
  "Full name": "Alex Example",
  Company: "Example Co",
  "Work email": "alex@example.com",
  "Direct company phone": "+1 (212) 555-0100",
};

function fillForm() {
  for (const [label, value] of Object.entries(validValues)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByLabelText(/I agree that MatchMaker HR/));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("crypto", { randomUUID: () => "55555555-5555-4555-8555-555555555555" });
});

afterEach(() => {
  cleanup();
});

test("submits the fixed lead DTO and shows a redacted success state", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
  render(<ContactForm />);
  fillForm();

  fireEvent.submit(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/request was received/i));
  expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  const request = vi.mocked(fetch).mock.calls[0]?.[1];
  const body = JSON.parse(String(request?.body));
  expect(body).toMatchObject({
    fullName: validValues["Full name"],
    company: validValues.Company,
    workEmail: validValues["Work email"],
    directCompanyPhone: validValues["Direct company phone"],
    source: "contact",
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
  });
  expect(body.consentAt).toEqual(expect.any(String));
  expect(screen.getByRole("status")).not.toHaveTextContent(/Alex|Example|212/);
});

test("requires explicit consent before sending", () => {
  render(<ContactForm />);
  for (const [label, value] of Object.entries(validValues)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }

  fireEvent.submit(screen.getByRole("button", { name: "Send" }));

  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent(/consent/i);
});

test.each([
  [400, /check the form/i],
  [403, /reload the page/i],
  [429, /try again later/i],
  [503, /try again later/i],
])("maps a public error response to a safe message", async (status, message) => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "private detail" }), { status }));
  render(<ContactForm />);
  fillForm();

  fireEvent.submit(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(message));
  expect(screen.getByRole("status")).not.toHaveTextContent(/private detail|Alex|Example/);
});

test("maps a network failure to a safe unavailable message", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("private network detail"));
  render(<ContactForm />);
  fillForm();

  fireEvent.submit(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/try again later/i));
  expect(screen.getByRole("status")).not.toHaveTextContent(/private network detail/);
});
