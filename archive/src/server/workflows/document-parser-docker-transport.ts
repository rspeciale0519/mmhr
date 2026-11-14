import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const localDockerTransportConfigSchema = z.strictObject({
  executable: z.string().min(1), executableSha256: z.string().regex(/^[a-f0-9]{64}$/),
  endpoint: z.literal("unix:///var/run/docker.sock"), workRoot: z.string().min(1),
});
export type LocalDockerTransportConfig = z.output<typeof localDockerTransportConfigSchema>;
export type DockerMetadataResult = Readonly<{ code: number | null; signal: string | null; stdout: string }>;
type OwnedCommand = { child: ChildProcessWithoutNullStreams; closed: boolean;
  identity: Promise<Readonly<{ startTime: string; processGroup: string }> | null>; terminal: Promise<void> };

/** This service-only transport never accepts a document path or host URL.
 * It requires Linux and an already acquired, operator-reviewed Docker binary.
 * No executable discovery, image acquisition, or saved Docker config occurs. */
export class LocalDockerTransport {
  private readonly config: LocalDockerTransportConfig;
  private readonly directory: string;
  private prepared = false;
  private readonly commands: OwnedCommand[] = [];

  constructor(rawConfig: unknown, private readonly ownerName: string) {
    this.config = localDockerTransportConfigSchema.parse(rawConfig);
    if (process.platform !== "linux" || !path.isAbsolute(this.config.executable) || !path.isAbsolute(this.config.workRoot)
      || !/^mmhr-private-parser-[a-f0-9]{32}$/.test(ownerName)) throw new Error("Parser host configuration unavailable");
    this.directory = path.join(this.config.workRoot, ownerName);
  }

  async recordCreateAttempt(runtime: Readonly<{ imageReference: string; imageId: string; sourceSha256: string }>): Promise<void> {
    if (!this.prepared) throw new Error("Parser transport not prepared");
    await this.writeOwnershipFile("create-attempted.json", { ownerName: this.ownerName, runtime,
      attemptedAt: new Date().toISOString() });
  }

  private async syncDirectory(directoryPath: string): Promise<void> {
    const directory = await open(directoryPath, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }

  private async writeOwnershipFile(name: "owner.json" | "create-attempted.json", value: Readonly<Record<string, unknown>>): Promise<void> {
    const journal = await open(path.join(this.directory, name), "wx", 0o600);
    try { await journal.writeFile(JSON.stringify(value) + "\n"); await journal.sync(); } finally { await journal.close(); }
    await this.syncDirectory(this.directory);
  }

  async prepare(): Promise<void> {
    if (this.prepared) throw new Error("Parser transport already prepared");
    for (const file of [this.config.executable, this.config.workRoot]) {
      if ((await lstat(file)).isSymbolicLink() || await realpath(file) !== file) throw new Error("Parser host path not physical");
    }
    const work = await lstat(this.config.workRoot);
    if (!work.isDirectory() || work.uid !== process.getuid?.() || (work.mode & 0o077) !== 0) throw new Error("Parser host directory not private");
    const bytes = await readFile(this.config.executable);
    if (createHash("sha256").update(bytes).digest("hex") !== this.config.executableSha256) throw new Error("Parser Docker binary drift");
    await mkdir(this.directory, { mode: 0o700 });
    // The parent must persist the new directory entry before a daemon request.
    await this.syncDirectory(this.config.workRoot);
    await writeFile(path.join(this.directory, "config.json"), '{"auths":{}}\n', { mode: 0o600, flag: "wx" });
    // The immutable public ownership marker exists before a create request.
    await this.writeOwnershipFile("owner.json", { ownerName: this.ownerName,
      endpoint: this.config.endpoint, createdAt: new Date().toISOString() });
    this.prepared = true;
  }

  start(arguments_: string[]): ChildProcessWithoutNullStreams {
    if (!this.prepared || arguments_.some(value => value.includes("\0"))) throw new Error("Parser transport not prepared");
    const child = spawn(this.config.executable, ["--host", this.config.endpoint, "--config", this.directory, ...arguments_], {
      shell: false, detached: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: path.dirname(this.config.executable), LANG: "C.UTF-8", NODE_ENV: "production", HOME: this.directory,
        DOCKER_CONFIG: this.directory },
    });
    const command: OwnedCommand = { child, closed: false,
      identity: child.pid ? this.readIdentity(child.pid) : Promise.resolve(null), terminal: Promise.resolve() };
    command.terminal = new Promise(resolve => {
      child.once("error", () => undefined);
      child.once("close", () => { command.closed = true; resolve(); });
    });
    this.commands.push(command);
    return child;
  }

  private async readIdentity(pid: number): Promise<Readonly<{ startTime: string; processGroup: string }> | null> {
    try {
      const record = await readFile(`/proc/${pid}/stat`, "utf8"), fields = record.slice(record.lastIndexOf(")") + 2).trim().split(/\s+/);
      if (await readlink(`/proc/${pid}/exe`) !== this.config.executable || fields[2] !== String(pid) || !/^\d+$/.test(fields[19] || "")) return null;
      return { startTime: fields[19], processGroup: fields[2] };
    } catch { return null; }
  }

  async stopCommandsAndVerify(deadline: number): Promise<void> {
    for (const command of this.commands) {
      if (command.closed) continue;
      const original = await command.identity, pid = command.child.pid;
      if (!pid || !original) throw new Error("Parser CLI ownership unavailable");
      const current = await this.readIdentity(pid);
      if (!current || current.startTime !== original.startTime || current.processGroup !== original.processGroup) {
        // A closed leader with unknown descendants cannot justify a group stop.
        if (!command.closed) throw new Error("Parser CLI ownership changed");
        continue;
      }
      process.kill(-pid, "SIGKILL");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([command.terminal, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Parser CLI cleanup unavailable")), Math.max(0, deadline - performance.now()));
      })]); } finally { if (timer) clearTimeout(timer); }
    }
    if (this.commands.some(command => !command.closed)) throw new Error("Parser CLI cleanup unavailable");
    for (const command of this.commands) {
      if (!command.child.pid) continue;
      try { process.kill(-command.child.pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") continue; throw error; }
      throw new Error("Parser CLI process group remains");
    }
  }

  async metadata(arguments_: string[], deadline: number): Promise<DockerMetadataResult> {
    const child = this.start(arguments_);
    let bytes = 0, overflow = false, ioFailed = false;
    const chunks: Buffer[] = [];
    const failedIo = () => { ioFailed = true; };
    child.stdin.on("error", failedIo); child.stdout.on("error", failedIo); child.stderr.on("error", failedIo);
    child.stdin.end();
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 131072) { overflow = true; return; }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 131072) overflow = true; });
    const terminal = new Promise<{ code: number | null; signal: string | null }>(resolve => {
      child.once("error", failedIo);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    // A metadata timeout is uncertain. It does not imply daemon cancellation.
    // The session must preserve unknown create ownership until reconciliation.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([terminal, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Parser Docker command timeout")), Math.max(0, deadline - performance.now()));
      })]);
      if (ioFailed) throw new Error("Parser Docker command I/O unavailable");
      if (overflow) throw new Error("Parser Docker metadata limit");
      return { ...result, stdout: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)) };
    } finally { if (timer) clearTimeout(timer); }
  }
}
