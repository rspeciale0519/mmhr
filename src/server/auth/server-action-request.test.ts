import { describe, expect, test, vi } from "vitest";

import {
  hasTrustedMutationOrigin,
  shouldRejectServerActionRequest,
} from "@/server/auth/server-action-request";

describe("Server Action request checks", () => {
  test.each([
    null,
    "null",
    "not-a-url",
    "https://evil.example",
    "http://localhost:3000/path",
    "http://user@localhost:3000",
  ])("rejects the untrusted origin %s", (origin) => {
    expect(hasTrustedMutationOrigin(origin, "http://localhost:3000")).toBe(
      false,
    );
  });

  test("accepts only the exact configured origin", () => {
    expect(
      hasTrustedMutationOrigin(
        "http://localhost:3000",
        "http://localhost:3000/",
      ),
    ).toBe(true);
    expect(
      hasTrustedMutationOrigin(
        "http://127.0.0.1:3000",
        "http://localhost:3000",
      ),
    ).toBe(false);
  });

  test.each([
    ["GET", "http://localhost:3000"],
    ["PUT", "http://localhost:3000"],
    ["POST", null],
    ["POST", "https://evil.example"],
  ])("rejects an unsafe %s Server Action request from %s", (method, origin) => {
    const requestHeaders = new Headers({ "next-action": "action-id" });
    if (origin) requestHeaders.set("origin", origin);

    expect(
      shouldRejectServerActionRequest({ method, headers: requestHeaders }),
    ).toBe(true);
  });

  test("allows an exact-origin POST Server Action request", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(
      shouldRejectServerActionRequest({
        method: "POST",
        headers: new Headers({
          "next-action": "action-id",
          origin: "http://localhost:3000",
        }),
      }),
    ).toBe(false);

    vi.unstubAllEnvs();
  });

  test("does not apply the Server Action check to a normal request", () => {
    expect(
      shouldRejectServerActionRequest({
        method: "GET",
        headers: new Headers(),
      }),
    ).toBe(false);
  });
});
