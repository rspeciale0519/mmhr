import { randomInt } from "node:crypto";
import { createServer } from "node:net";

/** Avoid the measured Windows dynamic-client range (49152–65535). */
export async function getFreeScratchPort(platform: NodeJS.Platform = process.platform): Promise<number> {
  for (let attempt = 0; attempt < 64; attempt++) {
    const requested = platform === "win32" ? randomInt(20_000, 48_000) : 0;
    try {
      return await new Promise<number>((resolve, reject) => {
        const server = createServer(); server.unref(); server.once("error", reject);
        server.listen(requested, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            server.close(); reject(new Error("Could not allocate a local scratch port")); return;
          }
          server.close(error => error ? reject(error) : resolve(address.port));
        });
      });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error)
        || !["EADDRINUSE", "EACCES"].includes(String(error.code))) throw error;
    }
  }
  throw new Error("Could not allocate a local scratch port after 64 attempts");
}
