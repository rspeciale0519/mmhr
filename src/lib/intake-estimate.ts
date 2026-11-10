export const estimateEmployeeCountKey = "estimateEmployeeCountV1";
export const estimateEmployeeCountLabel = "Number of employees for estimates";

export function isEstimateEmployeeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10_000_000;
}
