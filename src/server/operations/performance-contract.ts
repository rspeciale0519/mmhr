import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const route = z.string().regex(/^(?:\/|\/[a-z0-9][a-z0-9/_-]*)$/);

export const criticalPerformanceRoutes = ["/", "/sign-in", "/customer", "/vendor", "/admin"] as const;
export const lcpP75BudgetMs = 2_500;
export const inpP75BudgetMs = 200;

export const performanceMeasurementSchema = z.strictObject({
  measurementId: uuid,
  route,
  measuredAt: timestamp,
  sampleCount: z.number().int().positive().max(100_000),
  lcpP75Ms: z.number().finite().nonnegative().max(60_000),
  inpP75Ms: z.number().finite().nonnegative().max(60_000),
});

export type PerformanceMeasurement = z.output<typeof performanceMeasurementSchema>;

export type PerformanceRouteResult = Readonly<PerformanceMeasurement & {
  meetsLcpBudget: boolean;
  meetsInpBudget: boolean;
}>;

export type PerformanceReport = Readonly<{
  asOf: string;
  routes: readonly PerformanceRouteResult[];
  meetsAllBudgets: boolean;
}>;

function parseAsOf(input: string | Date): string {
  const value = input instanceof Date ? input.toISOString() : input;
  if (!timestamp.safeParse(value).success) throw new Error("Invalid performance report as-of timestamp");
  return value;
}

/** Validates measured route evidence and reports explicit LCP and INP budgets. */
export function summarizePerformance(
  measurementsInput: readonly unknown[],
  asOfInput: string | Date,
  requiredRoutes: readonly string[] = criticalPerformanceRoutes,
): PerformanceReport {
  const asOf = parseAsOf(asOfInput);
  const parsedRoutes = requiredRoutes.map((value) => route.safeParse(value));
  if (parsedRoutes.some((result) => !result.success) || new Set(requiredRoutes).size !== requiredRoutes.length) throw new Error("Invalid required performance routes");
  const routes = requiredRoutes as readonly string[];
  const asOfMs = Date.parse(asOf);
  const seenMeasurements = new Set<string>();
  const seenRoutes = new Set<string>();
  const parsed: PerformanceMeasurement[] = [];
  for (const value of measurementsInput) {
    const result = performanceMeasurementSchema.safeParse(value);
    if (!result.success) throw new Error("Invalid performance measurement");
    const measurement = result.data;
    if (seenMeasurements.has(measurement.measurementId)) throw new Error(`Duplicate performance measurement: ${measurement.measurementId}`);
    seenMeasurements.add(measurement.measurementId);
    if (!routes.includes(measurement.route)) throw new Error(`Unexpected performance route: ${measurement.route}`);
    if (seenRoutes.has(measurement.route)) throw new Error(`Duplicate performance route: ${measurement.route}`);
    seenRoutes.add(measurement.route);
    if (Date.parse(measurement.measuredAt) > asOfMs) throw new Error(`Performance measurement is after report as-of timestamp: ${measurement.measurementId}`);
    parsed.push(measurement);
  }
  if (seenRoutes.size !== routes.length) throw new Error("Missing required performance route");
  const routeResults = routes.map((requiredRoute) => {
    const measurement = parsed.find((item) => item.route === requiredRoute)!;
    return Object.freeze({
      ...measurement,
      meetsLcpBudget: measurement.lcpP75Ms <= lcpP75BudgetMs,
      meetsInpBudget: measurement.inpP75Ms <= inpP75BudgetMs,
    });
  });
  return Object.freeze({
    asOf,
    routes: Object.freeze(routeResults),
    meetsAllBudgets: routeResults.every((item) => item.meetsLcpBudget && item.meetsInpBudget),
  });
}

export { route, timestamp, uuid };
