import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

import { resolveLocalDockerEndpoint } from "@/server/auth/security-command-api-isolation";
import { createClamAvDocumentScanner } from "@/server/workflows/clamav-document-scanner";
import type { DocumentScanner } from "@/server/workflows/document-scanner";

const image = "clamav/clamav@sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23";
const ownerLabel = "mmhr.rehearsal.document-scanner";
const exactId = z.string().regex(/^[0-9a-f]{64}$/);
const containerSchema = z.object({
  Id: exactId, Name: z.string(), Config: z.object({ Image: z.literal(image), Labels: z.record(z.string(), z.string()) }),
  Mounts: z.array(z.unknown()).length(0),
  NetworkSettings: z.object({ Networks: z.record(z.string(), z.object({ NetworkID: exactId })),
    Ports: z.record(z.string(), z.array(z.object({ HostIp: z.literal("127.0.0.1"),
      HostPort: z.string().regex(/^\d+$/) })).nullable()) }),
});
const networkSchema = z.object({ Id: exactId, Name: z.string(), Driver: z.literal("bridge"),
  Scope: z.literal("local"), Labels: z.record(z.string(), z.string()),
  Containers: z.record(exactId, z.object({ Name: z.string() })) });

async function docker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { shell: false, windowsHide: true });
    let output = ""; let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); }, 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > 128_000) { failed = true; child.kill(); }
    });
    child.stderr.resume();
    child.once("error", () => { clearTimeout(timer); reject(new Error("Owned scanner Docker command unavailable")); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failed || code !== 0) reject(new Error("Owned scanner Docker command failed")); else resolve(output.trim());
    });
  });
}

export const syntheticScanRequest = (bytes: Uint8Array) => ({ versionId: randomUUID(), bytes,
  expectedSha256: createHash("sha256").update(bytes).digest("hex") });

/** No caller-supplied image, container, network, endpoint, path, or port. */
export async function startDocumentScannerRehearsal(): Promise<{ scanner: DocumentScanner; close: () => Promise<void> }> {
  if (process.env.NODE_ENV !== "test") throw new Error("Document scanner rehearsal is test-only");
  await resolveLocalDockerEndpoint(docker, { dockerHost: process.env.DOCKER_HOST, dockerContext: process.env.DOCKER_CONTEXT });
  // A missing pinned image fails without implicitly downloading another release.
  await docker(["image", "inspect", "--format", "{{.Id}}", image]);
  const name = `mmhr-doc-scan-${randomUUID().replaceAll("-", "")}`;
  let networkId: string | undefined; let containerId: string | undefined;
  async function checkNetwork() {
    const network = networkSchema.parse(JSON.parse(await docker(["network", "inspect", "--format", "{{json .}}", networkId!])));
    if (network.Id !== networkId || network.Name !== name || network.Labels[ownerLabel] !== name
      || Object.entries(network.Containers).some(([id, container]) => id !== containerId || container.Name !== name)) {
      throw new Error("Owned scanner network verification failed");
    }
    return network;
  }
  async function checkContainer() {
    const container = containerSchema.parse(JSON.parse(await docker(["container", "inspect", "--format",
      '{"Id":{{json .Id}},"Name":{{json .Name}},"Config":{"Image":{{json .Config.Image}},"Labels":{{json .Config.Labels}}},"Mounts":{{json .Mounts}},"NetworkSettings":{{json .NetworkSettings}}}', containerId!])));
    if (container.Id !== containerId || container.Name !== `/${name}` || container.Config.Labels[ownerLabel] !== name
      || Object.keys(container.NetworkSettings.Networks).length !== 1
      || container.NetworkSettings.Networks[name]?.NetworkID !== networkId
      || Object.keys(container.NetworkSettings.Ports).some((key) => key !== "3310/tcp" && key !== "7357/tcp")
      || container.NetworkSettings.Ports["7357/tcp"] != null) throw new Error("Owned scanner container verification failed");
    await checkNetwork();
    return container;
  }
  async function close() {
    if (containerId) {
      await checkContainer();
      await docker(["stop", "--timeout", "10", containerId]);
      await docker(["rm", containerId]);
      containerId = undefined;
    }
    if (networkId) {
      const network = await checkNetwork();
      if (Object.keys(network.Containers).length) throw new Error("Owned scanner network remains occupied");
      await docker(["network", "rm", networkId]);
      networkId = undefined;
    }
  }
  try {
    networkId = exactId.parse(await docker(["network", "create", "--driver", "bridge",
      "--opt", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1", "--label", `${ownerLabel}=${name}`, name]));
    containerId = exactId.parse(await docker(["create", "--name", name, "--label", `${ownerLabel}=${name}`,
      "--network", networkId, "--memory", "4g", "--cpus", "2", "--pids-limit", "128",
      "--security-opt", "no-new-privileges", "--publish", "127.0.0.1::3310", "--env", "TZ=UTC",
      ...Object.entries({ StreamMaxLength: "25M", MaxFileSize: "25M", MaxScanSize: "50M", MaxScanTime: "20000",
        MaxFiles: "1000", AlertExceedsMax: "yes", AlertEncrypted: "yes", AlertOLE2Macros: "yes",
        AlertBrokenMedia: "yes", ConcurrentDatabaseReload: "no" }).flatMap(([key, value]) => ["--env", `CLAMD_CONF_${key}=${value}`]), image]));
    await docker(["start", containerId]);
    const container = await checkContainer();
    const bindings = container.NetworkSettings.Ports["3310/tcp"];
    if (!bindings || bindings.length !== 1) throw new Error("Owned scanner requires one loopback listener");
    const port = Number(bindings[0]!.HostPort);
    if (port < 1 || port > 65_535 || port === 3000) throw new Error("Invalid owned scanner port");
    const scanner = createClamAvDocumentScanner({ host: "127.0.0.1", port, allowedEngineVersions: ["1.4.6"],
      signatureTimeZone: "UTC", timeoutMs: 60_000 });
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const result = await scanner.scan(syntheticScanRequest(Buffer.from("Synthetic scanner readiness check")));
      if (result.state === "clean") return { scanner, close };
      if (result.failureCode === "signatures_stale") await docker(["exec", containerId, "clamdscan", "--reload"]);
      // Docker can accept then close a TCP connection while clamd is loading.
      // This bounded startup wait never treats a protocol failure as safe.
      else if (!["scanner_unavailable", "scanner_timeout", "scanner_protocol", "scan_context_changed"].includes(result.failureCode ?? "")) {
        throw new Error(`Owned scanner readiness validation failed: ${result.failureCode ?? "invalid_result"}`);
      }
      await delay(2_000);
    }
    throw new Error("Owned scanner did not become ready with current signatures");
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Document scanner startup and cleanup failed");
    }
    throw error;
  }
}
