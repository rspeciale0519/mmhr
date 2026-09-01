// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

import {
  createScratchNetwork, removeScratchNetwork, verifyScratchApiBindings,
  verifyScratchNetworkIfPresent, type ScratchNetwork,
} from "./security-command-api-isolation";

const projectId = "mmhr-r1-commandapi-01234567";
const network: ScratchNetwork = { id: "a".repeat(64), name: `${projectId}-loopback`, projectId };
const databaseId = "b".repeat(64);
const apiId = "c".repeat(64);
const ports = { database: 60001, api: 60002, all: [60001, 60002] };

function fixture() {
  const state = {
    listed: network.id,
    endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    inspected: {
      Id: network.id, Name: network.name, Driver: "bridge", Scope: "local", EnableIPv6: false,
      Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
      Labels: { "mmhr.rehearsal.project": projectId },
      Containers: {
        [databaseId]: { Name: `supabase_db_${projectId}` },
        [apiId]: { Name: `supabase_kong_${projectId}` },
      } as Record<string, { Name: string }>,
    },
    bindings: {
      [databaseId]: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "60001" }] },
      [apiId]: { "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: "60002" }] },
    } as Record<string, Record<string, { HostIp: string; HostPort: string }[] | null>>,
  };
  const run = vi.fn(async (args: string[]) => {
    if (args[0] === "context") return JSON.stringify(state.endpoint);
    if (args[1] === "create") return network.id;
    if (args[1] === "ls") return state.listed;
    if (args[0] === "network" && args[1] === "inspect") return JSON.stringify(state.inspected);
    if (args[0] === "container" && args[1] === "inspect") return JSON.stringify(state.bindings[args.at(-1)!]);
    if (args[1] === "rm") return network.id;
    throw new Error("Unexpected scratch Docker test call");
  });
  return { state, run };
}

describe("disposable API network isolation", () => {
  test("creates only a project-labelled local bridge with loopback binding", async () => {
    const { run } = fixture();
    expect(await createScratchNetwork(projectId, run, {})).toEqual(network);
    expect(run).toHaveBeenLastCalledWith([
      "network", "create", "--driver", "bridge", "--opt", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      "--label", `mmhr.rehearsal.project=${projectId}`, network.name,
    ]);
  });

  test.each(["tcp://127.0.0.1:2375", "ssh://remote-docker", "npipe:////./pipe/other-service"])(
    "refuses an unapproved Docker endpoint before network creation: %s", async (dockerHost) => {
      const { run } = fixture();
      await expect(createScratchNetwork(projectId, run, { dockerHost })).rejects.toThrow("local Docker socket");
      expect(run).not.toHaveBeenCalled();
    },
  );

  test("checks the selected Docker context when it overrides DOCKER_HOST", async () => {
    const { state, run } = fixture();
    state.endpoint = "ssh://remote-docker";
    await expect(createScratchNetwork(projectId, run, {
      dockerHost: "npipe:////./pipe/dockerDesktopLinuxEngine", dockerContext: "remote",
    })).rejects.toThrow("local Docker socket");
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("verifies exact random loopback bindings on all scratch containers", async () => {
    const { run } = fixture();
    expect(await verifyScratchApiBindings(network, ports, run)).toBe(true);
    expect(run).toHaveBeenCalledWith(["container", "inspect", "--format", "{{json .NetworkSettings.Ports}}", databaseId]);
    expect(run).toHaveBeenCalledWith(["container", "inspect", "--format", "{{json .NetworkSettings.Ports}}", apiId]);
  });

  test.each(["0.0.0.0", "::", "192.168.1.2"])("rejects a non-loopback published binding: %s", async (host) => {
    const { state, run } = fixture();
    state.bindings[apiId]!['8000/tcp']![0]!.HostIp = host;
    await expect(verifyScratchApiBindings(network, ports, run)).rejects.toThrow("non-loopback binding");
  });

  test("rejects a main-project port or a missing expected port", async () => {
    const { state, run } = fixture();
    state.bindings[apiId]!['8000/tcp']![0]!.HostPort = "57021";
    await expect(verifyScratchApiBindings(network, ports, run)).rejects.toThrow("unexpected port");
    state.bindings[apiId]!['8000/tcp'] = null;
    await expect(verifyScratchApiBindings(network, ports, run)).rejects.toThrow("both checked loopback ports");
  });

  test("rejects a network with a different project label", async () => {
    const { state, run } = fixture();
    state.inspected.Labels["mmhr.rehearsal.project"] = "mmhr";
    await expect(verifyScratchNetworkIfPresent(network, run)).rejects.toThrow("checked project");
  });

  test("rejects a network containing another project's container", async () => {
    const { state, run } = fixture();
    state.inspected.Containers[apiId]!.Name = "supabase_kong_mmhr";
    await expect(verifyScratchApiBindings(network, ports, run)).rejects.toThrow("checked project");
  });

  test("does not remove a network while any container remains attached", async () => {
    const { run } = fixture();
    await expect(removeScratchNetwork(network, run)).rejects.toThrow("attached containers");
    expect(run.mock.calls.some(([args]) => args[1] === "rm")).toBe(false);
  });

  test("removes only its checked empty network by full identifier", async () => {
    const { state, run } = fixture();
    state.inspected.Containers = {};
    await removeScratchNetwork(network, run);
    expect(run).toHaveBeenLastCalledWith(["network", "rm", network.id]);
  });

  test("does not recreate or remove a network already removed by Supabase", async () => {
    const { state, run } = fixture();
    state.listed = "";
    await removeScratchNetwork(network, run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
