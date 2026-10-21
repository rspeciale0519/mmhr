import { createHash } from "node:crypto";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDockerTransport } from "./document-parser-docker-transport";

const mocks = vi.hoisted(() => ({ events: [] as string[], failSync: "", open: vi.fn(), mkdir: vi.fn(),
  lstat: vi.fn(), realpath: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("node:fs/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, open: mocks.open, mkdir: mocks.mkdir, lstat: mocks.lstat,
    realpath: mocks.realpath, readFile: mocks.readFile, writeFile: mocks.writeFile };
});
vi.mock("server-only", () => ({}));

const executableBytes = Buffer.from("Synthetic reviewed Docker executable");
const workRoot = "/synthetic-private-parser", ownerName = "mmhr-private-parser-" + "a".repeat(32);
const directory = path.join(workRoot, ownerName), ownerPath = path.join(directory, "owner.json");
const createPath = path.join(directory, "create-attempted.json");
const config = { executable: "/synthetic/docker", executableSha256: createHash("sha256").update(executableBytes).digest("hex"),
  endpoint: "unix:///var/run/docker.sock", workRoot };
const runtime = { imageReference: "mmhr-private-parser@sha256:" + "b".repeat(64), imageId: "sha256:" + "c".repeat(64), sourceSha256: "d".repeat(64) };

// These tests isolate prepare's filesystem ordering with synthetic filesystem calls.
// They do not invoke the constructor's Linux checks, spawn a process, or prove host durability.
function transportForFilesystemUnit(): LocalDockerTransport {
  return Object.assign(Object.create(LocalDockerTransport.prototype), { config, directory, ownerName, prepared: false, commands: [] });
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.events.length = 0; mocks.failSync = "";
  mocks.realpath.mockImplementation(async (file: string) => file);
  mocks.lstat.mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => true,
    uid: process.getuid?.(), mode: 0o40700 });
  mocks.readFile.mockResolvedValue(executableBytes);
  mocks.mkdir.mockImplementation(async (file: string) => { mocks.events.push("mkdir:" + file); });
  mocks.writeFile.mockImplementation(async (file: string) => { mocks.events.push("write:" + file); });
  mocks.open.mockImplementation(async (file: string) => {
    mocks.events.push("open:" + file);
    return { writeFile: async () => { mocks.events.push("write:" + file); },
      sync: async () => { mocks.events.push("sync:" + file); if (mocks.failSync === file) throw new Error("synthetic sync failure"); },
      close: async () => { mocks.events.push("close:" + file); } };
  });
});

describe("durable pre-create ownership with a synthetic filesystem", () => {
  it("syncs the parent directory and both marker files before the create attempt can return", async () => {
    const transport = transportForFilesystemUnit();
    await transport.prepare(); await transport.recordCreateAttempt(runtime);
    const index = (event: string) => {
      const found = mocks.events.indexOf(event); expect(found).toBeGreaterThanOrEqual(0); return found;
    };
    expect(index("mkdir:" + directory)).toBeLessThan(index("sync:" + workRoot));
    expect(index("sync:" + workRoot)).toBeLessThan(index("open:" + ownerPath));
    expect(index("write:" + ownerPath)).toBeLessThan(index("sync:" + ownerPath));
    expect(index("sync:" + ownerPath)).toBeLessThan(index("open:" + createPath));
    expect(index("write:" + createPath)).toBeLessThan(index("sync:" + createPath));
    expect(mocks.events.lastIndexOf("sync:" + directory)).toBeGreaterThan(index("sync:" + createPath));
    expect(mocks.events.filter(event => event === "sync:" + directory)).toHaveLength(2);
  });
  it("does not permit a create attempt after the parent directory sync fails", async () => {
    mocks.failSync = workRoot; const transport = transportForFilesystemUnit();
    await expect(transport.prepare()).rejects.toThrow("synthetic sync failure");
    await expect(transport.recordCreateAttempt(runtime)).rejects.toThrow("Parser transport not prepared");
    expect(mocks.events).not.toContain("open:" + ownerPath);
    expect(mocks.events).not.toContain("open:" + createPath);
    expect(mocks.events).toContain("close:" + workRoot);
  });
  it("does not permit a create attempt after the ownership marker sync fails", async () => {
    mocks.failSync = ownerPath; const transport = transportForFilesystemUnit();
    await expect(transport.prepare()).rejects.toThrow("synthetic sync failure");
    await expect(transport.recordCreateAttempt(runtime)).rejects.toThrow("Parser transport not prepared");
    expect(mocks.events).not.toContain("open:" + createPath);
    expect(mocks.events).toContain("close:" + ownerPath);
  });
});
