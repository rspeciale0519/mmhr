import { describe, expect, test } from "vitest";

import { RFP_LIBRARY, RFP_TAB_KEYS, rfpQuestionKeys, selectRfpTabs } from "./rfp-form-library";
import {
  addBusinessDays, clientOverviewSchema, isRfpFormOverdue, RFP_DOCUMENT_KEYS, rfpAnswerSchema, tabKeysSchema,
} from "./rfp-vendor-form";

describe("RFP question library", () => {
  test("has 12 tabs and 262 questions, each with a unique key", () => {
    const keys = rfpQuestionKeys(RFP_TAB_KEYS);
    expect(RFP_LIBRARY).toHaveLength(12);
    expect(keys).toHaveLength(262);
    // Answers are saved by question key, so a repeated key would mix answers.
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(RFP_TAB_KEYS).size).toBe(RFP_TAB_KEYS.length);
  });

  test("returns only the chosen tabs, in library order, and skips unknown keys", () => {
    expect(selectRfpTabs(["payroll", "core", "not_a_tab"]).map((tab) => tab.key)).toEqual(["core", "payroll"]);
    expect(rfpQuestionKeys(["payroll"]).every((key) => key.startsWith("payroll_"))).toBe(true);
  });
});

describe("RFP form rules", () => {
  test("adds business days and skips weekends", () => {
    // Wednesday 18 November 2026 plus 10 business days is Wednesday 2 December.
    const due = addBusinessDays(new Date(2026, 10, 18, 9), 10);
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 11, 2]);
    // Friday plus 1 business day is Monday.
    expect(addBusinessDays(new Date(2026, 10, 20, 9), 1).getDate()).toBe(23);
  });

  test("flags only a sent form that is past its due date", () => {
    const now = new Date("2026-12-03T12:00:00Z");
    expect(isRfpFormOverdue("sent", "2026-12-02T23:59:59Z", now)).toBe(true);
    expect(isRfpFormOverdue("sent", "2026-12-04T23:59:59Z", now)).toBe(false);
    expect(isRfpFormOverdue("submitted", "2026-12-02T23:59:59Z", now)).toBe(false);
  });

  test("needs a company name and refuses unknown overview fields", () => {
    const overview = { companyName: "Acme", address: "", cityStateZip: "", businessType: "", locations: "", employeeCount: "",
      employeeClasses: "", currentPayrollHrVendor: "", otherCurrentVendors: "", payFrequencies: "", timeline: "" };
    expect(clientOverviewSchema.safeParse(overview).success).toBe(true);
    expect(clientOverviewSchema.safeParse({ ...overview, companyName: " " }).success).toBe(false);
    expect(clientOverviewSchema.safeParse({ ...overview, contactPerson: "Sam" }).success).toBe(false);
  });

  test("accepts only known tabs and answer choices", () => {
    expect(tabKeysSchema.safeParse(["core", "payroll"]).success).toBe(true);
    expect(tabKeysSchema.safeParse([]).success).toBe(false);
    expect(tabKeysSchema.safeParse(["core", "made_up"]).success).toBe(false);
    expect(rfpAnswerSchema.safeParse({ answer: "yes", comment: null }).success).toBe(true);
    expect(rfpAnswerSchema.safeParse({ answer: "maybe", comment: null }).success).toBe(false);
    expect(rfpAnswerSchema.safeParse({ answer: null, comment: "x".repeat(2001) }).success).toBe(false);
    expect(RFP_DOCUMENT_KEYS).toContain("other");
  });
});
