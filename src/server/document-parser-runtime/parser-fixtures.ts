import { deflateSync } from "node:zlib";
import { crc32 } from "./container-checks";

export function syntheticPdf(text = "Private synthetic text", pageCount = 1, action: "none" | "destination" | "named" | "javascript" = "none"): Buffer {
  if (!/^[A-Za-z0-9 .,!?-]*$/.test(text) || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 501) throw new Error("Invalid fixture input");
  const pageIds = Array.from({ length: pageCount }, (_, index) => index + 5);
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET\n`;
  const openAction = action === "destination" ? "/OpenAction [5 0 R /Fit]" : action === "named" ? "/OpenAction << /S /Named /N /Print >>" : action === "javascript" ? "/OpenAction << /S /JavaScript /JS (app.alert) >>" : "";
  const objects = [`<< /Type /Catalog /Pages 2 0 R ${openAction} >>`,
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    ...pageIds.map(() => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>")];
  let output = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  output += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

export function syntheticZip(parts: ReadonlyArray<readonly [string, string]>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, text] of parts) {
    const file = Buffer.from(text), nameBytes = Buffer.from(name), crc = crc32(file);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(file.length, 18); header.writeUInt32LE(file.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    locals.push(header, nameBytes, file);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(file.length, 20); directory.writeUInt32LE(file.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt32LE(offset, 42); central.push(directory, nameBytes);
    offset += header.length + nameBytes.length + file.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export function syntheticDocx(text = "Private synthetic text", relationship = "", hyperlink = false): Buffer {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const paragraph = hyperlink ? `<w:hyperlink r:id="rId2"><w:r><w:t>${escaped}</w:t></w:r></w:hyperlink>` : `<w:r><w:t>${escaped}</w:t></w:r>`;
  const parts: Array<[string, string]> = [
    ["[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ["_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ["word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p>${paragraph}</w:p><w:sectPr/></w:body></w:document>`],
  ];
  if (relationship) parts.push(["word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship}</Relationships>`]);
  return syntheticZip(parts);
}
export function pngChunk(type: string, body: Buffer): Buffer {
  const chunk = Buffer.alloc(body.length + 12); chunk.writeUInt32BE(body.length); chunk.write(type, 4, 4, "ascii"); body.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4); return chunk;
}
export function syntheticPng(width = 1, height = 1): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  // Only the valid small case has matching pixels. Oversized headers test the
  // deterministic pre-decode limit; they do not claim valid oversized images.
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))), pngChunk("IEND", Buffer.alloc(0))]);
}


