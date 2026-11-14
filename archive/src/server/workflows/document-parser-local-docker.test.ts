import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDockerParserSandbox } from "./document-parser-local-docker";
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
const request = { protocolVersion: 1 as const, requestId: "00000000-0000-4000-8000-000000000001",
  profileId: "private-document-processing-v1" as const, contentType: "application/pdf" as const, byteSize: 1, sha256: "9".repeat(64) };
const attestation = { protocol: 1, nodeVersion: "24.20.0", packages: config.runtime.packages,
  artifactManifestSha256: config.artifactManifestSha256, sourceSha256: config.runtime.sourceSha256,
  cgroupVersion: 2, memoryBytes: 536870912, swapBytes: 0, maxProcesses: 8, cpuCount: 1, uid: 65532,
  gid: 65532, effectiveCapabilities: "0000000000000000", noNewPrivileges: true, seccompFilter: true,
  externalInterfaces: 0, rootReadonly: true };
const readyFrame = (value: unknown = attestation) => Buffer.from(PARSER_READY_PREFIX + JSON.stringify(value) + "\n");
const child = () => Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
let attached: ReturnType<typeof child>, present: boolean, currentOwner: string | null, boot: Buffer;
const inspected = () => ({ Id: id, Name: "/" + mocks.ownerName, Image: image,
  Config: { Image: config.runtime.imageReference, User: "65532:65532", WorkingDir: "/opt/mmhr-parser",
    Entrypoint: ["/usr/local/bin/node"], Cmd: ["--max-old-space-size=256", "/opt/mmhr-parser/document-parser-entry-attested.mjs"],
    Env: ["LANG=C.UTF-8", "TZ=UTC", "NODE_ENV=production", "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "HOME=/tmp", "TMPDIR=/tmp", "NODE_VERSION=24.20.0", "YARN_VERSION=", "UV_THREADPOOL_SIZE=1"],
    Labels: { "mmhr.private-parser.owner": currentOwner || mocks.ownerName }, Healthcheck: { Test: ["NONE"] }, Volumes: null, ExposedPorts: null },
  HostConfig: { NetworkMode: "none", ReadonlyRootfs: true, Memory: 536870912, MemorySwap: 536870912,
    NanoCpus: 1000000000, PidsLimit: 8, CapDrop: ["ALL"], CapAdd: null, SecurityOpt: ["no-new-privileges"],
    Privileged: false, Binds: null, Devices: null, DeviceRequests: null, PortBindings: null,
    Tmpfs: { "/tmp": "rw,noexec,nosuid,size=16777216" }, PidMode: "", IpcMode: "private", CgroupnsMode: "private",
    LogConfig: { Type: "none", Config: {} }, RestartPolicy: { Name: "no", MaximumRetryCount: 0 } },
  Mounts: [], NetworkSettings: { Ports: null, Networks: { none: {} } }, State: { Running: true, ExitCode: 0, OOMKilled: false } });

beforeEach(() => {
  vi.clearAllMocks(); attached = child(); present = true; currentOwner = null; boot = readyFrame();
  mocks.prepare.mockResolvedValue(undefined); mocks.record.mockResolvedValue(undefined); mocks.stop.mockResolvedValue(undefined);
  mocks.start.mockImplementation(() => { queueMicrotask(() => attached.stdout.write(boot)); return attached; });
  mocks.metadata.mockImplementation(async (args: string[]) => {
    let stdout = "";
    if (args[0] === "image") stdout = JSON.stringify([{ Id: image, Os: "linux", Architecture: "amd64", RepoDigests: [config.runtime.imageReference] }]);
    else if (args[0] === "create") stdout = id;
    else if (args[1] === "inspect") stdout = JSON.stringify([inspected()]);
    else if (args[1] === "ls") stdout = present ? id : "";
    else if (args[1] === "rm") { present = false; stdout = id; }
    return { code: 0, signal: null, stdout };
  });
});

describe("owned Docker controller with a synthetic transport", () => {
  it("allocates without starting a command or writing a marker", () => {
    createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it("requires readiness before bytes and writes the exact binary frame", async () => {
    const received: Buffer[] = []; attached.stdin.on("data", (chunk: Buffer) => received.push(chunk));
    const session = createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    await expect(session.sendInput(Uint8Array.of(1))).rejects.toThrow("Parser input unavailable");
    expect(await session.launch(new AbortController().signal)).toEqual({ outcome: "ready" });
    await session.sendInput(Uint8Array.of(1));
    const frame = Buffer.concat(received), size = frame.readUInt32BE(0);
    expect(JSON.parse(frame.subarray(4, 4 + size).toString())).toEqual(request);
    expect(frame.subarray(4 + size)).toEqual(Buffer.from([1]));
    await expect(session.sendInput(Uint8Array.of(1))).rejects.toThrow();
  });
  it("denies crossed runtime bytes before document input", async () => {
    boot = readyFrame({ ...attestation, artifactManifestSha256: "0".repeat(64) });
    const session = createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    expect(await session.launch(new AbortController().signal)).toEqual({ outcome: "failed", code: "isolation_unavailable" });
    await expect(session.sendInput(Uint8Array.of(1))).rejects.toThrow();
  });
  it("denies a premature result after readiness", async () => {
    mocks.start.mockImplementation(() => { queueMicrotask(() => { attached.stdout.write(boot); attached.stdout.write("{}"); }); return attached; });
    const session = createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    expect(await session.launch(new AbortController().signal)).toEqual({ outcome: "failed", code: "isolation_unavailable" });
    await expect(session.sendInput(Uint8Array.of(1))).rejects.toThrow();
  });
  it("does not create or record an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    const session = createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    expect(await session.launch(controller.signal)).toEqual({ outcome: "failed", code: "isolation_unavailable" });
    await session.stopAndVerify(); expect(mocks.metadata).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });
  it("retains an unknown create when no current container exists", async () => {
    const original = mocks.metadata.getMockImplementation()!;
    mocks.metadata.mockImplementation(async (args: string[]) => { if (args[0] === "create") { present = false; throw new Error("synthetic timeout"); } return original(args); });
    const session = createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    await session.launch(new AbortController().signal);
    await expect(session.stopAndVerify()).rejects.toThrow("Parser create outcome remains unknown");
    expect(mocks.metadata.mock.calls.some(([args]) => args[1] === "rm")).toBe(false);
  });
  it("refuses to remove a container with a foreign owner", async () => {
    const session = createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    await session.launch(new AbortController().signal); currentOwner = "foreign";
    await expect(session.stopAndVerify()).rejects.toThrow("Parser owner mismatch");
    expect(mocks.metadata.mock.calls.some(([args]) => args[1] === "rm")).toBe(false);
  });
  it("removes only the exact target and memoizes cleanup", async () => {
    const session = createLocalDockerParserSandbox(config).allocate(request, () => undefined);
    await session.launch(new AbortController().signal); await session.stopAndVerify(); await session.stopAndVerify();
    expect(mocks.metadata.mock.calls.filter(([args]) => args[1] === "rm").map(([args]) => args)).toEqual([["container", "rm", "--force", id]]);
    expect(present).toBe(false);
    expect(mocks.metadata.mock.calls.some(([args]) => ["pull", "build", "exec"].includes(args[0]))).toBe(false);
  });
});
