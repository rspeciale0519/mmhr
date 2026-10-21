import { describe, expect, test } from "vitest";

import {
  CrmSearchError,
  parseCrmSearchInput,
  redactCrmSearchResults,
} from "./search-contract";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";

const result = (recordId: string, overrides: Record<string, unknown> = {}) => ({
  recordId,
  organizationId,
  resource: "deal",
  label: "Northwind evaluation",
  status: "evaluation",
  ...overrides,
});

describe("CRM search contract", () => {
  test("retains only a valid product revision for optimistic updates", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const product = result(id, { resource: "product", status: "draft", revision: 3, privateValue: "hidden" });
    expect(redactCrmSearchResults([product], organizationId, "product")[0]).toMatchObject({ revision: 3 });
    expect(redactCrmSearchResults([product], organizationId, "product")[0]).not.toHaveProperty("privateValue");
    expect(() => redactCrmSearchResults([{ ...product, revision: 0 }], organizationId, "product")).toThrow(CrmSearchError);
    expect(redactCrmSearchResults([result(id, { revision: 3 })], organizationId, "deal")[0]).not.toHaveProperty("revision");
  });
  test("normalizes scoped input and applies safe defaults", () => {
    expect(parseCrmSearchInput({
      organizationId: organizationId.toUpperCase(),
      resource: "deal",
    })).toEqual({
      organizationId,
      resource: "deal",
      statuses: [],
      limit: 25,
      cursor: null,
    });
  });

  test("accepts CRM statuses present in product, contact, and deal records", () => {
    expect(parseCrmSearchInput({
      organizationId,
      resource: "deal",
      statuses: ["retired", "inactive", "lead", "selection", "won", "lost"],
    }).statuses).toEqual(["retired", "inactive", "lead", "selection", "won", "lost"]);
  });

  test("rejects unknown fields and invalid paging", () => {
    expect(() => parseCrmSearchInput({
      organizationId,
      resource: "deal",
      secret: "do not return",
    })).toThrow("CRM search input is invalid");
    expect(() => parseCrmSearchInput({
      organizationId,
      resource: "deal",
      limit: 101,
    })).toThrow("CRM search input is invalid");
  });

  test("sorts deterministically, limits rows, and drops unapproved fields", () => {
    const rows = redactCrmSearchResults([
      result("00000000-0000-4000-8000-000000000002", { email: "private@example.com" }),
      result("00000000-0000-4000-8000-000000000001", { notes: "private" }),
    ], organizationId, "deal", 1);

    expect(rows).toEqual([{
      recordId: "00000000-0000-4000-8000-000000000001",
      organizationId,
      resource: "deal",
      label: "Northwind evaluation",
      status: "evaluation",
    }]);
    expect(rows[0]).not.toHaveProperty("email");
    expect(rows[0]).not.toHaveProperty("notes");
  });

  test("rejects cross-organization and wrong-resource rows", () => {
    expect(() => redactCrmSearchResults([
      result("00000000-0000-4000-8000-000000000001", { organizationId: otherOrganizationId }),
    ], organizationId, "deal")).toThrow(CrmSearchError);
    expect(() => redactCrmSearchResults([
      result("00000000-0000-4000-8000-000000000001", { resource: "contact" }),
    ], organizationId, "deal")).toThrow(CrmSearchError);
  });

  test("rejects malformed database rows", () => {
    expect(() => redactCrmSearchResults([
      { recordId: "not-an-id" },
    ], organizationId, "deal")).toThrow("CRM search result is invalid");
  });
});
