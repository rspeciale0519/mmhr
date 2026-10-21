import { createHash } from "node:crypto";

// Test-only PDF revision2 fixture. This obsolete MD5/RC4 scheme is not used by
// application authentication, secret storage, encryption, or the parser.
// Installed PDF.js6.3.289 CipherTransformFactory is the primary reference.
const padding = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");
const md5 = (input: Buffer) => createHash("md5").update(input).digest();
function pad(input: string): Buffer {
  const bytes = Buffer.from(input, "ascii").subarray(0, 32);
  return Buffer.concat([bytes, padding.subarray(0, 32 - bytes.length)]);
}
function rc4(key: Buffer, input: Buffer): Buffer {
  const state = Uint8Array.from({ length: 256 }, (_, index) => index);
  let index = 0, swap = 0;
  for (let position = 0; position < 256; position++) {
    swap = (swap + state[position]! + key[position % key.length]!) & 255;
    [state[position], state[swap]] = [state[swap]!, state[position]!];
  }
  const result = Buffer.alloc(input.length); swap = 0;
  for (let position = 0; position < input.length; position++) {
    index = (index + 1) & 255; swap = (swap + state[index]!) & 255;
    [state[index], state[swap]] = [state[swap]!, state[index]!];
    result[position] = input[position]! ^ state[(state[index]! + state[swap]!) & 255]!;
  }
  return result;
}
export function syntheticEncryptedPdf() {
  const validationPassword = "synthetic-fixture-only", user = pad(validationPassword);
  const owner = rc4(md5(pad("synthetic-owner-only")).subarray(0, 5), user);
  const permissions = Buffer.alloc(4); permissions.writeInt32LE(-4);
  const id = createHash("sha256").update("synthetic-encrypted-PDF-fixture-v1").digest().subarray(0, 16);
  const key = md5(Buffer.concat([user, owner, permissions, id])).subarray(0, 5);
  const userValue = rc4(key, padding);
  const suffix = Buffer.from([4, 0, 0, 0, 0]);
  const stream = rc4(md5(Buffer.concat([key, suffix])).subarray(0, 10), Buffer.from("BT /F1 12 Tf 72 720 Td (Synthetic encrypted text) Tj ET\n"));
  const bodies = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Count 1 /Kids [5 0 R] >>"), Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from("\nendstream")]),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>"),
    Buffer.from(`<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString("hex")}> /U <${userValue.toString("hex")}> /P -4 >>`)];
  const chunks = [Buffer.from("%PDF-1.7\n")], offsets = [0]; let length = chunks[0]!.length;
  bodies.forEach((body, index) => { offsets.push(length); const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]); chunks.push(object); length += object.length; });
  chunks.push(Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<${id.toString("hex")}> <${id.toString("hex")}>] >>\nstartxref\n${length}\n%%EOF\n`));
  return { bytes: Buffer.concat(chunks), validationPassword };
}
