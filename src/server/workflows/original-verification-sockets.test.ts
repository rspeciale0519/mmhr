import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createOriginalVerifierSockets } from "./original-verification-sockets";

const ownedServers: Server[] = [], accepted = new Set<Socket>();
afterEach(async () => {
  for (const socket of accepted) socket.destroy();
  await Promise.all(ownedServers.map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  accepted.clear(); ownedServers.length = 0;
});
async function localServer() {
  const server = createServer((socket) => { accepted.add(socket); socket.once("close", () => accepted.delete(socket)); });
  ownedServers.push(server);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Owned TCP test address missing");
  return address.port;
}
describe("original verifier actual local socket resources, no PostgreSQL", () => {
  test("returns a connected socket, then observes its close event", async () => {
    const pool = createOriginalVerifierSockets(await localServer());
    const socket = await pool.create();
    expect(socket.connecting).toBe(false); expect(socket.remoteAddress).toBe("127.0.0.1"); expect(pool.status().tracked).toBe(1);
    try { await pool.close(); expect(socket.destroyed).toBe(true);
      expect(pool.status()).toEqual({ closed: true, tracked: 0, observedCloseCount: 1 });
      await expect(pool.create()).rejects.toMatchObject({ code: "CLOSED" });
    } finally { await pool.close(); }
  });
  test("limits sockets to one and leaves another owned transport open", async () => {
    const first = createOriginalVerifierSockets(await localServer()), second = createOriginalVerifierSockets(await localServer());
    try {
      await first.create(); const untouched = await second.create();
      await expect(first.create()).rejects.toMatchObject({ code: "BUSY" });
      await first.close(); expect(untouched.destroyed).toBe(false); expect(second.status().tracked).toBe(1);
    } finally { await Promise.all([first.close(), second.close()]); }
  });
  test.each([0, 3000, 5432, 57022, 65536, 1000.5, NaN])("rejects unsupported port %s before construction", (port) => {
    expect(() => createOriginalVerifierSockets(port)).toThrow("Original verification SQL operation failed");
  });
});
