import { expect, test } from "vitest";
import { sanitizeMonitoringEvent, sanitizeMonitoringSpan, stripUrlParameters } from "./telemetry-privacy";

test("removes signup email and authentication parameters from absolute and relative URLs", () => {
  expect(stripUrlParameters("https://example.invalid/sign-up?email=synthetic%40example.invalid#token=test-only")).toBe("https://example.invalid/sign-up");
  expect(stripUrlParameters("/auth/callback?code=test-only")).toBe("/auth/callback");
  expect(stripUrlParameters("/customer/rfp")).toBe("/customer/rfp");
});
test("keeps diagnostic request metadata while removing private request data", () => {
  const source = { request: { url: "https://example.invalid/sign-up?email=synthetic%40example.invalid", method: "POST",
    query_string: "email=synthetic@example.invalid", data: { password: "test-only" }, cookies: { session: "test-only" },
    headers: { authorization: "test-only" }, env: { private: "test-only" } }, transaction: "/sign-up?email=test-only",
    breadcrumbs: [{ category: "navigation", data: { from: "/?email=test-only", to: "/sign-up?email=test-only", status_code: 200 } }] };
  const result = sanitizeMonitoringEvent(source);
  expect(result.request).toEqual({ url: "https://example.invalid/sign-up", method: "POST" });
  expect(result.transaction).toBe("/sign-up");
  expect(result.breadcrumbs![0]!.data).toEqual({ from: "/", to: "/sign-up", status_code: 200 });
  expect(source.request.data).toEqual({ password: "test-only" });
});
test("removes query and fragment fields from spans without removing timing or status evidence", () => {
  const span = { span_id: "1111111111111111", trace_id: "11111111111111111111111111111111",
    start_timestamp: 1, timestamp: 2, description: "GET /sign-up?email=test-only",
    data: { "url.full": "https://example.invalid/sign-up?email=test-only", "http.query": "email=test-only", "http.fragment": "test-only", "http.response.status_code": 200 } };
  const result = sanitizeMonitoringSpan(span);
  expect(result.description).toBe("GET /sign-up");
  expect(result.data).toEqual({ "url.full": "https://example.invalid/sign-up", "http.response.status_code": 200 });
  expect(result.timestamp).toBe(2);
  expect(sanitizeMonitoringEvent({ spans: [span] }).spans![0]).toEqual(result);
});
