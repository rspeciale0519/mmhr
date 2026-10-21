import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluationRouteCommandSchema } from "./evaluation-route";
const base = { organizationId: randomUUID(), actorIdentityId: randomUUID(), routeId: randomUUID(), dealId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("evaluation route command", () => { test("accepts route creation", () => expect(evaluationRouteCommandSchema.parse({ ...base, action: "create" }).action).toBe("create")); test("requires a positive revision for final selection", () => expect(evaluationRouteCommandSchema.safeParse({ ...base, action: "finalize", expectedRevision: 0 }).success).toBe(false)); });
