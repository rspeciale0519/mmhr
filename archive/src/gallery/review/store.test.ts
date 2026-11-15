import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const driver = vi.hoisted(() => {
  const unsafe = vi.fn();
  const query = vi.fn();
  const connect = vi.fn(() => Object.assign(query, { unsafe, json: (value: unknown) => value }));
  return { unsafe, query, connect };
});
vi.mock("postgres", () => ({ default: driver.connect }));

async function loadStore() {
  vi.resetModules();
  return import("./store");
}

describe("gallery review store", () => {
  beforeEach(() => {
    vi.stubEnv("GALLERY_REVIEW_DATABASE_URL", "postgresql://review@db.example/gallery_review");
    driver.unsafe.mockReset().mockResolvedValue([]);
    driver.query.mockReset().mockResolvedValue([]);
    driver.connect.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("fails closed without its own database URL and never reads DATABASE_URL", async () => {
    vi.stubEnv("GALLERY_REVIEW_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://app@db.example/mmhr");
    const store = await loadStore();
    await expect(store.listFeedback("launch")).rejects.toBeInstanceOf(store.ReviewStorageMissingError);
    expect(driver.connect).not.toHaveBeenCalled();
  });

  test("creates the tables once, before the first query, with prepared statements off", async () => {
    const store = await loadStore();
    await store.listFeedback("launch");
    await store.listFeedback("stack");
    expect(driver.unsafe).toHaveBeenCalledTimes(1);
    expect(driver.unsafe.mock.calls[0]?.[0]).toContain("create table if not exists gallery_feedback");
    expect(driver.connect).toHaveBeenCalledWith("postgresql://review@db.example/gallery_review", expect.objectContaining({ prepare: false }));
    expect(driver.query).toHaveBeenCalledTimes(2);
  });

  test("treats a table that another process just created as ready", async () => {
    driver.unsafe.mockRejectedValueOnce(Object.assign(new Error("relation already exists"), { code: "42P07" }));
    const store = await loadStore();
    await expect(store.listFeedback("launch")).resolves.toEqual([]);
  });

  test("retries table creation after any other failure", async () => {
    driver.unsafe.mockRejectedValueOnce(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }));
    const store = await loadStore();
    await expect(store.listFeedback("launch")).rejects.toThrow("connection refused");
    await expect(store.listFeedback("launch")).resolves.toEqual([]);
    expect(driver.unsafe).toHaveBeenCalledTimes(2);
  });
});
