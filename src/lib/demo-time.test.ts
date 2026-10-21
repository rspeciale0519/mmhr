import { expect, test } from "vitest";
import { demoLocalTimeToIso } from "./demo-time";

test.each([
  ["2026-10-02T09:30", "America/New_York", "2026-10-02T13:30:00.000Z"],
  ["2026-11-02T09:30", "America/New_York", "2026-11-02T14:30:00.000Z"],
  ["2026-10-02T09:30", "Asia/Kolkata", "2026-10-02T04:00:00.000Z"],
  ["2026-10-02T09:30", "UTC", "2026-10-02T09:30:00.000Z"],
  ["2026-10-02T09:30:44", "America/New_York", "2026-10-02T13:30:44.000Z"],
  ["2026-10-02T09:30:59", "Asia/Kolkata", "2026-10-02T04:00:59.000Z"],
  ["2026-10-02T09:30:01", "UTC", "2026-10-02T09:30:01.000Z"],
  ["2026-10-02T09:30:44.000", "UTC", "2026-10-02T09:30:44.000Z"],
])("converts %s in %s without using the computer time zone", (local, zone, expected) => {
  expect(demoLocalTimeToIso(local, zone)).toBe(expected);
});
test("rejects nonexistent spring and ambiguous autumn times", () => {
  expect(() => demoLocalTimeToIso("2026-03-08T02:30", "America/New_York")).toThrow("does not exist");
  expect(() => demoLocalTimeToIso("2026-11-01T01:30", "America/New_York")).toThrow("occurs twice");
  expect(() => demoLocalTimeToIso("2026-03-08T02:30:44", "America/New_York")).toThrow("does not exist");
  expect(() => demoLocalTimeToIso("2026-11-01T01:30:44", "America/New_York")).toThrow("occurs twice");
});
test.each(["2026-02-30T12:00", "2026-10-01T25:00", "2026-10-01", "infinity", "0000-01-01T00:00", "2026-10-01T12:00:60", "2026-10-01T12:00:1", "2026-10-01T12:00:01.001"])("rejects invalid local time %s", (local) => {
  expect(() => demoLocalTimeToIso(local, "UTC")).toThrow();
});
