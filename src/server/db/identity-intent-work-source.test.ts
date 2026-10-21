import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { IdentityIntentSqlExecutor } from "./identity-intent-repository";
import { createIdentityIntentWorkSource, IdentityIntentWorkSourceError } from "./identity-intent-work-source";

const first = "abcdefab-1111-4111-8111-111111111111";
const second = "abcdefab-2222-4222-8222-222222222222";
const execute = vi.fn<IdentityIntentSqlExecutor["execute"]>();
const source = createIdentityIntentWorkSource({ execute });
const dialect = new PgDialect();

describe("fixed identity-intent work discovery", () => {
  beforeEach(() => execute.mockReset().mockResolvedValue([]));

  test("exposes only a zero-input candidate read", async () => {
    expect(Object.keys(source)).toEqual(["listCandidateIds"]);
    expect(source.listCandidateIds.length).toBe(0);
    await expect(Reflect.apply(source.listCandidateIds, source, [{ actor: first, query: "SELECT private_data" }]))
      .resolves.toEqual([]);
    expect(execute).toHaveBeenCalledOnce();
    expect(dialect.sqlToQuery(execute.mock.calls[0][0])).toMatchObject({
      sql: "SELECT intent_id FROM mmhr_private.mmhr_list_identity_intent_candidates()", params: [],
    });
  });

  test("returns an explicit empty database result without claiming work", async () => {
    await expect(source.listCandidateIds()).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledOnce();
  });

  test("normalizes UUIDs while preserving the database order", async () => {
    execute.mockResolvedValue([{ intent_id: second.toUpperCase() }, { intent_id: first }]);
    await expect(source.listCandidateIds()).resolves.toEqual([second, first]);
  });

  test("accepts five unique IDs and discards driver array metadata", async () => {
    const ids = Array.from({ length: 5 }, (_, index) => `${first.slice(0, -1)}${index}`);
    execute.mockResolvedValue(Object.assign(ids.map((intent_id) => ({ intent_id })), { count: 5, command: "SELECT" }));
    await expect(source.listCandidateIds()).resolves.toEqual(ids);
  });

  test("copies returned IDs and does not cache discovery", async () => {
    const rows = [{ intent_id: first }];
    execute.mockResolvedValueOnce(rows).mockResolvedValueOnce([{ intent_id: second }]);
    const ids = await source.listCandidateIds();
    rows[0].intent_id = second;
    expect(ids).toEqual([first]);
    await expect(source.listCandidateIds()).resolves.toEqual([second]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test.each([
    null, undefined, {}, { rows: [] }, [null], [undefined], [{}], [{ intent_id: null }],
    [{ intent_id: "" }], [{ intent_id: "private@example.test" }], [{ intent_id: ` ${first}` }],
    [{ intent_id: [first] }], [{ intent_id: 1 }], [{ intent_id: "00000000-0000-0000-0000-000000000000" }],
    [{ intent_id: first, subject_id: second }], [{ id: first }],
    [{ intent_id: first }, { intent_id: first }], [{ intent_id: first }, { intent_id: first.toUpperCase() }],
    Array.from({ length: 6 }, (_, index) => ({ intent_id: `${first.slice(0, -1)}${index}` })),
    Array(1), [{ intent_id: first }, { intent_id: "invalid" }],
  ].map((rows) => ({ rows })))("rejects the complete malformed response: $rows", async ({ rows }) => {
    execute.mockResolvedValue(rows);
    await expect(source.listCandidateIds()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(execute).toHaveBeenCalledOnce();
  });

  test("redacts an exceptional driver property without retrying", async () => {
    execute.mockResolvedValue([Object.defineProperty({}, "intent_id", {
      get() { throw new Error("private driver payload"); }, enumerable: true,
    })]);
    await expect(source.listCandidateIds()).rejects.toEqual(new IdentityIntentWorkSourceError("INVALID_RESPONSE"));
    expect(execute).toHaveBeenCalledOnce();
  });

  test("redacts an Error from SQL without retrying", async () => {
    let calls = 0;
    const failingSource = createIdentityIntentWorkSource({
      execute: async () => { calls += 1; throw new Error("private connection details"); },
    });
    const result = await failingSource.listCandidateIds().catch((error: unknown) => error);
    expect(result).toMatchObject({ code: "UNAVAILABLE" });
    expect(calls).toBe(1);
  });

  test.each(["private SQL", null, { code: "42501", detail: "private grants" }])(
    "redacts a non-Error SQL failure without retries or an empty-success fallback: %j", async (failure) => {
      let calls = 0;
      const failingSource = createIdentityIntentWorkSource({
        execute: async () => { calls += 1; throw failure; },
      });
      const result = await failingSource.listCandidateIds().catch((error: unknown) => error);
      expect(result).toMatchObject({ code: "UNAVAILABLE" });
      expect(calls).toBe(1);
    },
  );
});
