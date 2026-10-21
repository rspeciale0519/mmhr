import "server-only";

import { z } from "zod";

import { aiCapabilities, aiDataClasses, type AiCapability, type AiDataClass } from "./ai-service";

const identifier = z.string().trim().min(1).max(200).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/,
  "Identifier contains unsupported characters",
);

const boundedUniqueEnumArray = <T extends readonly [string, ...string[]]>(values: T) => z
  .array(z.enum(values))
  .min(1)
  .max(values.length)
  .refine((items) => new Set(items).size === items.length, "Values must be unique");

/** Server-side adapter capabilities and data classes. Business requests never select an adapter. */
export const aiAdapterProfileSchema = z.strictObject({
  adapterId: identifier,
  modelId: identifier,
  capabilities: boundedUniqueEnumArray(aiCapabilities),
  dataClasses: boundedUniqueEnumArray(aiDataClasses),
  timeoutMs: z.number().int().min(100).max(120_000),
  maxAttempts: z.number().int().min(1).max(3),
  maxCostCents: z.number().int().nonnegative().max(1_000_000),
  enabled: z.boolean(),
});

export type AiAdapterProfile = Readonly<{
  adapterId: string;
  modelId: string;
  capabilities: readonly AiCapability[];
  dataClasses: readonly AiDataClass[];
  timeoutMs: number;
  maxAttempts: number;
  maxCostCents: number;
  enabled: boolean;
}>;

export class AiRoutingError extends Error {
  constructor(readonly code: "INVALID_PROFILE" | "DUPLICATE_ADAPTER" | "POLICY_DENIED" | "UNAVAILABLE" | "FALLBACK_NOT_APPROVED") {
    super(code === "POLICY_DENIED"
      ? "AI request is not permitted"
      : code === "UNAVAILABLE"
        ? "No AI adapter is available"
        : code === "FALLBACK_NOT_APPROVED"
          ? "AI fallback is not approved"
          : "AI routing configuration is invalid");
    this.name = "AiRoutingError";
  }
}

export type AiRoutingRequest = Readonly<{
  capability: AiCapability;
  dataClass: AiDataClass;
  maxCostCents: number;
}>;

/** Selects one enabled adapter deterministically after capability and data-class checks. */
export function selectAiAdapter(
  profiles: readonly unknown[],
  request: AiRoutingRequest,
): Readonly<AiAdapterProfile> {
  if (!Number.isInteger(request.maxCostCents) || request.maxCostCents < 0) {
    throw new AiRoutingError("POLICY_DENIED");
  }

  const parsed = profiles.map((value) => {
    const result = aiAdapterProfileSchema.safeParse(value);
    if (!result.success) throw new AiRoutingError("INVALID_PROFILE");
    return result.data;
  });
  const seen = new Set<string>();
  for (const profile of parsed) {
    if (seen.has(profile.adapterId)) throw new AiRoutingError("DUPLICATE_ADAPTER");
    seen.add(profile.adapterId);
  }

  const eligible = parsed
    .filter((profile) => profile.enabled
      && profile.capabilities.includes(request.capability)
      && profile.dataClasses.includes(request.dataClass)
      && request.maxCostCents <= profile.maxCostCents)
    .sort((left, right) => left.adapterId.localeCompare(right.adapterId));
  const selected = eligible[0];
  if (!selected) throw new AiRoutingError("UNAVAILABLE");
  return Object.freeze({ ...selected, capabilities: Object.freeze([...selected.capabilities]), dataClasses: Object.freeze([...selected.dataClasses]) });
}

export type AiExecutionSuccess<T> = Readonly<{
  status: "succeeded";
  value: T;
  adapterId: string;
  attempts: number;
  fallbackUsed: boolean;
  fallbackReference: string | null;
}>;

export type AiExecutionFailure = Readonly<{
  status: "failed";
  failureCode: "provider_timeout" | "provider_error" | "validation_failed";
  adapterId: string;
  attempts: number;
  fallbackUsed: boolean;
  fallbackReference: string | null;
}>;

export type AiExecutionResult<T> = AiExecutionSuccess<T> | AiExecutionFailure;

type Execute = (profile: AiAdapterProfile, input: unknown, signal: AbortSignal) => Promise<unknown>;

type ExecutionOptions<T> = Readonly<{
  profiles: readonly unknown[];
  request: AiRoutingRequest;
  input: unknown;
  schema: z.ZodType<T>;
  execute: Execute;
  fallback?: Readonly<{
    profile: unknown;
    approvalReference: string;
  }>;
}>;

/** Runs a schema-validated AI call with bounded retries and an explicit, auditable fallback. */
export async function executeAiWithPolicy<T>(options: ExecutionOptions<T>): Promise<AiExecutionResult<T>> {
  const primary = selectAiAdapter(options.profiles, options.request);
  const first = await executeAdapter(primary, options);
  if (first.status === "succeeded" || first.failureCode === "validation_failed" || options.fallback === undefined) return first;

  const fallbackReference = options.fallback.approvalReference.trim();
  if (!identifier.safeParse(fallbackReference).success) throw new AiRoutingError("FALLBACK_NOT_APPROVED");
  const fallbackResult = aiAdapterProfileSchema.safeParse(options.fallback.profile);
  if (!fallbackResult.success) throw new AiRoutingError("INVALID_PROFILE");
  if (fallbackResult.data.adapterId === primary.adapterId) throw new AiRoutingError("DUPLICATE_ADAPTER");
  const fallback = selectAiAdapter([fallbackResult.data], options.request);
  const second = await executeAdapter(fallback, options);
  return second.status === "succeeded"
    ? { ...second, fallbackUsed: true, fallbackReference }
    : { ...second, fallbackUsed: true, fallbackReference };
}

async function executeAdapter<T>(profile: AiAdapterProfile, options: ExecutionOptions<T>): Promise<AiExecutionResult<T>> {
  let attempts = 0;
  let failureCode: "provider_timeout" | "provider_error" = "provider_error";
  while (attempts < profile.maxAttempts) {
    attempts += 1;
    const controller = new AbortController();
    try {
      const raw = await withTimeout(options.execute(profile, options.input, controller.signal), profile.timeoutMs, controller);
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) {
        return { status: "failed", failureCode: "validation_failed", adapterId: profile.adapterId, attempts, fallbackUsed: false, fallbackReference: null };
      }
      return { status: "succeeded", value: parsed.data, adapterId: profile.adapterId, attempts, fallbackUsed: false, fallbackReference: null };
    } catch (error) {
      failureCode = error instanceof AiTimeoutError ? "provider_timeout" : "provider_error";
    }
  }
  return { status: "failed", failureCode, adapterId: profile.adapterId, attempts, fallbackUsed: false, fallbackReference: null };
}

class AiTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AiTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export { identifier };
