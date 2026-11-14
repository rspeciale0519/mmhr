import "server-only";
import { buildParserContainerArguments, parserContainerMatchesPolicy, parserRuntimeManifestSchema } from "./document-parser-docker-policy";

const extraEnvironment = ["NODE_VERSION=24.20.0", "YARN_VERSION=", "UV_THREADPOOL_SIZE=1"];
const command = ["--max-old-space-size=256", "/opt/mmhr-parser/document-parser-entry-attested.mjs"];
const exactArray = (actual: unknown, expected: string[]) => Array.isArray(actual) && actual.length === expected.length
  && actual.every((value, index) => value === expected[index]);

export function buildAttestedParserArguments(runtime: unknown, name: string): string[] {
  const parsed = parserRuntimeManifestSchema.parse(runtime), base = buildParserContainerArguments(parsed, name);
  const imageIndex = base.lastIndexOf(parsed.imageReference);
  if (imageIndex < 0) throw new Error("Invalid reviewed parser policy");
  return [...base.slice(0, imageIndex), "--cgroupns", "private",
    ...extraEnvironment.flatMap(value => ["--env", value]), parsed.imageReference, ...command];
}

export function attestedParserMatchesPolicy(raw: unknown, runtime: unknown, name: string, id: string): boolean {
  if (raw === null || typeof raw !== "object" || !("Config" in raw) || !("HostConfig" in raw)) return false;
  const config = raw.Config, host = raw.HostConfig;
  if (config === null || typeof config !== "object" || host === null || typeof host !== "object"
    || !("Cmd" in config) || !("Env" in config) || !("CgroupnsMode" in host)
    || host.CgroupnsMode !== "private" || !exactArray(config.Cmd, command) || !Array.isArray(config.Env)) return false;
  const env: unknown[] = config.Env;
  if (!env.every(value => typeof value === "string") || new Set(env).size !== env.length
    || !extraEnvironment.every(value => env.includes(value))) return false;
  // Validate every paired change before projecting the unchanged V8 controls.
  // An inherited unknown environment variable still fails the original guard.
  const baseEnv = env.filter(value => !extraEnvironment.includes(value as string));
  return parserContainerMatchesPolicy({ ...raw, Config: { ...config,
    Cmd: ["/opt/mmhr-parser/document-parser-entry.mjs"], Env: baseEnv } }, runtime, name, id);
}
