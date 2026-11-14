import { inspectRuntimeBeforeInput } from "./runtime-attestation";
import { PARSER_READY_PREFIX } from "../workflows/document-parser-attestation";

// This image entry runs no application worker, request router, or provider.
// It emits a document-free readiness frame before the binary stdin request.
async function main(): Promise<void> {
  console.log = console.info = console.warn = console.error = console.debug = () => undefined;
  const attestation = await inspectRuntimeBeforeInput();
  const ready = Buffer.from(PARSER_READY_PREFIX + JSON.stringify(attestation) + "\n");
  await new Promise<void>((resolve, reject) => process.stdout.write(ready, error => error ? reject(error) : resolve()));
  // The unchanged bounded parser entry reads exact framed stdin after readiness.
  await import("./document-parser-entry");
}

void main().catch(() => { process.exitCode = 1; });
