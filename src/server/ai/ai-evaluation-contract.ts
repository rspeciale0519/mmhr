import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { aiCapabilities, aiDataClasses, type AiCapability, type AiDataClass } from "./ai-service";
import { aiAdapterProfileSchema, selectAiAdapter, type AiAdapterProfile } from "./ai-routing-contract";

const identifier = z.string().trim().min(1).max(200).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/,
  "Identifier contains unsupported characters",
);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const aiEvaluationFixtureSchema = z.strictObject({
  fixtureId: identifier,
  capability: z.enum(aiCapabilities),
  dataClass: z.enum(aiDataClasses),
  schemaVersion: identifier,
  inputArtifactId: identifier,
  inputHash: sha256,
  expectedOutputHash: sha256,
});

export type AiEvaluationFixture = z.output<typeof aiEvaluationFixtureSchema>;

export type AiEvaluationRow = Readonly<{
  fixtureId: string;
  adapterId: string;
  passed: boolean;
  failureCode: "provider_error" | "validation_failed" | "input_mismatch" | "output_mismatch" | null;
  outputHash: string | null;
}>;

export type AiEvaluationReport = Readonly<{
  adapterId: string;
  capability: AiCapability;
  dataClass: AiDataClass;
  schemaVersion: string;
  passed: boolean;
  rows: readonly AiEvaluationRow[];
}>;

export class AiEvaluationError extends Error {
  constructor(readonly code: "INVALID_PROFILE" | "INVALID_FIXTURE" | "DUPLICATE_FIXTURE" | "INCOMPLETE_INPUTS" | "POLICY_DENIED") {
    super(code === "POLICY_DENIED" ? "AI evaluation is not permitted" : "AI evaluation input is invalid");
    this.name = "AiEvaluationError";
  }
}

type EvaluationOptions<T> = Readonly<{
  profile: unknown;
  capability: AiCapability;
  dataClass: AiDataClass;
  schemaVersion: string;
  fixtures: readonly unknown[];
  inputs: Readonly<Record<string, unknown>>;
  schema: z.ZodType<T>;
  execute: (profile: AiAdapterProfile, input: unknown) => Promise<unknown>;
}>;

/** Evaluates one adapter against complete, hashed fixtures without persisting raw outputs. */
export async function evaluateAiAdapter<T>(options: EvaluationOptions<T>): Promise<AiEvaluationReport> {
  if (!Array.isArray(options.fixtures) || options.inputs === null || typeof options.inputs !== "object") {
    throw new AiEvaluationError("INCOMPLETE_INPUTS");
  }
  if (!identifier.safeParse(options.schemaVersion).success) throw new AiEvaluationError("INVALID_FIXTURE");
  const profileResult = aiAdapterProfileSchema.safeParse(options.profile);
  if (!profileResult.success) throw new AiEvaluationError("INVALID_PROFILE");
  let profile: AiAdapterProfile;
  try {
    profile = selectAiAdapter([profileResult.data], {
      capability: options.capability,
      dataClass: options.dataClass,
      maxCostCents: profileResult.data.maxCostCents,
    });
  } catch {
    throw new AiEvaluationError("POLICY_DENIED");
  }

  const fixtures = options.fixtures.map((value) => {
    const result = aiEvaluationFixtureSchema.safeParse(value);
    if (!result.success || result.data.capability !== options.capability || result.data.dataClass !== options.dataClass || result.data.schemaVersion !== options.schemaVersion) {
      throw new AiEvaluationError("INVALID_FIXTURE");
    }
    return result.data;
  });
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    if (seen.has(fixture.fixtureId)) throw new AiEvaluationError("DUPLICATE_FIXTURE");
    seen.add(fixture.fixtureId);
    if (!Object.prototype.hasOwnProperty.call(options.inputs, fixture.fixtureId)) {
      throw new AiEvaluationError("INCOMPLETE_INPUTS");
    }
  }

  const rows: AiEvaluationRow[] = [];
  for (const fixture of [...fixtures].sort((left, right) => left.fixtureId.localeCompare(right.fixtureId))) {
    const input = options.inputs[fixture.fixtureId];
    try {
      if (hashAiFixtureOutput(input) !== fixture.inputHash) {
        rows.push({ fixtureId: fixture.fixtureId, adapterId: profile.adapterId, passed: false, failureCode: "input_mismatch", outputHash: null });
        continue;
      }
    } catch {
      rows.push({ fixtureId: fixture.fixtureId, adapterId: profile.adapterId, passed: false, failureCode: "input_mismatch", outputHash: null });
      continue;
    }
    try {
      const raw = await options.execute(profile, input);
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) {
        rows.push({ fixtureId: fixture.fixtureId, adapterId: profile.adapterId, passed: false, failureCode: "validation_failed", outputHash: null });
        continue;
      }
      const outputHash = hashAiFixtureOutput(parsed.data);
      rows.push({
        fixtureId: fixture.fixtureId,
        adapterId: profile.adapterId,
        passed: outputHash === fixture.expectedOutputHash,
        failureCode: outputHash === fixture.expectedOutputHash ? null : "output_mismatch",
        outputHash,
      });
    } catch {
      rows.push({ fixtureId: fixture.fixtureId, adapterId: profile.adapterId, passed: false, failureCode: "provider_error", outputHash: null });
    }
  }

  const frozenRows = rows.map((row) => Object.freeze(row));
  return Object.freeze({
    adapterId: profile.adapterId,
    capability: options.capability,
    dataClass: options.dataClass,
    schemaVersion: options.schemaVersion,
    passed: frozenRows.length > 0 && frozenRows.every((row) => row.passed),
    rows: Object.freeze(frozenRows),
  });
}

/** Produces the stable hash stored in a fixture without retaining the output. */
export function hashAiFixtureOutput(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  }
  throw new Error("unsupported output");
}

export { identifier, sha256 };
