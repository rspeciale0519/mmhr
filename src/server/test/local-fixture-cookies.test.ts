import { expect, test } from "vitest";
import { createLocalFixtureCookies } from "./local-fixture-cookies";

test("makes newly written cookies visible before MFA replaces the session", () => {
  const cookies = createLocalFixtureCookies("unrelated=keep; sb-test-auth-token=old%3Dvalue");
  expect(cookies.getAll()).toEqual([{ name: "sb-test-auth-token", value: "old=value" }]);
  cookies.setAll([{ name: "sb-test-auth-token", value: "basic", options: {} }]);
  expect(cookies.getAll()[0].value).toBe("basic");
  cookies.setAll([
    { name: "sb-test-auth-token", value: "", options: { maxAge: 0 } },
    { name: "sb-test-auth-token.0", value: "verified-part-one", options: {} },
    { name: "sb-test-auth-token.1", value: "verified-part-two", options: {} },
  ]);
  expect(cookies.getAll().map(c => c.name)).toEqual(["sb-test-auth-token.0", "sb-test-auth-token.1"]);
  expect(cookies.responseCookies()).toContainEqual({ name: "sb-test-auth-token", value: "", options: { maxAge: 0 } });
});

test("clears obsolete chunks when a later session needs fewer cookies", () => {
  const cookies = createLocalFixtureCookies("sb-test-auth-token.0=one; sb-test-auth-token.1=two");
  cookies.setAll([
    { name: "sb-test-auth-token.0", value: "", options: { maxAge: 0 } },
    { name: "sb-test-auth-token.1", value: "", options: { maxAge: 0 } },
    { name: "sb-test-auth-token", value: "new-session", options: {} },
  ]);
  expect(cookies.getAll()).toEqual([{ name: "sb-test-auth-token", value: "new-session" }]);
  expect(cookies.responseCookies()).toHaveLength(3);
});

test("a deliberate local role login discards only the old loopback session before SDK initialization", () => {
  const cookies = createLocalFixtureCookies("sb-127-auth-token=old; sb-127-auth-token.0=obsolete; sb-127-auth-token.1=%broken; sb-other-auth-token=keep; sb-127-auth-token.extra=keep",
    { freshLocalSession: true });
  expect(cookies.getAll()).toEqual([{ name: "sb-other-auth-token", value: "keep" }, { name: "sb-127-auth-token.extra", value: "keep" }]);
  expect(cookies.responseCookies()).toEqual(["sb-127-auth-token", "sb-127-auth-token.0", "sb-127-auth-token.1"].map((name) =>
    ({ name, value: "", options: { maxAge: 0 } })));
});
test("fresh login still mirrors the new MFA cookies and expires only obsolete chunks", () => {
  const cookies = createLocalFixtureCookies("sb-127-auth-token.0=old; sb-127-auth-token.1=old; sb-127-auth-token.2=old", { freshLocalSession: true });
  cookies.setAll([{ name: "sb-127-auth-token", value: "basic", options: {} }]);
  cookies.setAll([{ name: "sb-127-auth-token", value: "", options: { maxAge: 0 } },
    { name: "sb-127-auth-token.0", value: "verified-one", options: {} }, { name: "sb-127-auth-token.1", value: "verified-two", options: {} }]);
  expect(cookies.getAll()).toEqual([{ name: "sb-127-auth-token.0", value: "verified-one" }, { name: "sb-127-auth-token.1", value: "verified-two" }]);
  expect(cookies.responseCookies()).toContainEqual({ name: "sb-127-auth-token.2", value: "", options: { maxAge: 0 } });
});
