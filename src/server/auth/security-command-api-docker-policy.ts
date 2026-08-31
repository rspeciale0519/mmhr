import path from "node:path";

import type { ScratchNetwork } from "./security-command-api-isolation";

type Json = Record<string, unknown>;
type Scope = {
  network: ScratchNetwork;
  scratchRoot: string;
  ports: Readonly<{ all: readonly number[] }>;
};
export type DockerGuardRequest = {
  method: string;
  target: string;
  body: Buffer;
};
export type DockerGuardDecision = {
  body: Buffer;
  captureCreatedContainer: boolean;
};

export class DockerGuardDenied extends Error {
  constructor(readonly code: string) {
    super(`Scratch Docker guard refused ${code}`);
    this.name = "DockerGuardDenied";
  }
}

const denied = (code: string): never => { throw new DockerGuardDenied(code); };
const object = (value: unknown): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return denied("invalid_object");
  return value as Json;
};
const optionalObject = (value: unknown): Json => value == null ? {} : object(value);
const array = (value: unknown): unknown[] => {
  if (value == null) return [];
  if (!Array.isArray(value)) return denied("invalid_array");
  return value;
};
const empty = (value: unknown) => value == null || (Array.isArray(value) && value.length === 0);

function jsonBody(body: Buffer): Json {
  try { return object(JSON.parse(body.toString("utf8"))); }
  catch { return denied("invalid_json"); }
}

