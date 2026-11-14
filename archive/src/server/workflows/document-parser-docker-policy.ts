import "server-only";
import { z } from "zod";

import { DOCUMENT_PROCESSING_PROFILE } from "./document-processing-contract";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const imageReference = z.string().regex(/^[a-z0-9][a-z0-9./_-]{0,180}@sha256:[a-f0-9]{64}$/);
const ownerName = z.string().regex(/^mmhr-private-parser-[a-f0-9]{32}$/);
const containerId = z.string().regex(/^[a-f0-9]{64}$/);
const ownerLabel = "mmhr.private-parser.owner";
export const parserRuntimeManifestSchema = z.strictObject({
  imageReference, imageId: digest, os: z.literal("linux"), architecture: z.enum(["amd64", "arm64"]),
  nodeVersion: z.literal("24.20.0"),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  profileId: z.literal(DOCUMENT_PROCESSING_PROFILE.id),
  packages: z.strictObject({ "pdfjs-dist": z.literal("6.3.289"), mammoth: z.literal("1.13.0"), sharp: z.literal("0.35.5") }),
});
export type ParserRuntimeManifest = z.output<typeof parserRuntimeManifestSchema>;

const containerEnvironment = ["LANG=C.UTF-8", "TZ=UTC", "NODE_ENV=production",
  "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOME=/tmp", "TMPDIR=/tmp"];
const temporaryMount = "/tmp:rw,noexec,nosuid,size=16777216";

/** Pure draft only. The runtime manifest comes from reviewed deployment
 * configuration and a matching local image inspection, never user input.
 * No image is selected, pulled, built, or started by this module. */
export function buildParserContainerArguments(rawRuntime: unknown, rawName: unknown): string[] {
  const runtime = parserRuntimeManifestSchema.parse(rawRuntime);
  const name = ownerName.parse(rawName);
  return ["create", "--pull", "never", "--interactive", "--name", name, "--label", `${ownerLabel}=${name}`,
    "--network", "none", "--ipc", "private", "--read-only", "--memory", String(DOCUMENT_PROCESSING_PROFILE.maxMemoryBytes),
    "--memory-swap", String(DOCUMENT_PROCESSING_PROFILE.maxMemoryBytes), "--cpus", "1", "--pids-limit", String(DOCUMENT_PROCESSING_PROFILE.maxProcesses),
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65532:65532",
    "--tmpfs", temporaryMount, "--log-driver", "none", "--restart", "no", "--no-healthcheck",
    "--workdir", "/opt/mmhr-parser", "--entrypoint", "/usr/local/bin/node",
    ...containerEnvironment.flatMap(value => ["--env", value]), runtime.imageReference,
    "/opt/mmhr-parser/document-parser-entry.mjs"];
}

/** Compare inspected host controls before attaching input bytes. This is
 * defense in depth; real memory/network isolation still requires host proof.
 * The backend must repeat ownership inspection before stopping/removing. */
export function parserContainerMatchesPolicy(raw: unknown, rawRuntime: unknown, rawName: unknown, rawId: unknown): boolean {
  const runtime = parserRuntimeManifestSchema.safeParse(rawRuntime), name = ownerName.safeParse(rawName), id = containerId.safeParse(rawId);
  const shape = z.object({
    Id: containerId, Name: z.string(), Image: digest,
    Config: z.object({ Image: imageReference, User: z.string(), WorkingDir: z.string(), Entrypoint: z.array(z.string()),
      Cmd: z.array(z.string()), Env: z.array(z.string()), Labels: z.record(z.string(), z.string()),
      Healthcheck: z.object({ Test: z.array(z.string()) }), Volumes: z.record(z.string(), z.unknown()).nullable(),
      ExposedPorts: z.record(z.string(), z.unknown()).nullable(),
    }),
    HostConfig: z.object({ NetworkMode: z.string(), ReadonlyRootfs: z.boolean(), Memory: z.number(), MemorySwap: z.number(),
      NanoCpus: z.number(), PidsLimit: z.number(), CapDrop: z.array(z.string()), CapAdd: z.array(z.string()).nullable(),
      SecurityOpt: z.array(z.string()), Privileged: z.boolean(), Binds: z.array(z.string()).nullable(),
      Devices: z.array(z.unknown()).nullable(), DeviceRequests: z.array(z.unknown()).nullable(),
      PortBindings: z.record(z.string(), z.unknown()).nullable(), Tmpfs: z.record(z.string(), z.string()),
      PidMode: z.string(), IpcMode: z.string(), LogConfig: z.object({ Type: z.string(), Config: z.record(z.string(), z.string()) }),
      RestartPolicy: z.object({ Name: z.string(), MaximumRetryCount: z.number() }),
    }), Mounts: z.array(z.unknown()), NetworkSettings: z.object({ Ports: z.record(z.string(), z.unknown()).nullable(),
      Networks: z.record(z.string(), z.unknown()),
    }),
  }).safeParse(raw);
  if (!runtime.success || !name.success || !id.success || !shape.success) return false;
  const value = shape.data, host = value.HostConfig, config = value.Config;
  const empty = (field: object | null) => field === null || Object.keys(field).length === 0;
  const sameSet = (left: string[], right: string[]) => left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
  return value.Id === id.data && value.Name === `/${name.data}` && value.Image === runtime.data.imageId
    && config.Image === runtime.data.imageReference && config.Labels[ownerLabel] === name.data
    && config.User === "65532:65532" && config.WorkingDir === "/opt/mmhr-parser"
    && sameSet(config.Entrypoint, ["/usr/local/bin/node"]) && sameSet(config.Cmd, ["/opt/mmhr-parser/document-parser-entry.mjs"])
    && sameSet(config.Env, containerEnvironment) && sameSet(config.Healthcheck.Test, ["NONE"])
    && empty(config.Volumes) && empty(config.ExposedPorts) && value.Mounts.length === 0
    && host.NetworkMode === "none" && host.ReadonlyRootfs && host.Memory === DOCUMENT_PROCESSING_PROFILE.maxMemoryBytes
    && host.MemorySwap === DOCUMENT_PROCESSING_PROFILE.maxMemoryBytes && host.NanoCpus === 1_000_000_000
    && host.PidsLimit === DOCUMENT_PROCESSING_PROFILE.maxProcesses && !host.Privileged
    && sameSet(host.CapDrop, ["ALL"]) && empty(host.CapAdd) && sameSet(host.SecurityOpt, ["no-new-privileges"])
    && empty(host.Binds) && empty(host.Devices) && empty(host.DeviceRequests) && empty(host.PortBindings)
    && host.PidMode === "" && host.IpcMode === "private" && host.LogConfig.Type === "none" && empty(host.LogConfig.Config)
    && host.RestartPolicy.Name === "no" && host.RestartPolicy.MaximumRetryCount === 0
    && Object.keys(host.Tmpfs).length === 1 && host.Tmpfs["/tmp"] === temporaryMount.slice(5)
    && empty(value.NetworkSettings.Ports) && sameSet(Object.keys(value.NetworkSettings.Networks), ["none"]);
}
