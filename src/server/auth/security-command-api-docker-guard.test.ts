// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";

import { describe, expect, test } from "vitest";

import { startScratchDockerGuard } from "./security-command-api-docker-guard";

const projectId = "mmhr-r1-commandapi-01234567";
const name = `supabase_db_${projectId}`;
const containerId = "b".repeat(64);
const network = { id: "a".repeat(64), name: `${projectId}-loopback`, projectId };
const headerName = "x-mmhr-scratch-guard";
type Guard = Awaited<ReturnType<typeof startScratchDockerGuard>>;
type RecordedRequest = { method: string; target: string; body: string; hasGuardHeader: boolean };

function simulatedDocker(reply?: { status?: number; error?: boolean }) {
  const recorded: RecordedRequest[] = [];
  const send = ((options: RequestOptions, receive: (response: IncomingMessage) => void) => {
    const stream = new PassThrough({ autoDestroy: false });
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.once("finish", () => {
      recorded.push({
        method: options.method ?? "GET", target: options.path ?? "/",
        body: Buffer.concat(chunks).toString(),
        hasGuardHeader: Object.keys(options.headers ?? {}).some((key) => key.toLowerCase() === headerName),
      });
      queueMicrotask(() => {
        if (reply?.error) { stream.destroy(new Error("private upstream diagnostic")); return; }
        const create = options.path?.startsWith("/containers/create");
        const response = Readable.from([JSON.stringify(create ? { Id: containerId } : { message: "not found" })]) as IncomingMessage;
        response.statusCode = reply?.status ?? (create ? 201 : 404);
        response.headers = { "content-type": "application/json" };
        receive(response);
      });
    });
    return Object.assign(stream, { setTimeout: () => stream }) as unknown as ClientRequest;
  }) as typeof request;
  return { send, recorded };
}

async function withGuard(run: (guard: Guard, recorded: RecordedRequest[]) => Promise<void>, reply?: { status?: number; error?: boolean }) {
  const scratchRoot = await mkdtemp(path.join(tmpdir(), "mmhr-r1-guard-test-"));
  const docker = simulatedDocker(reply);
  const guard = await startScratchDockerGuard({
    network, scratchRoot, ports: { all: [61001, 61002] },
    dockerEndpoint: "npipe:////./pipe/docker_engine", requestImplementation: docker.send,
  });
  try { await run(guard, docker.recorded); }
  finally {
    await guard.close();
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

function sendToGuard(guard: Guard, options: { method?: string; target?: string; body?: unknown; credential?: string | null } = {}) {
  const endpoint = guard.environment.DOCKER_HOST;
  const socketPath = endpoint.startsWith("npipe:")
    ? `\\\\.\\pipe\\${endpoint.split("/").at(-1)}`
    : endpoint.slice("unix://".length);
  const credential = options.credential === undefined
    ? guard.environment.DOCKER_CUSTOM_HEADERS.slice(headerName.length + 1)
    : options.credential;
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const outgoing = request({
      socketPath, path: options.target ?? `/v1.51/containers/${name}/json`, method: options.method ?? "GET",
      agent: false, headers: { ...(credential === null ? {} : { [headerName]: credential }), "content-length": Buffer.byteLength(body) },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.once("end", () => resolve({ status: incoming.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      incoming.once("error", reject);
    });
    outgoing.once("error", reject);
    outgoing.setTimeout(2_000, () => outgoing.destroy(new Error("Scratch guard test request timed out")));
    outgoing.end(body);
  });
}

function createBody() {
  return {
    Image: "public.ecr.aws/supabase/postgres:17.6.1.054",
    Labels: { "com.supabase.cli.project": projectId },
    Env: ["SYNTHETIC_FIXTURE=value"],
    HostConfig: {
      NetworkMode: network.name,
      PortBindings: { "5432/tcp": [{ HostPort: "61001", HostIp: "" }] },
    },
  };
}

describe("authenticated scratch Docker IPC guard", () => {
  test.each([null, "incorrect", "e".repeat(64), "é".repeat(32)])("rejects an absent or incorrect credential (%#)", async (credential) => {
    await withGuard(async (guard, recorded) => {
      expect((await sendToGuard(guard, { credential })).status).toBe(403);
      expect(recorded).toHaveLength(0);
      expect(() => guard.enableWritesAfterRoutingProbe()).toThrow("routing probe failed");
      expect(guard.counts().lastDenial).toBe("authentication");
    });
  });

  test("requires a successful scoped read before it enables writes", async () => {
    await withGuard(async (guard, recorded) => {
      expect(() => guard.enableWritesAfterRoutingProbe()).toThrow("no_scoped_read");
      const result = await sendToGuard(guard, { method: "POST", target: `/containers/create?name=${name}`, body: createBody() });
      expect(result.status).toBe(403);
      expect(recorded).toHaveLength(0);
      expect(guard.counts().lastDenial).toBe("preflight_write");
    });
  });

  test("forwards a scoped read without its credential, then changes only the permitted HostIp", async () => {
    await withGuard(async (guard, recorded) => {
      expect((await sendToGuard(guard)).status).toBe(404);
      guard.enableWritesAfterRoutingProbe();
      const original = createBody();
      const result = await sendToGuard(guard, { method: "POST", target: `/containers/create?name=${name}`, body: original });
      expect(result.status).toBe(201);
      const expected = structuredClone(original);
      expected.HostConfig.PortBindings["5432/tcp"][0]!.HostIp = "127.0.0.1";
      expect(JSON.parse(recorded[1]!.body)).toEqual(expected);
      expect(recorded.every((entry) => !entry.hasGuardHeader)).toBe(true);
      expect(guard.counts()).toEqual({ createdContainers: 1, adjustedBindings: 1, scopedReads: 1, deniedRequests: 0, lastDenial: null, denialCodes: [] });
      expect((await sendToGuard(guard, { method: "POST", target: `/containers/${containerId}/start` })).status).toBe(404);
      expect(recorded).toHaveLength(3);
    });
  });

  test("does not forward unknown or unrelated writes after the routing probe", async () => {
    await withGuard(async (guard, recorded) => {
      await sendToGuard(guard);
      guard.enableWritesAfterRoutingProbe();
      expect((await sendToGuard(guard, { method: "POST", target: "/swarm/init" })).status).toBe(403);
      expect((await sendToGuard(guard, { method: "POST", target: "/containers/supabase_db_mmhr/stop" })).status).toBe(403);
      expect(recorded).toHaveLength(1);
      expect(guard.counts().deniedRequests).toBe(2);
    });
  });

  test("does not mistake an upstream failure for a verified routing probe", async () => {
    await withGuard(async (guard) => {
      const result = await sendToGuard(guard);
      expect(result.status).toBe(502);
      expect(result.body).not.toContain("private upstream diagnostic");
      expect(() => guard.enableWritesAfterRoutingProbe()).toThrow("no_scoped_read");
    }, { error: true });
  });

  test("a failed upstream read cannot enable writes", async () => {
    await withGuard(async (guard) => {
      expect((await sendToGuard(guard)).status).toBe(500);
      expect(() => guard.enableWritesAfterRoutingProbe()).toThrow("no_scoped_read");
    }, { status: 500 });
  });

  test("closes its pipe after denial and can close it twice", async () => {
    await withGuard(async (guard) => {
      await sendToGuard(guard, { credential: null });
      await guard.close();
      await guard.close();
      await expect(sendToGuard(guard)).rejects.toThrow();
    });
  });
});