export function createDockerGuardPolicy(scope: Scope) {
  const { network } = scope;
  if (!/^mmhr-r1-[a-z0-9]{1,10}-[0-9a-f]{8}$/.test(network.projectId) ||
    network.name !== `${network.projectId}-loopback` || !/^[0-9a-f]{64}$/.test(network.id) ||
    !scope.ports.all.length || scope.ports.all.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)) {
    return denied("invalid_scope");
  }
  const projectLabel = `com.supabase.cli.project=${network.projectId}`;
  const containerIds = new Set<string>();
  let createdContainers = 0;
  let adjustedBindings = 0;

  const projectName = (value: unknown): value is string => typeof value === "string" &&
    /^supabase_[a-z0-9_]+_mmhr-r1-[a-z0-9]+-[0-9a-f]{8}$/.test(value) && value.endsWith(`_${network.projectId}`);
  const containerReference = (value: string) => containerIds.has(value) || projectName(value);
  const imageReference = (value: string) => /^(?:public\.ecr\.aws\/supabase|ghcr\.io\/supabase|supabase)\/[a-z0-9_.-]+(?::[a-zA-Z0-9_.-]+|@sha256:[0-9a-f]{64})$/.test(value);
  function labels(value: unknown) {
    const actual = object(value);
    if (actual["com.supabase.cli.project"] !== network.projectId ||
      (actual["com.docker.compose.project"] !== undefined && actual["com.docker.compose.project"] !== network.projectId)) {
      denied("foreign_project");
    }
  }
  function filteredToProject(url: URL) {
    if (url.searchParams.getAll("filters").length !== 1) denied("missing_project_filter");
    let filters: Json;
    try { filters = object(JSON.parse(url.searchParams.get("filters") ?? "null")); }
    catch { return denied("missing_project_filter"); }
    const values = filters.label;
    const entries = Array.isArray(values) ? values : Object.keys(optionalObject(values)).filter((key) => object(values)[key] === true);
    if (entries.length !== 1 || entries[0] !== projectLabel) denied("missing_project_filter");
  }
  function scratchBind(source: string) {
    const normalized = source.replaceAll("\\", "/").toLowerCase();
    const root = path.resolve(scope.scratchRoot).replaceAll("\\", "/").toLowerCase();
    const variants = [root];
    const windowsRoot = root.match(/^([a-z]):\/(.*)$/);
    if (windowsRoot) variants.push(`/host_mnt/${windowsRoot[1]}/${windowsRoot[2]}`, `/run/desktop/mnt/host/${windowsRoot[1]}/${windowsRoot[2]}`);
    if (normalized.split("/").some((part) => part === "." || part === "..") ||
      !variants.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
      denied("outside_scratch_mount");
    }
  }
  function mounts(host: Json) {
    for (const bind of array(host.Binds)) {
      if (typeof bind !== "string") denied("invalid_mount");
      const parts = (bind as string).match(/^(.+):(\/[^:]+)(?::([^:]+))?$/);
      if (!parts) denied("invalid_mount");
      if (projectName(parts![1])) continue;
      scratchBind(parts![1]!);
      if (parts![3] !== "ro") {
        const modes = parts![3]?.split(",") ?? [];
        const kind = !modes.length ? "implicit" : modes.includes("ro") ? "readonly_options" : modes.includes("rw") ? "readwrite" : "unknown";
        denied(`writable_host_mount_${kind}`);
      }
    }
    for (const entry of array(host.Mounts)) {
      const mount = object(entry);
      if (mount.Type === "volume" && projectName(mount.Source)) continue;
      if (mount.Type !== "bind" || typeof mount.Source !== "string" || mount.ReadOnly !== true) denied("invalid_mount");
      scratchBind(mount.Source as string);
    }
  }
  function rewriteContainer(body: Json, url: URL) {
    labels(body.Labels);
    if (url.searchParams.getAll("name").length > 1) denied("foreign_container_name");
    const name = url.searchParams.get("name");
    if (name && !projectName(name)) denied("foreign_container_name");
    if (typeof body.Image !== "string" || !imageReference(body.Image)) denied("unexpected_image");
    const host = object(body.HostConfig);
    if (host.Privileged === true || host.PublishAllPorts === true || host.NetworkMode !== network.name ||
      [host.PidMode, host.IpcMode, host.UTSMode, host.CgroupnsMode].includes("host") ||
      !empty(host.Devices) || !empty(host.DeviceRequests) || !empty(host.CapAdd) ||
      !empty(host.VolumesFrom) || !empty(host.Links)) denied("unsafe_container_options");
    const endpoints = optionalObject(optionalObject(body.NetworkingConfig).EndpointsConfig);
    if (Object.keys(endpoints).some((key) => key !== network.name)) denied("foreign_container_network");
    mounts(host);
    const bindings = optionalObject(host.PortBindings);
    let changed = 0;
    for (const [port, entries] of Object.entries(bindings)) {
      if (!/^\d+\/tcp$/.test(port) || !Array.isArray(entries) || entries.length !== 1) denied("invalid_port_binding");
      const binding = object((entries as unknown[])[0]);
      if (typeof binding.HostPort !== "string" || !/^\d+$/.test(binding.HostPort) ||
        !scope.ports.all.includes(Number(binding.HostPort)) ||
        ![undefined, "", "0.0.0.0", "::", "127.0.0.1"].includes(binding.HostIp as string | undefined)) denied("unexpected_port_binding");
      binding.HostIp = "127.0.0.1";
      changed++;
    }
    adjustedBindings += changed;
    return Buffer.from(JSON.stringify(body));
  }

  function evaluate(request: DockerGuardRequest): DockerGuardDecision {
    if (!request.target.startsWith("/") || request.target.startsWith("//") || /[\s\\#]/.test(request.target)) return denied("invalid_target");
    const url = new URL(request.target, "http://scratch-docker.invalid");
    if (url.pathname !== request.target.split("?")[0]) return denied("invalid_target");
    const route = url.pathname.replace(/^\/v\d+\.\d+(?=\/)/, "");
    const method = request.method;
    const untouched = { body: request.body, captureCreatedContainer: false };
    if ((method === "GET" || method === "HEAD") && ["/_ping", "/version", "/info"].includes(route)) return untouched;
    if (method === "GET" && route === "/containers/json") { filteredToProject(url); return untouched; }
    const container = route.match(/^\/containers\/([^/]+)\/(json|logs|wait|start|stop|kill)$/);
    if (container) {
      const reference = decodeURIComponent(container[1]!);
      if (!containerReference(reference)) return denied("foreign_container");
      if (method === "GET" && ["json", "logs"].includes(container[2]!)) return untouched;
      if (method === "POST" && ["wait", "start", "stop", "kill"].includes(container[2]!) &&
        containerIds.has(reference)) return untouched;
      return denied("unregistered_container_write");
    }
    const remove = route.match(/^\/containers\/([^/]+)$/);
    if (method === "DELETE" && remove) {
      const reference = decodeURIComponent(remove[1]!);
      if (!containerIds.has(reference)) return denied("unregistered_container_write");
      return untouched;
    }
    const image = route.match(/^\/images\/(.+)\/json$/);
    if (method === "GET" && image && imageReference(decodeURIComponent(image[1]!))) return untouched;
    const volume = route.match(/^\/volumes\/([^/]+)$/);
    if (method === "GET" && volume && projectName(decodeURIComponent(volume[1]!))) return untouched;
    const inspectedNetwork = route.match(/^\/networks\/([^/]+)$/);
    if (method === "GET" && inspectedNetwork && [network.id, network.name].includes(decodeURIComponent(inspectedNetwork[1]!))) return untouched;
    if (method === "POST" && ["/containers/prune", "/volumes/prune", "/networks/prune"].includes(route)) {
      filteredToProject(url);
      return untouched;
    }
    if (method === "POST" && route === "/containers/create") {
      try {
        return { body: rewriteContainer(jsonBody(request.body), url), captureCreatedContainer: true };
      } catch (error) {
        if (!(error instanceof DockerGuardDenied)) throw error;
        const name = url.searchParams.get("name");
        const component = projectName(name) ? name.slice("supabase_".length, -network.projectId.length - 1) : "job";
        // Only a checked component name appears here. Never include Docker
        // payload fields, mount paths, environment values, or request headers.
        throw new DockerGuardDenied(`${error.code}@${component}`);
      }
    }
    if (method === "POST" && route === "/volumes/create") {
      const body = jsonBody(request.body);
      labels(body.Labels);
      if (!projectName(body.Name) || ![undefined, "", "local"].includes(body.Driver as string | undefined) ||
        Object.keys(optionalObject(body.DriverOpts)).length) return denied("unsafe_volume");
      return untouched;
    }
    if (method === "POST" && route === "/networks/create") {
      const body = jsonBody(request.body);
      labels(body.Labels);
      if (body.Name !== network.name || ![undefined, "", "bridge"].includes(body.Driver as string | undefined) ||
        body.EnableIPv6 === true || body.Ingress === true || Object.keys(optionalObject(body.Options)).length) return denied("unsafe_network");
      return untouched;
    }
    return denied("unsupported_endpoint");
  }

  return {
    evaluate,
    registerContainer(responseBody: Buffer) {
      const body = jsonBody(responseBody);
      if (typeof body.Id !== "string" || !/^[0-9a-f]{64}$/.test(body.Id)) return denied("invalid_created_container");
      containerIds.add(body.Id);
      createdContainers++;
    },
    counts() { return { createdContainers, adjustedBindings }; },
  };
}
