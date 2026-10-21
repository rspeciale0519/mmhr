import { describe, expect, it } from "vitest";
import { PARSER_READY_PREFIX, readParserAttestation } from "./document-parser-attestation";

const value = { protocol: 1, nodeVersion: "24.20.0",
  packages: { "pdfjs-dist": "6.3.289", mammoth: "1.13.0", sharp: "0.35.5" },
  artifactManifestSha256: "a".repeat(64), sourceSha256: "b".repeat(64), cgroupVersion: 2,
  memoryBytes: 536870912, swapBytes: 0, maxProcesses: 8, cpuCount: 1, uid: 65532, gid: 65532,
  effectiveCapabilities: "0000000000000000", noNewPrivileges: true, seccompFilter: true,
  externalInterfaces: 0, rootReadonly: true };
const frame = (raw: unknown) => Buffer.from(PARSER_READY_PREFIX + JSON.stringify(raw) + "\n");

describe("document-free parser readiness protocol", () => {
  it("accepts the exact bounded controls without a document field", () => {
    expect(readParserAttestation(frame(value))).toEqual(value);
  });
  it.each([
    ["node version", { nodeVersion: "24.21.0" }],
    ["heap-only memory", { memoryBytes: 268435456 }],
    ["unbounded swap", { swapBytes: 536870912 }],
    ["increased process limit", { maxProcesses: 9 }],
    ["extra CPU", { cpuCount: 2 }],
    ["root user", { uid: 0 }],
    ["network interface", { externalInterfaces: 1 }],
    ["writable root", { rootReadonly: false }],
    ["privilege gain", { noNewPrivileges: false }],
    ["disabled seccomp", { seccompFilter: false }],
    ["document content", { text: "private" }],
  ])("rejects %s", (_name, change) => {
    expect(() => readParserAttestation(frame({ ...value, ...change }))).toThrow();
  });
  it("rejects invalid UTF-8 and an oversized frame", () => {
    expect(() => readParserAttestation(Uint8Array.from([0xff]))).toThrow();
    expect(() => readParserAttestation(Buffer.alloc(4097))).toThrow();
  });
  it("requires one newline-terminated readiness frame", () => {
    expect(() => readParserAttestation(Buffer.from(JSON.stringify(value) + "\n"))).toThrow();
    expect(() => readParserAttestation(frame(value).subarray(0, frame(value).length - 1))).toThrow();
    expect(() => readParserAttestation(Buffer.concat([frame(value), Buffer.from("{}")]))).toThrow();
  });
});
