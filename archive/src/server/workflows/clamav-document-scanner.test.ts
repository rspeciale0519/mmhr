import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, test } from "vitest";

import { createClamAvDocumentScanner } from "./clamav-document-scanner";

const cleanBytes = Buffer.from("%PDF-1.7\nSynthetic scanner transport\n%%EOF");
const fixtures: Array<{ server: Server; sockets: Set<Socket> }> = [];
const request = (bytes = cleanBytes) => ({ versionId: randomUUID(), bytes,
  expectedSha256: createHash("sha256").update(bytes).digest("hex") });
function versionInfo(ageHours = 0): string {
  const date = new Date(Date.now() - ageHours * 3_600_000);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
  const time = date.toISOString().slice(11, 19);
  return `ClamAV 1.4.3/27952/${day} ${month} ${date.getUTCDate()} ${time} ${date.getUTCFullYear()}| COMMANDS: PING VERSIONCOMMANDS INSTREAM`;
}
async function daemon(input: { version?: string; afterVersion?: string; reply?: string; silent?: boolean; fragmented?: boolean; early?: boolean } = {}) {
  const sockets = new Set<Socket>();
  const received: Buffer[] = [];
  const commands: string[] = [];
  const stableVersion = input.version ?? versionInfo();
  const server = createServer((socket) => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    let command: string | undefined;
    const chunks: Buffer[] = [];
    function reply(value: string) {
      if (input.fragmented) {
        socket.write(value.slice(0, 5));
        setImmediate(() => socket.end(value.slice(5)));
      } else socket.end(value);
    }
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!command) {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        command = buffer.subarray(0, end).toString("ascii");
        commands.push(command); buffer = buffer.subarray(end + 1);
        if (input.silent) return;
        if (command === "zVERSIONCOMMANDS") { reply((received.length > 0 ? input.afterVersion ?? stableVersion : stableVersion) + "\0"); return; }
        if (input.early) { reply("stream: OK\0"); return; }
      }
      if (command !== "zINSTREAM" || input.silent || input.early) return;
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < length + 4) return;
        if (length === 0) {
          received.push(Buffer.concat(chunks));
          reply(input.reply ?? "stream: OK\0"); return;
        }
        chunks.push(buffer.subarray(4, length + 4));
        buffer = buffer.subarray(length + 4);
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  fixtures.push({ server, sockets });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an owned loopback listener");
  const scanner = createClamAvDocumentScanner({ host: "127.0.0.1", port: address.port,
    allowedEngineVersions: ["1.4.3"], signatureTimeZone: "UTC", timeoutMs: 500 });
  return { scanner, received, commands, port: address.port, server };
}
afterEach(async () => {
  for (const { server, sockets } of fixtures.splice(0)) {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("ClamAV document scanner transport", () => {
  test("streams the exact immutable bytes with protocol framing and bound scan evidence", async () => {
    const fixture = await daemon({ fragmented: true });
    const bytes = Buffer.alloc(180_000, 65);
    const input = request(bytes);
    const scanning = fixture.scanner.scan(input);
    bytes.fill(66);
    const result = await scanning;
    expect(result).toMatchObject({ versionId: input.versionId, sha256: input.expectedSha256,
      state: "clean", failureCode: null, scannerVersion: "1.4.3", signatureVersion: 27952 });
    expect(fixture.commands).toEqual(["zVERSIONCOMMANDS", "zINSTREAM", "zVERSIONCOMMANDS"]);
    expect(createHash("sha256").update(fixture.received[0]!).digest("hex")).toBe(input.expectedSha256);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("quarantines a detected threat without exposing scanner text", async () => {
    const fixture = await daemon({ reply: "stream: Synthetic-Threat FOUND\0" });
    const result = await fixture.scanner.scan(request());
    expect(result).toMatchObject({ state: "quarantined", failureCode: "unsafe_document" });
    expect(JSON.stringify(result)).not.toContain("Synthetic-Threat");
  });

  test("keeps a clean response unsafe when signatures change during the scan", async () => {
    const initial = versionInfo();
    const fixture = await daemon({ version: initial, afterVersion: initial.replace("/27952/", "/27953/") });
    await expect(fixture.scanner.scan(request())).resolves.toMatchObject({ state: "failed", failureCode: "scan_context_changed" });
    expect(fixture.received).toHaveLength(1);
  });

  test("keeps a clean response unsafe when the post-scan provenance is unavailable", async () => {
    const fixture = await daemon({ afterVersion: "UNKNOWN COMMAND" });
    await expect(fixture.scanner.scan(request())).resolves.toMatchObject({ state: "failed", failureCode: "scanner_protocol" });
  });

  test.each([
    ["stream: scan failed ERROR\0"], ["stream: OK"], ["stream: OK\0stream: OK\0"],
    ["stream: OK\n\0"], ["stream: OK\0" + "X".repeat(4_097)], ["UNKNOWN COMMAND\0"],
  ])("keeps malformed and error scan responses unsafe: %s", async (reply) => {
    const fixture = await daemon({ reply });
    await expect(fixture.scanner.scan(request())).resolves.toMatchObject({ state: "failed", failureCode: "scanner_protocol" });
  });

  test.each([
    [versionInfo(25), "signatures_stale"],
    [versionInfo(-1), "signatures_stale"],
    [versionInfo().replace("1.4.3", "9.9.9"), "scanner_version"],
    [versionInfo().replace(" INSTREAM", ""), "scanner_protocol"],
    ["ENGINE VERSION MISMATCH ERROR", "scanner_protocol"],
  ])("requires a permitted engine and current signatures", async (version, failureCode) => {
    const fixture = await daemon({ version });
    await expect(fixture.scanner.scan(request())).resolves.toMatchObject({ state: "failed", failureCode });
    expect(fixture.received).toHaveLength(0);
    expect(fixture.commands).toEqual(["zVERSIONCOMMANDS"]);
  });

  test("does not send bytes when their stored hash differs", async () => {
    const fixture = await daemon();
    await expect(fixture.scanner.scan({ ...request(), expectedSha256: "a".repeat(64) }))
      .resolves.toMatchObject({ state: "failed", failureCode: "hash_mismatch" });
    expect(fixture.commands).toHaveLength(0);
  });

  test("fails closed when the scanner does not finish its response", async () => {
    const fixture = await daemon({ silent: true });
    const scanner = createClamAvDocumentScanner({ host: "127.0.0.1", port: fixture.port,
      allowedEngineVersions: ["1.4.3"], signatureTimeZone: "UTC", timeoutMs: 50 });
    await expect(scanner.scan(request())).resolves.toMatchObject({ state: "failed", failureCode: "scanner_timeout" });
  });

  test("fails closed when its owned scanner service becomes unavailable", async () => {
    const fixture = await daemon();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
    await expect(fixture.scanner.scan(request())).resolves.toMatchObject({ state: "failed", failureCode: "scanner_unavailable" });
  });

  test("does not accept an early clean reply before the full stream is sent", async () => {
    const fixture = await daemon({ early: true });
    await expect(fixture.scanner.scan(request(Buffer.alloc(20_000_000, 65)))).resolves.toMatchObject({ state: "failed" });
    expect(fixture.received).toHaveLength(0);
  });

  test("rejects remote scanner addresses and malformed requests before connecting", async () => {
    expect(() => createClamAvDocumentScanner({ host: "192.0.2.1" as never, port: 3310,
      allowedEngineVersions: ["1.4.3"], signatureTimeZone: "UTC" })).toThrow("Invalid document scanner configuration");
    const fixture = await daemon();
    await expect(fixture.scanner.scan({ ...request(), bytes: Buffer.alloc(0) })).rejects.toThrow("Invalid document scan request");
    expect(fixture.commands).toHaveLength(0);
  });
});
