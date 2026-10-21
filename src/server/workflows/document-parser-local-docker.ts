import "server-only";
import { randomBytes } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { z } from "zod";
import { type DocumentParserRequest } from "./document-processing-contract";
import { type DocumentParserSandbox, type ParserSandboxClose, type ParserSandboxSession } from "./document-parser-supervisor";
import { parserRuntimeManifestSchema } from "./document-parser-docker-policy";
import { buildAttestedParserArguments, attestedParserMatchesPolicy } from "./document-parser-attested-policy";
import { readParserAttestation } from "./document-parser-attestation";
import { LocalDockerTransport, localDockerTransportConfigSchema } from "./document-parser-docker-transport";

const backendConfigSchema = z.strictObject({ transport: localDockerTransportConfigSchema,
  runtime: parserRuntimeManifestSchema, artifactManifestSha256: z.string().regex(/^[a-f0-9]{64}$/) });
type BackendConfig = z.output<typeof backendConfigSchema>;
const idPattern = /^[a-f0-9]{64}$/;
const ready = () => {
  let resolve!: () => void, reject!: () => void;
  const promise = new Promise<void>((accept, deny) => { resolve = accept; reject = () => deny(new Error("Parser runtime not ready")); });
  // A failed startup may close before launch starts awaiting the handshake.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
};

/** Configuration is supplied by the dedicated service operator after review.
 * There is no environment loader, public route, image pull, or disabled fallback. */
export function createLocalDockerParserSandbox(rawConfig: unknown): DocumentParserSandbox {
  const config = backendConfigSchema.parse(rawConfig);
  return { allocate: (request, onStdout) => new OwnedParserSession(config, request, onStdout) };
}

class OwnedParserSession implements ParserSandboxSession {
  readonly closed: Promise<ParserSandboxClose>;
  private resolveClosed!: (close: ParserSandboxClose) => void;
  private readonly name = `mmhr-private-parser-${randomBytes(16).toString("hex")}`;
  private readonly transport: LocalDockerTransport;
  private readonly handshake = ready();
  private launchPromise: ReturnType<ParserSandboxSession["launch"]> | null = null;
  private attached: ChildProcessWithoutNullStreams | null = null;
  private attachedClosed = false;
  private finishPromise: Promise<void> | null = null;
  private id: string | null = null;
  private createAttempted = false;
  private createUnknown = false;
  private closing = false;
  private inputSent = false;
  private ioFailed = false;
  private bootFrame: Buffer[] = [];
  private bootSize = 0;
  private bootAccepted = false;
  private startupInvalid = false;
  private stopPromise: Promise<void> | null = null;

  constructor(private readonly config: BackendConfig, private readonly request: DocumentParserRequest,
    private readonly onStdout: (chunk: Uint8Array) => void) {
    // This constructs local handles only. No transport or daemon is started.
    this.transport = new LocalDockerTransport(config.transport, this.name);
    this.closed = new Promise(resolve => { this.resolveClosed = resolve; });
  }

  private async metadata(arguments_: string[], deadline = performance.now() + 2000): Promise<string> {
    const result = await this.transport.metadata(arguments_, deadline);
    if (result.code !== 0 || result.signal !== null) throw new Error("Parser Docker operation unavailable");
    return result.stdout;
  }

  private async inspect(id: string, deadline?: number): Promise<Record<string, unknown>> {
    const values: unknown = JSON.parse(await this.metadata(["container", "inspect", id], deadline));
    if (!Array.isArray(values) || values.length !== 1 || values[0] === null || typeof values[0] !== "object") throw new Error("Parser container inspection unavailable");
    return values[0] as Record<string, unknown>;
  }

  private requireOpen(signal: AbortSignal): void {
    if (signal.aborted || this.closing || this.startupInvalid || this.ioFailed) throw new Error("Parser launch cancelled");
  }

  launch(signal: AbortSignal): ReturnType<ParserSandboxSession["launch"]> {
    if (this.launchPromise) return this.launchPromise;
    this.launchPromise = this.doLaunch(signal);
    return this.launchPromise;
  }

  private async doLaunch(signal: AbortSignal): ReturnType<ParserSandboxSession["launch"]> {
    try {
      this.requireOpen(signal);
      await this.transport.prepare();
      this.requireOpen(signal);
      const images: unknown = JSON.parse(await this.metadata(["image", "inspect", this.config.runtime.imageReference]));
      if (!Array.isArray(images) || images.length !== 1 || images[0]?.Id !== this.config.runtime.imageId
        || images[0]?.Os !== "linux" || images[0]?.Architecture !== this.config.runtime.architecture
        || !images[0]?.RepoDigests?.includes(this.config.runtime.imageReference)) throw new Error("Reviewed parser image unavailable");
      this.requireOpen(signal);
      await this.transport.recordCreateAttempt(this.config.runtime);
      this.requireOpen(signal);
      this.createAttempted = true;
      this.createUnknown = true;
      const created = (await this.metadata(buildAttestedParserArguments(this.config.runtime, this.name), performance.now() + 5000)).trim();
      if (!idPattern.test(created)) throw new Error("Parser create receipt unavailable");
      this.id = created;
      this.createUnknown = false;
      this.requireOpen(signal);
      if (!attestedParserMatchesPolicy(await this.inspect(created), this.config.runtime, this.name, created)) throw new Error("Parser controls not enforced");
      this.requireOpen(signal);
      this.attached = this.transport.start(["container", "start", "--attach", "--interactive", created]);
      this.attached.stdout.on("data", (chunk: Buffer) => this.receive(chunk));
      const failedIo = () => { this.ioFailed = true; this.handshake.reject(); };
      this.attached.stdin.on("error", failedIo);
      this.attached.stdout.on("error", failedIo);
      this.attached.stderr.on("error", failedIo);
      this.attached.stderr.on("data", () => undefined);
      this.attached.once("error", failedIo);
      this.attached.once("close", () => {
        this.attachedClosed = true;
        this.handshake.reject();
        this.finishPromise ??= this.finish();
      });
      await this.handshake.promise;
      this.requireOpen(signal);
      const inspected = await this.inspect(created);
      if (!attestedParserMatchesPolicy(inspected, this.config.runtime, this.name, created)
        || (inspected.State as { Running?: unknown } | undefined)?.Running !== true) throw new Error("Parser startup controls changed");
      this.requireOpen(signal);
      return { outcome: "ready" };
    } catch {
      // A startup failure is not an exit receipt. If attach has closed, let its
      // inspected exit/OOM proof settle first; otherwise return the launch failure.
      if (this.attachedClosed) await (this.finishPromise ??= this.finish());
      return { outcome: "failed", code: "isolation_unavailable" };
    }
  }

