import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod } from "node:fs/promises";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

import {
  createDockerGuardPolicy, DockerGuardDenied,
} from "./security-command-api-docker-policy";
import type { ScratchNetwork } from "./security-command-api-isolation";

const authHeader = "x-mmhr-scratch-guard";
const maxBodyBytes = 4 * 1024 * 1024;
// Docker's container wait endpoint can remain open while Supabase completes
// helper initialization. Keep the proxy bounded, but longer than startup.
const upstreamTimeoutMs = 600_000;
const safeError = (response: ServerResponse, status: number) => {
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { "content-type": "application/json", connection: "close" });
  response.end(JSON.stringify({ message: "Scratch Docker request could not be completed" }));
};

async function readBody(message: IncomingMessage) {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > maxBodyBytes) throw new DockerGuardDenied("body_limit");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/** A per-run authenticated IPC gate. It never opens a Docker TCP endpoint. */
export async function startScratchDockerGuard(options: {
  network: ScratchNetwork;
  scratchRoot: string;
  ports: Readonly<{ all: readonly number[] }>;
  dockerEndpoint: string;
  requestImplementation?: typeof request;
}) {
  let upstreamSocket: string;
  const windowsEndpoint = options.dockerEndpoint.match(/^npipe:\/\/\/\/\.\/pipe\/(docker_engine|dockerDesktopLinuxEngine)$/);
  if (windowsEndpoint) upstreamSocket = `\\\\.\\pipe\\${windowsEndpoint[1]}`;
  else if (options.dockerEndpoint.startsWith("unix:///")) upstreamSocket = options.dockerEndpoint.slice("unix://".length);
  else throw new Error("Scratch Docker guard requires the checked local daemon socket");

  const suffix = randomBytes(24).toString("hex");
  const pipeName = `mmhr-r1-docker-${suffix}`;
  const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\${pipeName}` : path.join(options.scratchRoot, `${pipeName}.sock`);
  const dockerHost = process.platform === "win32" ? `npipe:////./pipe/${pipeName}` : `unix://${socketPath}`;
  const credential = randomBytes(32).toString("hex");
  const send = options.requestImplementation ?? request;
  const policy = createDockerGuardPolicy(options);
  let writesEnabled = false;
  let scopedReads = 0;
  let deniedRequests = 0;
  let lastDenial: string | null = null;
  const denialCodes = new Set<string>();
  let closed = false;

  function denied(code: string) {
    deniedRequests++;
    lastDenial = code;
    if (denialCodes.size < 8) denialCodes.add(code);
  }

  function authenticated(incoming: IncomingMessage) {
    const provided = incoming.headers[authHeader];
    return typeof provided === "string" && Buffer.byteLength(provided) === Buffer.byteLength(credential) &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(credential));
  }

  async function forward(incoming: IncomingMessage, outgoing: ServerResponse) {
    if (!authenticated(incoming)) { denied("authentication"); safeError(outgoing, 403); return; }
    try {
      const method = incoming.method ?? "GET";
      if (!writesEnabled && method !== "GET" && method !== "HEAD") throw new DockerGuardDenied("preflight_write");
      const body = await readBody(incoming);
      const target = incoming.url ?? "/";
      const decision = policy.evaluate({ method, target, body });
      await new Promise<void>((resolve) => {
        const upstream = send({
          socketPath: upstreamSocket, path: target, method, agent: false,
          headers: {
            host: "docker", connection: "keep-alive", "content-length": decision.body.length,
            "content-type": incoming.headers["content-type"] ?? "application/json",
            "user-agent": incoming.headers["user-agent"] ?? "MMHR scratch guard",
          },
        }, (response) => {
          // The policy already validates every container reference and project
          // filter before forwarding. Count approved container reads even when
          // the CLI URL encodes the project label or uses an API version prefix.
          if (method === "GET" && target.includes("/containers/") &&
            [200, 404].includes(response.statusCode ?? 0)) scopedReads++;
          void (async () => {
            try {
              if (decision.captureCreatedContainer) {
                const bytes = await readBody(response);
                if (response.statusCode === 201) policy.registerContainer(bytes);
                outgoing.writeHead(response.statusCode ?? 502, response.headers);
                outgoing.end(bytes);
                resolve();
                return;
              }
              outgoing.writeHead(response.statusCode ?? 502, response.headers);
              // Docker's wait endpoint sends headers before its body. The Go
              // client must receive them before it starts the watched container.
              outgoing.flushHeaders();
              response.once("error", () => { safeError(outgoing, 502); resolve(); });
              response.once("end", resolve);
              response.pipe(outgoing);
            } catch (error) {
              denied(error instanceof DockerGuardDenied ? error.code : "upstream_response");
              safeError(outgoing, 502);
              resolve();
            }
          })();
        });
        upstream.setTimeout(upstreamTimeoutMs, () => upstream.destroy());
        upstream.once("error", () => { safeError(outgoing, 502); resolve(); });
        outgoing.once("close", () => { upstream.destroy(); resolve(); });
        upstream.end(decision.body);
      });
    } catch (error) {
      denied(error instanceof DockerGuardDenied ? error.code : "invalid_request");
      safeError(outgoing, 403);
    }
  }

  const server = createServer((incoming, outgoing) => { void forward(incoming, outgoing); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  // The startup contract uses normal HTTP responses. Do not proxy arbitrary tunnels.
  server.on("upgrade", (incoming, socket, head) => {
    if (!authenticated(incoming)) { denied("authentication"); socket.destroy(); return; }
    if (!writesEnabled) { denied("preflight_write"); socket.destroy(); return; }
    const target = incoming.url ?? "/";
    try {
      // Validate the same narrow attach route as normal Docker requests.
      policy.evaluate({ method: incoming.method ?? "GET", target, body: Buffer.alloc(0) });
    } catch (error) {
      denied(error instanceof DockerGuardDenied ? error.code : "invalid_upgrade");
      socket.destroy();
      return;
    }
    const upstream = send({
      socketPath: upstreamSocket, path: target, method: incoming.method ?? "POST", agent: false,
      headers: {
        host: "docker", connection: "Upgrade",
        upgrade: incoming.headers.upgrade ?? "tcp",
        "content-length": "0", "user-agent": incoming.headers["user-agent"] ?? "MMHR scratch guard",
      },
    }, (response) => {
      // Docker attach must negotiate an upgrade. A normal response is not a
      // usable tunnel, so close it without forwarding provider diagnostics.
      response.resume();
      socket.destroy();
    });
    upstream.once("upgrade", (response, upstreamSocket, upstreamHead) => {
      const lines = [`HTTP/1.1 ${response.statusCode ?? 101} ${response.statusMessage ?? "Switching Protocols"}`];
      for (const [key, value] of Object.entries(response.headers)) {
        if (value === undefined) continue;
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) lines.push(`${key}: ${item}`);
      }
      lines.push("", "");
      socket.write(lines.join("\r\n"));
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) socket.write(upstreamHead);
      socket.pipe(upstreamSocket);
      upstreamSocket.pipe(socket);
      socket.once("close", () => upstreamSocket.destroy());
      upstreamSocket.once("close", () => socket.destroy());
    });
    upstream.once("error", () => socket.destroy());
    socket.once("error", () => upstream.destroy());
    upstream.end();
  });
  server.on("connect", (_request, socket) => { denied("connect"); socket.destroy(); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => { server.off("error", reject); resolve(); });
  });
  server.unref();
  try {
    if (process.platform !== "win32") await chmod(socketPath, 0o600);
  } catch {
    server.closeAllConnections();
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
    throw new Error("Scratch Docker socket permissions could not be restricted");
  }

  return {
    // Only the child process receives these values. Never print or persist them.
    environment: { DOCKER_HOST: dockerHost, DOCKER_CONTEXT: undefined, DOCKER_CUSTOM_HEADERS: `${authHeader}=${credential}` },
    enableWritesAfterRoutingProbe() {
      if (!scopedReads || deniedRequests) throw new Error(`Scratch Docker routing probe failed (${lastDenial ?? "no_scoped_read"})`);
      writesEnabled = true;
    },
    counts() { return { ...policy.counts(), scopedReads, deniedRequests, lastDenial, denialCodes: [...denialCodes] }; },
    async close() {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(new Error("Scratch Docker pipe did not close")) : resolve()); });
    },
  };
}
