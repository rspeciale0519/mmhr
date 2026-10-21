import { describe, expect, test } from "vitest";

import { applicationTables } from "./application-schema-inventory";

describe("application schema inventory", () => {
  test("keeps the public table inventory unique and database-sortable", () => {
    expect(new Set(applicationTables).size).toBe(applicationTables.length);
    expect([...applicationTables].sort()).toEqual([...applicationTables]);
  });
});
