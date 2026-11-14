import { beforeEach, describe, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({
  saveFeedback: vi.fn(),
  listFeedback: vi.fn(),
  removePick: vi.fn(),
}));
vi.mock("@/gallery/review/store", async () => {
  const actual = await vi.importActual<typeof import("@/gallery/review/store")>("@/gallery/review/store");
  return { ...actual, ...store };
});

import { ReviewStorageMissingError } from "@/gallery/review/store";
import { DELETE, GET, POST } from "./route";

const url = "https://preview.example/api/gallery/feedback";
const comment = { kind: "comment", design: "launch", reviewer: "Rob", part: "hero", body: "Bigger headline", x: 0.5, y: 0.2 };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { origin: "https://preview.example", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/gallery/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.saveFeedback.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-10-14T20:00:00.000Z" });
  });

  test("saves a comment and returns its id", async () => {
    const response = await POST(post(comment));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-10-14T20:00:00.000Z" });
    expect(store.saveFeedback).toHaveBeenCalledWith(comment);
  });

  test.each([
    ["no origin", { origin: "" }],
    ["another origin", { origin: "https://evil.example" }],
    ["a form content type", { "content-type": "text/plain" }],
    ["an opaque origin", { origin: "null" }],
    ["an origin with a path", { origin: "https://preview.example/gallery" }],
    ["an origin that differs from the Host header", { host: "other.example" }],
  ])("rejects a request with %s", async (_label, headers: Record<string, string>) => {
    const request = post(comment, headers);
    if (headers.origin === "") request.headers.delete("origin");
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(store.saveFeedback).not.toHaveBeenCalled();
  });

  test("accepts an origin that matches the forwarded host", async () => {
    const response = await POST(post(comment, { origin: "https://mmhr-abc.vercel.app", "x-forwarded-host": "mmhr-abc.vercel.app" }));
    expect(response.status).toBe(201);
  });

  test("rejects invalid input with a plain message", async () => {
    const response = await POST(post({ ...comment, design: "pulse" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/missing or too long/);
  });

  test("rejects a body that is not JSON or is too large", async () => {
    expect((await POST(post("{not json"))).status).toBe(400);
    expect((await POST(post({ ...comment, body: "a".repeat(13_000) }))).status).toBe(413);
  });

  test("reports missing storage as unavailable", async () => {
    store.saveFeedback.mockRejectedValue(new ReviewStorageMissingError());
    const response = await POST(post(comment));
    expect(response.status).toBe(503);
  });

  test("hides unexpected storage errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    store.saveFeedback.mockRejectedValue(new Error("connection refused at 10.0.0.1"));
    const response = await POST(post(comment));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.1");
    error.mockRestore();
  });
});

describe("GET /api/gallery/feedback", () => {
  test("lists comments for a known design only", async () => {
    store.listFeedback.mockResolvedValue([]);
    const ok = await GET(new Request(`${url}?design=launch`));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ items: [] });
    expect(store.listFeedback).toHaveBeenCalledWith("launch");

    const unknown = await GET(new Request(`${url}?design=../admin`));
    expect(unknown.status).toBe(400);
  });
});

describe("DELETE /api/gallery/feedback", () => {
  const remove = (id: string, origin = "https://preview.example") =>
    DELETE(new Request(`${url}?id=${id}`, { method: "DELETE", headers: { origin } }));

  test("removes one pick by id", async () => {
    const response = await remove("11111111-1111-4111-8111-111111111111");
    expect(response.status).toBe(204);
    expect(store.removePick).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  test("rejects a bad id or another origin", async () => {
    store.removePick.mockClear();
    expect((await remove("1 or 1=1")).status).toBe(400);
    expect((await remove("11111111-1111-4111-8111-111111111111", "https://evil.example")).status).toBe(403);
    expect(store.removePick).not.toHaveBeenCalled();
  });
});
