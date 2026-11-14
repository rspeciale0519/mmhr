import { beforeEach, describe, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ saveRecipe: vi.fn() }));
vi.mock("@/gallery/review/store", async () => {
  const actual = await vi.importActual<typeof import("@/gallery/review/store")>("@/gallery/review/store");
  return { ...actual, ...store };
});

import { POST } from "./route";

const post = (body: unknown, origin = "https://preview.example") =>
  POST(new Request("https://preview.example/api/gallery/recipes", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

describe("POST /api/gallery/recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.saveRecipe.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", createdAt: "2026-10-14T20:00:00.000Z" });
  });

  test("saves a recipe", async () => {
    const response = await post({ reviewer: "Rob", baseDesign: "launch", selections: [{ part: "hero", design: "stack" }], notes: "Ship it" });
    expect(response.status).toBe(201);
    expect(store.saveRecipe).toHaveBeenCalledWith({
      reviewer: "Rob", baseDesign: "launch", selections: [{ part: "hero", design: "stack", note: null }], notes: "Ship it",
    });
  });

  test("explains an empty recipe", async () => {
    const response = await post({ reviewer: "Rob", selections: [] });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Choose a starting design or at least one piece first.");
    expect(store.saveRecipe).not.toHaveBeenCalled();
  });

  test("rejects another origin", async () => {
    const response = await post({ reviewer: "Rob", baseDesign: "launch", selections: [] }, "https://evil.example");
    expect(response.status).toBe(403);
  });
});
