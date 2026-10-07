import "server-only";

import { Socket } from "node:net";
import { ORIGINAL_VERIFICATION_CLOSE_MS, ORIGINAL_VERIFICATION_QUERY_MS, OriginalVerificationExecutionError } from "./original-verification-execution";

/** Construct this only after the existing owned fixture address map accepts the same port. */
export function createOriginalVerifierSockets(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3000, 5432, 57022].includes(port)) {
    throw new OriginalVerificationExecutionError("INVALID_INPUT");
  }
  let closed = false;
  let closedCount = 0;
  const sockets = new Map<Socket, Promise<void>>();
  return Object.freeze({
    async create(): Promise<Socket> {
      if (closed) throw new OriginalVerificationExecutionError("CLOSED");
      if (sockets.size !== 0) throw new OriginalVerificationExecutionError("BUSY");
      const socket = new Socket({ allowHalfOpen: false });
      sockets.set(socket, new Promise<void>((resolve) => socket.once("close", () => {
        sockets.delete(socket); closedCount++; resolve();
      })));
      // Keep a non-logging listener during driver handoff. No transport error escapes as private text.
      socket.on("error", () => undefined);
      return new Promise<Socket>((resolve, reject) => {
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true; clearTimeout(timer);
          socket.removeListener("connect", connected); socket.removeListener("error", failed); socket.removeListener("close", failed);
          if (ok && !closed) resolve(socket);
          else { socket.destroy(); reject(new OriginalVerificationExecutionError("UNAVAILABLE")); }
        };
        const connected = () => finish(true), failed = () => finish(false);
        const timer = setTimeout(failed, ORIGINAL_VERIFICATION_QUERY_MS);
        socket.once("connect", connected); socket.once("error", failed); socket.once("close", failed);
        // The installed custom-socket API expects a connected socket when its Promise resolves.
        try { socket.connect({ host: "127.0.0.1", port, family: 4 }); }
        catch { finish(false); }
      });
    },
    async close() {
      closed = true;
      const closing = [...sockets.entries()];
      for (const [socket] of closing) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new OriginalVerificationExecutionError("CLEANUP_FAILED")), ORIGINAL_VERIFICATION_CLOSE_MS);
        Promise.all(closing.map(([, observedClose]) => observedClose)).then(() => { clearTimeout(timer); resolve(); }, () => {
          clearTimeout(timer); reject(new OriginalVerificationExecutionError("CLEANUP_FAILED"));
        });
      });
    },
    status: () => Object.freeze({ closed, tracked: sockets.size, observedCloseCount: closedCount }),
  });
}
