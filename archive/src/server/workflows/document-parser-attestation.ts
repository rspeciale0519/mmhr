import { z } from "zod";

export const parserAttestationSchema = z.strictObject({
  protocol: z.literal(1), nodeVersion: z.literal("24.20.0"),
  packages: z.strictObject({ "pdfjs-dist": z.literal("6.3.289"), mammoth: z.literal("1.13.0"), sharp: z.literal("0.35.5") }),
  artifactManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  cgroupVersion: z.literal(2), memoryBytes: z.literal(536870912), swapBytes: z.literal(0),
  maxProcesses: z.literal(8), cpuCount: z.literal(1), uid: z.literal(65532), gid: z.literal(65532),
  effectiveCapabilities: z.literal("0000000000000000"), noNewPrivileges: z.literal(true),
  seccompFilter: z.literal(true), externalInterfaces: z.literal(0), rootReadonly: z.literal(true),
});
export type ParserAttestation = z.output<typeof parserAttestationSchema>;
export const PARSER_READY_PREFIX = "MMHR-PRIVATE-PARSER-READY/1 ";

/** This document-free handshake must precede the original binary request.
 * The backend consumes it. It is never part of the persisted parser result. */
export function readParserAttestation(frame: Uint8Array): ParserAttestation {
  if (frame.byteLength > 4096) throw new Error("Parser attestation limit");
  const line = new TextDecoder("utf-8", { fatal: true }).decode(frame);
  if (!line.startsWith(PARSER_READY_PREFIX) || !line.endsWith("\n")) throw new Error("Invalid parser attestation");
  return parserAttestationSchema.parse(JSON.parse(line.slice(PARSER_READY_PREFIX.length, -1)));
}