  private receive(chunk: Buffer): void {
    if (this.closing || this.ioFailed) return;
    if (this.bootAccepted) { if (this.inputSent) this.onStdout(chunk); else this.invalidateStartup(); return; }
    this.bootSize += chunk.length;
    if (this.bootSize > 4096) { this.invalidateStartup(); return; }
    this.bootFrame.push(Buffer.from(chunk));
    const bytes = Buffer.concat(this.bootFrame, this.bootSize), boundary = bytes.indexOf(10);
    if (boundary < 0) return;
    try {
      // A startup response cannot contain a premature parser result.
      if (boundary !== bytes.length - 1) throw new Error("Unexpected parser startup bytes");
      const attestation = readParserAttestation(bytes);
      if (attestation.artifactManifestSha256 !== this.config.artifactManifestSha256
        || attestation.sourceSha256 !== this.config.runtime.sourceSha256) throw new Error("Parser runtime bytes changed");
      this.bootAccepted = true;
      this.bootFrame = [];
      this.handshake.resolve();
    } catch { this.invalidateStartup(); }
  }

  private invalidateStartup(): void {
    this.startupInvalid = true;
    this.handshake.reject();
  }

  async sendInput(bytes: Uint8Array): Promise<void> {
    if (!this.bootAccepted || this.startupInvalid || this.ioFailed || this.inputSent || this.closing || !this.attached) throw new Error("Parser input unavailable");
    const header = Buffer.from(JSON.stringify(this.request));
    if (header.length > 1024 || bytes.byteLength !== this.request.byteSize) throw new Error("Invalid parser input frame");
    const prefix = Buffer.alloc(4); prefix.writeUInt32BE(header.length);
    this.inputSent = true;
    await new Promise<void>((resolve, reject) => {
      const stdin = this.attached!.stdin;
      stdin.once("error", reject);
      stdin.write(prefix); stdin.write(header); stdin.end(bytes, () => { stdin.off("error", reject); resolve(); });
    });
  }

  private async finish(): Promise<void> {
    try {
      if (!this.id) throw new Error("Parser target unavailable");
      const value = await this.inspect(this.id), state = value.State as { Running?: unknown; OOMKilled?: unknown; ExitCode?: unknown } | undefined;
      if (!attestedParserMatchesPolicy(value, this.config.runtime, this.name, this.id)
        || state?.Running !== false || typeof state.ExitCode !== "number" || typeof state.OOMKilled !== "boolean") throw new Error("Parser exit proof unavailable");
      this.resolveClosed({ exitCode: this.ioFailed ? null : state.ExitCode, resourceFailure: state.OOMKilled ? "memory_limit" : null });
    } catch { this.resolveClosed({ exitCode: null, resourceFailure: null }); }
  }

  stopAndVerify(): Promise<void> {
    this.stopPromise ??= this.doStopAndVerify();
    return this.stopPromise;
  }

  private async doStopAndVerify(): Promise<void> {
    this.closing = true;
    this.handshake.reject();
    const deadline = performance.now() + 4000;
    // Cancel tracked commands before waiting for an uncertain launch result.
    await this.transport.stopCommandsAndVerify(deadline);
    if (this.launchPromise) await this.launchPromise;
    if (!this.createAttempted) return;
    const listed = (await this.metadata(["container", "ls", "--all", "--no-trunc", "--filter", `name=^/${this.name}$`,
      "--format", "{{.ID}}"], deadline)).trim().split(/\s+/).filter(Boolean);
    if (listed.length > 1 || listed.some(id => !idPattern.test(id))) throw new Error("Parser owner inventory ambiguous");
    if (listed.length === 1) {
      const id = listed[0], value = await this.inspect(id, deadline);
      if (!attestedParserMatchesPolicy(value, this.config.runtime, this.name, id) || this.id !== null && this.id !== id) throw new Error("Parser owner mismatch");
      // A completed create is proved by exact container identity and controls.
      this.id = id; this.createUnknown = false;
      await this.metadata(["container", "rm", "--force", id], deadline);
    } else if (this.createAttempted && this.createUnknown) {
      // No current container does not prove a timed-out create cannot finish.
      throw new Error("Parser create outcome remains unknown");
    }
    const remaining = (await this.metadata(["container", "ls", "--all", "--no-trunc", "--filter",
      `label=mmhr.private-parser.owner=${this.name}`, "--format", "{{.ID}}"], deadline)).trim();
    const named = (await this.metadata(["container", "ls", "--all", "--no-trunc", "--filter", `name=^/${this.name}$`, "--format", "{{.ID}}"], deadline)).trim();
    if (remaining || named) throw new Error("Parser owned container remains");
    await this.transport.stopCommandsAndVerify(deadline);
  }
}
