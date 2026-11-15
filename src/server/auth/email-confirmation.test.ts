import { expect, test } from "vitest";
import { emailConfirmationUrl, isEmailConfirmationNotice } from "./email-confirmation";

test("builds the confirmation URL from the configured origin only", () => {
  expect(emailConfirmationUrl("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100/auth/confirm");
  expect(emailConfirmationUrl("https://staging.example.test/")).toBe("https://staging.example.test/auth/confirm");
  expect(() => emailConfirmationUrl("")).toThrow();
});

test("accepts only the fixed notice keys", () => {
  expect(isEmailConfirmationNotice("email-confirmed")).toBe(true);
  expect(isEmailConfirmationNotice("confirmation-link-invalid")).toBe(true);
  for (const value of ["toString", "__proto__", "Email confirmed.", ["email-confirmed"], undefined]) {
    expect(isEmailConfirmationNotice(value)).toBe(false);
  }
});
