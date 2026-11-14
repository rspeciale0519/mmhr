/** Harmless standard antivirus test content inside an in-memory Word package. */
export function syntheticAntivirusDocument(): Buffer {
  if (process.env.NODE_ENV !== "test") throw new Error("Synthetic antivirus document is test-only");
  const entries = [
    ["[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="txt" ContentType="text/plain"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ["_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ["word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic antivirus rehearsal</w:t></w:r></w:p></w:body></w:document>'],
    ["word/test.txt", ["X5O!P%@AP[4\\PZX54(P^)7CC)7}", "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("")],
  ] as const;
  const locals: Buffer[] = [], directories: Buffer[] = [];
  let position = 0;
  for (const [name, text] of entries) {
    const encoded = Buffer.from(name), content = Buffer.from(text);
    let checksum = 0xffffffff;
    for (const byte of content) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
    }
    checksum = (checksum ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30), directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(encoded.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(content.length, 20); directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(encoded.length, 28); directory.writeUInt32LE(position, 42);
    locals.push(local, encoded, content); directories.push(directory, encoded);
    position += local.length + encoded.length + content.length;
  }
  const directory = Buffer.concat(directories), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(position, 16);
  return Buffer.concat([...locals, directory, end]);
}
