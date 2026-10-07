import { z } from "zod";

export type DockerRunner = (args: string[]) => Promise<string>;
export type ScratchNetwork = Readonly<{ id: string; name: string; projectId: string }>;
const projectLabel = "mmhr.rehearsal.project";
const bindingOption = "com.docker.network.bridge.host_binding_ipv4";
const networkSchema = z.object({
  Id: z.string().regex(/^[0-9a-f]{64}$/), Name: z.string(), Driver: z.literal("bridge"),
  Scope: z.literal("local"), EnableIPv6: z.literal(false),
  Options: z.record(z.string(), z.string()), Labels: z.record(z.string(), z.string()),
  Containers: z.record(z.string().regex(/^[0-9a-f]{64}$/), z.object({ Name: z.string() })),
});
const portsSchema = z.record(z.string(), z.array(z.object({
  HostIp: z.literal("127.0.0.1"), HostPort: z.string().regex(/^\d+$/),
})).nullable());

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw new Error("The scratch Docker command returned invalid JSON"); }
}

export async function resolveLocalDockerEndpoint(
  runDocker: DockerRunner,
  environment: { dockerHost?: string; dockerContext?: string },
) {
  // DOCKER_CONTEXT takes precedence over DOCKER_HOST in the installed CLI.
  const endpoint = environment.dockerHost && !environment.dockerContext
    ? environment.dockerHost
    : parseJson(await runDocker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]));
  if (typeof endpoint !== "string" || !(
    /^npipe:\/\/\/\/\.\/pipe\/(?:docker_engine|dockerDesktopLinuxEngine)$/.test(endpoint) ||
    /^unix:\/\/\/[^\r\n]+$/.test(endpoint)
  )) throw new Error("Scratch API tests require a local Docker socket");
  return endpoint;
}

export async function createScratchNetwork(
  projectId: string,
  runDocker: DockerRunner,
  environment: { dockerHost?: string; dockerContext?: string },
): Promise<ScratchNetwork> {
  if (!/^mmhr-r1-[a-z0-9]+-[0-9a-f]{8}$/.test(projectId)) {
    throw new Error("Refused an invalid scratch network project");
  }
  await resolveLocalDockerEndpoint(runDocker, environment);

  const name = `${projectId}-loopback`;
  const id = (await runDocker([
    "network", "create", "--driver", "bridge", "--opt", `${bindingOption}=127.0.0.1`,
    "--label", `${projectLabel}=${projectId}`, name,
  ])).trim();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("Scratch Docker network creation returned no exact identifier");
  return { id, name, projectId };
}

async function inspectScratchNetwork(network: ScratchNetwork, runDocker: DockerRunner) {
  const parsed = networkSchema.safeParse(parseJson(await runDocker([
    "network", "inspect", "--format", "{{json .}}", network.id,
  ])));
  if (!parsed.success || parsed.data.Id !== network.id || parsed.data.Name !== network.name ||
    parsed.data.Options[bindingOption] !== "127.0.0.1" ||
    parsed.data.Labels[projectLabel] !== network.projectId ||
    Object.values(parsed.data.Containers).some((container) =>
      !container.Name.startsWith("supabase_") || !container.Name.endsWith(`_${network.projectId}`))) {
    throw new Error("The scratch Docker network does not match its checked project");
  }
  return parsed.data;
}

export async function verifyScratchNetworkIfPresent(network: ScratchNetwork, runDocker: DockerRunner) {
  const listed = (await runDocker([
    "network", "ls", "--no-trunc", "--filter", `id=${network.id}`, "--format", "{{.ID}}",
  ])).trim();
  if (!listed) return null;
  if (listed !== network.id) throw new Error("The scratch Docker network lookup was not exact");
  return inspectScratchNetwork(network, runDocker);
}

async function verifyScratchBindings(
  network: ScratchNetwork,
  ports: Readonly<{ database: number; all: readonly number[] }>,
  runDocker: DockerRunner,
  apiPort?: number,
) {
  const inspected = await inspectScratchNetwork(network, runDocker);
  const names = Object.values(inspected.Containers).map((container) => container.Name);
  if (!names.includes(`supabase_db_${network.projectId}`) || (apiPort !== undefined && !names.includes(`supabase_kong_${network.projectId}`))) {
    throw new Error(apiPort === undefined ? "The scratch network is missing its database container" : "The scratch network is missing its database or API container");
  }
  const published = new Set<number>();
  for (const id of Object.keys(inspected.Containers)) {
    // Projected inspection excludes container environment variables and credentials.
    const bindings = portsSchema.safeParse(parseJson(await runDocker([
      "container", "inspect", "--format", "{{json .NetworkSettings.Ports}}", id,
    ])));
    if (!bindings.success) throw new Error("The scratch API published a non-loopback binding");
    for (const binding of Object.values(bindings.data).flatMap((value) => value ?? [])) {
      const port = Number(binding.HostPort);
      if (!ports.all.includes(port)) throw new Error("The scratch API published an unexpected port");
      published.add(port);
    }
  }
  if (!published.has(ports.database) || (apiPort !== undefined && !published.has(apiPort))) {
    throw new Error(apiPort === undefined ? "The scratch database did not publish its checked loopback port" : "The scratch API did not publish both checked loopback ports");
  }
  return true as const;
}

export async function verifyScratchApiBindings(
  network: ScratchNetwork,
  ports: Readonly<{ database: number; api: number; all: readonly number[] }>,
  runDocker: DockerRunner,
) {
  return verifyScratchBindings(network, ports, runDocker, ports.api);
}

export async function verifyScratchDatabaseBindings(
  network: ScratchNetwork,
  ports: Readonly<{ database: number; all: readonly number[] }>,
  runDocker: DockerRunner,
) {
  return verifyScratchBindings(network, ports, runDocker);
}

export async function removeScratchNetwork(network: ScratchNetwork, runDocker: DockerRunner) {
  const inspected = await verifyScratchNetworkIfPresent(network, runDocker);
  if (!inspected) return;
  if (Object.keys(inspected.Containers).length) throw new Error("Refused to remove a scratch network with attached containers");
  await runDocker(["network", "rm", network.id]);
}
