import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { z } from "zod";
import { parserAttestationSchema, type ParserAttestation } from "../workflows/document-parser-attestation";

const runtimeRoot = "/opt/mmhr-parser", manifestPath = runtimeRoot + "/runtime-manifest.json";
const fileSchema = z.strictObject({ path: z.string().regex(/^[A-Za-z0-9_@./-]{1,240}$/)
  .refine(value => !value.startsWith("/") && !value.split("/").some(part => !part || part === "." || part === "..")),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.int().min(0).max(150_000_000) });
const manifestSchema = z.strictObject({ version: z.literal(1), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(fileSchema).min(1).max(20000) });

async function boundedText(file: string, maxBytes = 16384): Promise<string> {
  const bytes = await readFile(file);
  if (bytes.length > maxBytes) throw new Error("Parser runtime metadata limit");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function exactLimit(value: string, expected: bigint): void {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed) || BigInt(trimmed) !== expected) throw new Error("Parser native limit not enforced");
}

async function verifyFiles(): Promise<{ sourceSha256: string; artifactManifestSha256: string }> {
  const raw = await boundedText(manifestPath, 3_000_000), manifest = manifestSchema.parse(JSON.parse(raw));
  const names: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Parser runtime link denied");
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        if (file !== manifestPath) names.push(path.relative(runtimeRoot, file));
        if (names.length > 20000) throw new Error("Parser runtime inventory limit");
      } else throw new Error("Parser runtime entry denied");
    }
  }
  await walk(runtimeRoot);
  const expected = [...manifest.files].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (new Set(expected.map(file => file.path)).size !== expected.length || names.length !== expected.length
    || [...names].sort().some((name, index) => name !== expected[index].path)) throw new Error("Parser runtime inventory changed");
  const inventoryHash = createHash("sha256");
  for (const file of expected) {
    const absolute = path.join(runtimeRoot, file.path), metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== file.size || await realpath(absolute) !== absolute) throw new Error("Parser runtime file changed");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(absolute, { highWaterMark: 65536 })) hash.update(chunk);
    if (hash.digest("hex") !== file.sha256) throw new Error("Parser runtime bytes changed");
    inventoryHash.update(`${file.path}\0${file.sha256}\0${file.size}\n`, "utf8");
  }
  if (inventoryHash.digest("hex") !== manifest.sourceSha256) throw new Error("Parser runtime inventory digest changed");
  return { sourceSha256: manifest.sourceSha256, artifactManifestSha256: createHash("sha256").update(raw, "utf8").digest("hex") };
}

export async function inspectRuntimeBeforeInput(): Promise<ParserAttestation> {
  if (process.platform !== "linux" || process.versions.node !== "24.20.0" || process.getuid?.() !== 65532
    || process.getgid?.() !== 65532 || process.getgroups?.().some(group => group !== 65532)) throw new Error("Parser runtime identity not enforced");
  const files = await verifyFiles();
  const packages: Record<string, string> = {};
  for (const name of ["pdfjs-dist", "mammoth", "sharp"]) {
    const metadata: unknown = JSON.parse(await boundedText(`${runtimeRoot}/node_modules/${name}/package.json`, 65536));
    if (metadata === null || typeof metadata !== "object" || !("version" in metadata) || typeof metadata.version !== "string") throw new Error("Parser package metadata unavailable");
    packages[name] = metadata.version;
  }
  await exactLimit(await boundedText("/sys/fs/cgroup/memory.max"), BigInt(536870912));
  await exactLimit(await boundedText("/sys/fs/cgroup/memory.swap.max"), BigInt(0));
  await exactLimit(await boundedText("/sys/fs/cgroup/pids.max"), BigInt(8));
  const cpu = (await boundedText("/sys/fs/cgroup/cpu.max")).trim().split(/\s+/);
  if (cpu.length !== 2 || !cpu.every(value => /^\d+$/.test(value)) || BigInt(cpu[0]) === BigInt(0)
    || BigInt(cpu[0]) !== BigInt(cpu[1])) throw new Error("Parser CPU limit not enforced");
  const status = await boundedText("/proc/self/status");
  const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(status)?.[1]?.trim();
  if (field("CapEff") !== "0000000000000000" || field("NoNewPrivs") !== "1" || field("Seccomp") !== "2") throw new Error("Parser process controls not enforced");
  const externalInterfaces = Object.values(networkInterfaces()).flatMap(values => values || []).filter(value => !value.internal).length;
  if (externalInterfaces !== 0) throw new Error("Parser network access not denied");
  const roots = (await boundedText("/proc/self/mountinfo", 65536)).split("\n").map(line => line.split(" "))
    .filter(fields => fields[4] === "/");
  if (roots.length !== 1 || !roots[0][5]?.split(",").includes("ro")) throw new Error("Parser root not read-only");
  return parserAttestationSchema.parse({ protocol: 1, nodeVersion: process.versions.node, packages, ...files,
    cgroupVersion: 2, memoryBytes: 536870912, swapBytes: 0, maxProcesses: 8, cpuCount: 1,
    uid: 65532, gid: 65532, effectiveCapabilities: field("CapEff"), noNewPrivileges: true,
    seccompFilter: true, externalInterfaces, rootReadonly: true });
}
