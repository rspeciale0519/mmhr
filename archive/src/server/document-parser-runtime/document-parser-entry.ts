import { DOCUMENT_PROCESSING_PROFILE, documentParserRequestSchema } from "../workflows/document-parser-wire-contract";

// Standalone child only. The reviewed image must compile this entry to ESM and
// bind exact package/runtime/source bytes. No application imports this entry.
// The trusted backend writes uint32BE JSON-header length, bounded request JSON,
// then exactly byteSize immutable bytes and EOF. Output is one bounded JSON.
async function main() {
  console.log = console.info = console.warn = console.error = console.debug = () => undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    if (!(chunk instanceof Uint8Array)) throw new Error("Invalid parser frame");
    size += chunk.byteLength;
    if (size > DOCUMENT_PROCESSING_PROFILE.maxInputBytes + 1_028) throw new Error("Invalid parser frame");
    chunks.push(Buffer.from(chunk));
  }
  const frame = Buffer.concat(chunks, size);
  if (frame.length < 5) throw new Error("Invalid parser frame");
  const headerSize = frame.readUInt32BE(0);
  if (headerSize < 1 || headerSize > 1_024 || frame.length < 4 + headerSize) throw new Error("Invalid parser frame");
  const request = documentParserRequestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(frame.subarray(4, 4 + headerSize))));
  if (frame.length !== 4 + headerSize + request.byteSize) throw new Error("Invalid parser frame");
  const { parsePrivateDocument } = await import("./parser-kernel");
  const result = await parsePrivateDocument(request, frame.subarray(4 + headerSize));
  const output = Buffer.from(JSON.stringify(result));
  if (output.length > DOCUMENT_PROCESSING_PROFILE.maxOutputBytes) throw new Error("Invalid parser output");
  await new Promise<void>((resolve, reject) => process.stdout.write(output, error => error ? reject(error) : resolve()));
}

void main().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
