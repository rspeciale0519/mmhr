import "server-only";
import { createHash } from "node:crypto";

import { DOCUMENT_PROCESSING_PROFILE, documentParserRequestSchema, documentParserResultSchema,
  parserResultMatchesRequest, type DocumentParserRequest, type DocumentParserSupervisorResult } from "./document-processing-contract";

export type ParserSandboxClose = Readonly<{
  exitCode: number | null;
  resourceFailure: "memory_limit" | null;
}>;

export interface ParserSandboxSession {
  // Allocation is already tracked before this method can create host resources.
  // Return ready only after exact runtime/policy inspection succeeds.
  // Cancellation must forbid later creation and wait for any in-flight create.
  launch(signal: AbortSignal): Promise<Readonly<{ outcome: "ready" }> | Readonly<{ outcome: "failed"; code: "isolation_unavailable" | "worker_crash" }>>;
  sendInput(bytes: Uint8Array): Promise<void>;
  closed: Promise<ParserSandboxClose>;
  // Resolve only after the host proves this owned process/container is absent.
  // This must kill the whole owned process tree, not only the Node parent.
  stopAndVerify(): Promise<void>;
}

/** Trusted host adapter; it must enforce the complete fixed profile before
 * launch. An application request cannot provide this adapter or its policy.
 * No backend is implemented by this draft. Ordinary child_process or Node
 * permissions alone do not satisfy this interface's security contract. */
export interface DocumentParserSandbox {
  // Pure local handle allocation. This method cannot create a child, container,
  // file, mount, network, or any other host resource before it returns a handle.
  allocate(request: DocumentParserRequest, onStdout: (chunk: Uint8Array) => void): ParserSandboxSession;
}

export class ParserIsolationUnavailableError extends Error {
  constructor() { super("Document parser isolation is unavailable"); this.name = "ParserIsolationUnavailableError"; }
}

const CLEANUP_GRACE_MS = 5_000;
type WorkOutcome = { type: "closed"; close: ParserSandboxClose }
  | { type: "failure"; code: "worker_crash" | "output_limit" | "parser_timeout" | "isolation_unavailable" };

/** Returns only bounded plain data. No raw stderr, parser exception, or child
 * diagnostic can cross this boundary. The caller must still verify its live
 * database lease after parsing and at the atomic artifact commit. */
export async function superviseDocumentParser(rawRequest: unknown, input: Uint8Array,
  sandbox: DocumentParserSandbox): Promise<DocumentParserSupervisorResult> {
  const parsed = documentParserRequestSchema.safeParse(rawRequest);
  if (!parsed.success || !(input instanceof Uint8Array) || input.byteLength !== parsed.data.byteSize) {
    return { outcome: "failed", code: "invalid_input" };
  }
  const request = Object.freeze(parsed.data);
  const cancellation = new AbortController();
  const bytes = Buffer.from(input);
  if (createHash("sha256").update(bytes).digest("hex") !== request.sha256) return { outcome: "failed", code: "document_integrity" };
  const output: Buffer[] = [];
  let outputLength = 0;
  let acceptingOutput = true;
  let outputExceeded = false;
  let fail: (outcome: WorkOutcome) => void = () => undefined;
  const failure = new Promise<WorkOutcome>(resolve => { fail = resolve; });
  let session: ParserSandboxSession;
  try {
    session = sandbox.allocate(request, chunk => {
      if (!acceptingOutput) return;
      if (!(chunk instanceof Uint8Array) || chunk.byteLength > DOCUMENT_PROCESSING_PROFILE.maxOutputBytes - outputLength) {
        outputExceeded = true;
        acceptingOutput = false;
        fail({ type: "failure", code: "output_limit" });
        return;
      }
      outputLength += chunk.byteLength;
      output.push(Buffer.from(chunk));
    });
  } catch (error) {
    return { outcome: "failed", code: error instanceof ParserIsolationUnavailableError ? "isolation_unavailable" : "worker_crash" };
  }
  const timer = setTimeout(() => fail({ type: "failure", code: "parser_timeout" }), DOCUMENT_PROCESSING_PROFILE.maxWallTimeMs);
  const closed: Promise<WorkOutcome> = session.closed.then(close => ({ type: "closed", close }),
    () => ({ type: "failure", code: "worker_crash" }));
  const sending = Promise.resolve().then(async () => {
    const launch = await session.launch(cancellation.signal);
    if (launch.outcome === "failed") { fail({ type: "failure", code: launch.code }); return; }
    if (cancellation.signal.aborted || !acceptingOutput) return;
    await session.sendInput(bytes);
  }).catch(() => {
    fail({ type: "failure", code: "worker_crash" });
  });
  let outcome: WorkOutcome;
  try { outcome = await Promise.race([closed, failure]); }
  finally { clearTimeout(timer); acceptingOutput = false; cancellation.abort(); }

  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      session.stopAndVerify(),
      new Promise<never>((_, reject) => {
        cleanupTimer = setTimeout(() => reject(new Error("Parser cleanup unavailable")), CLEANUP_GRACE_MS);
      }),
    ]);
  } catch { return { outcome: "failed", code: "cleanup_unverified" }; }
  finally { if (cleanupTimer) clearTimeout(cleanupTimer); }
  // A backend must settle input delivery when its owned process is removed.
  // Do not await a broken delivery promise after verified cleanup.
  void sending;
  if (outputExceeded) return { outcome: "failed", code: "output_limit" };
  if (outcome.type === "failure") return { outcome: "failed", code: outcome.code };
  if (outcome.close.resourceFailure === "memory_limit") return { outcome: "failed", code: "memory_limit" };
  if (outcome.close.exitCode !== 0) return { outcome: "failed", code: "worker_crash" };
  let rawResult: unknown;
  try {
    const frame = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(output, outputLength));
    rawResult = JSON.parse(frame);
  } catch { return { outcome: "failed", code: "invalid_result" }; }
  const result = documentParserResultSchema.safeParse(rawResult);
  if (!result.success || !parserResultMatchesRequest(result.data, request)) return { outcome: "failed", code: "invalid_result" };
  return Object.freeze({ outcome: "completed", result: Object.freeze(result.data) });
}
