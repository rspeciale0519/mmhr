import "server-only";

import { createHash } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { z } from "zod";

import { MAX_DOCUMENT_SIZE_BYTES } from "@/server/workflows/document-safety";
import type { DocumentScanner, DocumentScanRequest, DocumentScanResult } from "@/server/workflows/document-scanner";

const optionsSchema = z.strictObject({
  host: z.enum(["127.0.0.1", "::1"]),
  port: z.number().int().min(1).max(65_535),
  allowedEngineVersions: z.array(z.string().regex(/^\d+\.\d+\.\d+$/)).min(1).max(20),
  // clamd must run with TZ=UTC. Its VERSION date has no zone information.
  signatureTimeZone: z.literal("UTC"),
  timeoutMs: z.number().int().min(50).max(60_000).default(30_000),
  maximumSignatureAgeHours: z.number().int().min(1).max(48).default(24),
});
const requestSchema = z.strictObject({
  versionId: z.uuid().transform((value) => value.toLowerCase()),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase()),
  bytes: z.instanceof(Uint8Array).refine((value) => value.byteLength > 0 && value.byteLength <= MAX_DOCUMENT_SIZE_BYTES),
});
type Options = z.output<typeof optionsSchema>;
type FailureCode = NonNullable<DocumentScanResult["failureCode"]>;

class ScanFailure extends Error {
  constructor(readonly code: FailureCode) { super("Document scan did not complete"); }
}

async function write(socket: Socket, bytes: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(bytes, (error) => error ? reject(error) : resolve());
  });
}

/** Only loopback is supported because clamd TCP has no authentication or TLS. */
async function exchange(options: Options, command: "VERSIONCOMMANDS" | "INSTREAM", bytes?: Uint8Array): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: options.host, port: options.port });
    let chunks: Buffer[] = [];
    let total = 0;
    let finished = false;
    let sent = false;
    const timer = setTimeout(() => finish(new ScanFailure("scanner_timeout")), options.timeoutMs);
    function finish(error?: ScanFailure, value?: string) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(value!);
    }
    socket.on("error", () => finish(new ScanFailure("scanner_unavailable")));
    socket.on("close", () => {
      if (finished) return;
      const response = Buffer.concat(chunks);
      if (!sent || response.length < 1 || response.at(-1) !== 0 || response.subarray(0, -1).includes(0)
        || response.subarray(0, -1).some((byte) => byte > 126 || byte < 32)) {
        finish(new ScanFailure("scanner_protocol")); return;
      }
      finish(undefined, response.subarray(0, -1).toString("ascii"));
    });
    socket.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > 4_096) { chunks = []; finish(new ScanFailure("scanner_protocol")); return; }
      chunks.push(chunk);
    });
    socket.once("connect", () => {
      void (async () => {
        await write(socket, Buffer.from(`z${command}\0`));
        if (bytes) {
          for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1_024) {
            if (finished) return;
            const chunk = bytes.subarray(offset, offset + 64 * 1_024);
            const length = Buffer.alloc(4); length.writeUInt32BE(chunk.byteLength);
            await write(socket, length); await write(socket, chunk);
          }
          await write(socket, Buffer.alloc(4));
        }
        sent = true;
      })().catch(() => finish(new ScanFailure("scanner_unavailable")));
    });
  });
}

function scannerInfo(response: string, options: Options) {
  const matched = /^ClamAV (\d+\.\d+\.\d+)\/(\d+)\/([A-Za-z]{3}) ([A-Za-z]{3})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})\| COMMANDS: (.+)$/.exec(response);
  if (!matched || !matched[10]!.split(/\s+/).includes("INSTREAM")) throw new ScanFailure("scanner_protocol");
  if (!options.allowedEngineVersions.includes(matched[1]!)) throw new ScanFailure("scanner_version");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(matched[4]!);
  const parts = [Number(matched[9]), month, Number(matched[5]), Number(matched[6]), Number(matched[7]), Number(matched[8])];
  const date = new Date(Date.UTC(parts[0]!, month, parts[2]!, parts[3]!, parts[4]!, parts[5]!));
  if (month < 0 || date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== month
    || date.getUTCDate() !== parts[2] || date.getUTCHours() !== parts[3]
    || date.getUTCMinutes() !== parts[4] || date.getUTCSeconds() !== parts[5]
    || ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()] !== matched[3]) {
    throw new ScanFailure("scanner_protocol");
  }
  const age = Date.now() - date.getTime();
  if (age < -5 * 60_000 || age > options.maximumSignatureAgeHours * 3_600_000) throw new ScanFailure("signatures_stale");
  const signatureVersion = Number(matched[2]);
  if (!Number.isSafeInteger(signatureVersion) || signatureVersion < 1) throw new ScanFailure("scanner_protocol");
  return { scannerVersion: matched[1]!, signatureVersion, signatureUpdatedAt: date.toISOString() };
}

export function createClamAvDocumentScanner(input: z.input<typeof optionsSchema>): DocumentScanner {
  const validated = optionsSchema.safeParse(input);
  if (!validated.success) throw new Error("Invalid document scanner configuration");
  const options = validated.data;
  return Object.freeze({
    async scan(input: DocumentScanRequest): Promise<DocumentScanResult> {
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) throw new Error("Invalid document scan request");
      const request = parsed.data;
      const snapshot = Buffer.from(request.bytes);
      const sha256 = createHash("sha256").update(snapshot).digest("hex");
      let info = { scannerVersion: null, signatureVersion: null, signatureUpdatedAt: null } as Pick<DocumentScanResult,
        "scannerVersion" | "signatureVersion" | "signatureUpdatedAt">;
      const result = (state: DocumentScanResult["state"], failureCode: DocumentScanResult["failureCode"]): DocumentScanResult =>
        Object.freeze({ versionId: request.versionId, sha256, state, scanner: "clamav", ...info,
          scannedAt: new Date().toISOString(), failureCode });
      if (sha256 !== request.expectedSha256) return result("failed", "hash_mismatch");
      try {
        info = scannerInfo(await exchange(options, "VERSIONCOMMANDS"), options);
        const response = await exchange(options, "INSTREAM", snapshot);
        if (/^stream: [A-Za-z0-9_.(): -]{1,255} FOUND$/.test(response)) return result("quarantined", "unsafe_document");
        if (response === "stream: OK") {
          // A reload between separate protocol requests must not give a clean
          // receipt the signature provenance from a different database.
          const after = scannerInfo(await exchange(options, "VERSIONCOMMANDS"), options);
          if (after.scannerVersion !== info.scannerVersion || after.signatureVersion !== info.signatureVersion
            || after.signatureUpdatedAt !== info.signatureUpdatedAt) return result("failed", "scan_context_changed");
          return result("clean", null);
        }
        return result("failed", "scanner_protocol");
      } catch (error) {
        return result("failed", error instanceof ScanFailure ? error.code : "scanner_unavailable");
      }
    },
  });
}
