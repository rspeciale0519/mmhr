import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDockerParserSandbox } from "./document-parser-local-docker";
import { superviseDocumentParser } from "./document-parser-supervisor";
import { PARSER_READY_PREFIX } from "./document-parser-attestation";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), record: vi.fn(), start: vi.fn(), stop: vi.fn(), metadata: vi.fn(), ownerName: "" }));
vi.mock("./document-parser-docker-transport", async importOriginal => {
  const original = await importOriginal<typeof import("./document-parser-docker-transport")>();
  return { ...original, LocalDockerTransport: class {
    constructor(_config: unknown, name: string) { mocks.ownerName = name; }
    prepare = mocks.prepare; recordCreateAttempt = mocks.record;
    start = mocks.start; stopCommandsAndVerify = mocks.stop; metadata = mocks.metadata;
  } };
});
vi.mock("server-only", () => ({}));

const id = "d".repeat(64), image = "sha256:" + "a".repeat(64);
const config = { transport: { executable: "/usr/bin/docker", executableSha256: "e".repeat(64),
  endpoint: "unix:///var/run/docker.sock", workRoot: "/run/mmhr-private-parser" },
  artifactManifestSha256: "f".repeat(64), runtime: { imageReference: "mmhr-private-parser@sha256:" + "b".repeat(64),
    imageId: image, os: "linux", architecture: "amd64", nodeVersion: "24.20.0", sourceSha256: "c".repeat(64),
    profileId: "private-document-processing-v1", packages: { "pdfjs-dist": "6.3.289", mammoth: "1.13.0", sharp: "0.35.5" } } };
const bytes = Uint8Array.of(1);
const request = { protocolVersion: 1 as const, requestId: "00000000-0000-4000-8000-000000000001",
  profileId: "private-document-processing-v1" as const, contentType: "application/pdf" as const,
  byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
const readiness = { protocol: 1, nodeVersion: "24.20.0", packages: config.runtime.packages,
  artifactManifestSha256: config.artifactManifestSha256, sourceSha256: config.runtime.sourceSha256,
  cgroupVersion: 2, memoryBytes: 536870912, swapBytes: 0, maxProcesses: 8, cpuCount: 1, uid: 65532,
  gid: 65532, effectiveCapabilities: "0000000000000000", noNewPrivileges: true, seccompFilter: true,
  externalInterfaces: 0, rootReadonly: true };
const child = () => Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
let attached: ReturnType<typeof child>, present: boolean, attachedStarted: boolean, closeEmitted: boolean;
let mode: "invalid_readiness" | "oom" | "crash";
let state: { Running: boolean; ExitCode: number; OOMKilled: boolean };
const inspected = () => ({ Id: id, Name: "/" + mocks.ownerName, Image: image,
  Config: { Image: config.runtime.imageReference, User: "65532:65532", WorkingDir: "/opt/mmhr-parser",
    Entrypoint: ["/usr/local/bin/node"], Cmd: ["--max-old-space-size=256", "/opt/mmhr-parser/document-parser-entry-attested.mjs"],
    Env: ["LANG=C.UTF-8", "TZ=UTC", "NODE_ENV=production", "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "HOME=/tmp", "TMPDIR=/tmp", "NODE_VERSION=24.20.0", "YARN_VERSION=", "UV_THREADPOOL_SIZE=1"],
    Labels: { "mmhr.private-parser.owner": mocks.ownerName }, Healthcheck: { Test: ["NONE"] }, Volumes: null, ExposedPorts: null },
  HostConfig: { NetworkMode: "none", ReadonlyRootfs: true, Memory: 536870912, MemorySwap: 536870912,
    NanoCpus: 1000000000, PidsLimit: 8, CapDrop: ["ALL"], CapAdd: null, SecurityOpt: ["no-new-privileges"],
    Privileged: false, Binds: null, Devices: null, DeviceRequests: null, PortBindings: null,
    Tmpfs: { "/tmp": "rw,noexec,nosuid,size=16777216" }, PidMode: "", IpcMode: "private", CgroupnsMode: "private",
    LogConfig: { Type: "none", Config: {} }, RestartPolicy: { Name: "no", MaximumRetryCount: 0 } },
  Mounts: [], NetworkSettings: { Ports: null, Networks: { none: {} } }, State: state });

function closeAttached(oom: boolean): void {
  if (closeEmitted) return;
  closeEmitted = true;
  state = { Running: false, ExitCode: oom ? 137 : 1, OOMKilled: oom };
  attached.emit("close", state.ExitCode, null);
}

beforeEach(() => {
  vi.clearAllMocks(); attached = child(); present = false; attachedStarted = false; closeEmitted = false;
  state = { Running: true, ExitCode: 0, OOMKilled: false }; mode = "invalid_readiness";
  mocks.prepare.mockResolvedValue(undefined); mocks.record.mockResolvedValue(undefined);
  mocks.stop.mockImplementation(async () => { if (attachedStarted) closeAttached(mode === "oom"); });
  mocks.start.mockImplementation(() => {
    attachedStarted = true;
    queueMicrotask(() => {
      if (mode !== "invalid_readiness") closeAttached(mode === "oom");
      else attached.stdout.write(PARSER_READY_PREFIX + JSON.stringify({ ...readiness, artifactManifestSha256: "0".repeat(64) }) + "\n");
    });
    return attached;
  });
  mocks.metadata.mockImplementation(async (args: string[]) => {
    let stdout = "";
    if (args[0] === "image") stdout = JSON.stringify([{ Id: image, Os: "linux", Architecture: "amd64", RepoDigests: [config.runtime.imageReference] }]);
    else if (args[0] === "create") { present = true; stdout = id; }
    else if (args[1] === "inspect") stdout = JSON.stringify([inspected()]);
    else if (args[1] === "ls") stdout = present ? id : "";
    else if (args[1] === "rm") { present = false; stdout = id; }
    return { code: 0, signal: null, stdout };
  });
});

describe("startup classification through the original supervisor and a synthetic transport", () => {
  it("preserves an isolation failure before any attached child exists", async () => {
    mocks.metadata.mockRejectedValue(new Error("synthetic image inspection failure"));
    expect(await superviseDocumentParser(request, bytes, createLocalDockerParserSandbox(config)))
      .toEqual({ outcome: "failed", code: "isolation_unavailable" });
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });
  it("preserves invalid readiness as an isolation failure without sending document bytes", async () => {
    const input: Buffer[] = []; attached.stdin.on("data", (chunk: Buffer) => input.push(chunk));
    expect(await superviseDocumentParser(request, bytes, createLocalDockerParserSandbox(config)))
      .toEqual({ outcome: "failed", code: "isolation_unavailable" });
    expect(input).toEqual([]); expect(present).toBe(false);
  });
  it("uses the inspected startup OOM receipt instead of a fabricated null close", async () => {
    mode = "oom";
    expect(await superviseDocumentParser(request, bytes, createLocalDockerParserSandbox(config)))
      .toEqual({ outcome: "failed", code: "memory_limit" });
    expect(present).toBe(false);
  });
  it("retains a proved startup crash as worker_crash", async () => {
    mode = "crash";
    expect(await superviseDocumentParser(request, bytes, createLocalDockerParserSandbox(config)))
      .toEqual({ outcome: "failed", code: "worker_crash" });
    expect(present).toBe(false);
  });
});
