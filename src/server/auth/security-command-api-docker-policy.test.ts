// @vitest-environment node
import { describe, expect, test } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDockerGuardPolicy } from "./security-command-api-docker-policy";

const projectId = "mmhr-r1-commandapi-01234567";
const scope = {
  network: { id: "a".repeat(64), name: `${projectId}-loopback`, projectId },
  scratchRoot: path.join(tmpdir(), "mmhr-r1-example"), ports: { all: [61001, 61002] },
};
const name = `supabase_db_${projectId}`;
const body = () => ({
  Image: "public.ecr.aws/supabase/postgres:17.6.1.054", Env: ["TEST_SECRET=synthetic"],
  Labels: { "com.supabase.cli.project": projectId, "com.docker.compose.project": projectId },
  Entrypoint: ["sh", "-c", "keep this exact command"],
  Healthcheck: { Test: ["CMD", "pg_isready"] },
  HostConfig: {
    NetworkMode: scope.network.name, Binds: [`${name}:/var/lib/postgresql/data`],
    RestartPolicy: { Name: "unless-stopped" },
    PortBindings: { "5432/tcp": [{ HostPort: "61001", HostIp: "" }] },
  },
  NetworkingConfig: { EndpointsConfig: { [scope.network.name]: { Aliases: ["db"] } } },
});

function request(value: unknown = body()) {
  return { method: "POST", target: `/v1.51/containers/create?name=${name}`, body: Buffer.from(JSON.stringify(value)) };
}

describe("scratch Docker API write policy", () => {
  test("changes only the validated HostIp in the CLI's original container payload", () => {
    const policy = createDockerGuardPolicy(scope);
    const original = body();
    const expected = structuredClone(original);
    expected.HostConfig.PortBindings["5432/tcp"][0]!.HostIp = "127.0.0.1";
    expect(JSON.parse(policy.evaluate(request(original)).body.toString())).toEqual(expected);
    expect(original.HostConfig.PortBindings["5432/tcp"][0]!.HostIp).toBe("");
    expect(policy.counts()).toEqual({ createdContainers: 0, adjustedBindings: 1 });
  });

  test.each(["Privileged", "PublishAllPorts"])("rejects unsafe %s", (option) => {
    const value = body();
    Object.assign(value.HostConfig, { [option]: true });
    expect(() => createDockerGuardPolicy(scope).evaluate(request(value))).toThrow("unsafe_container_options");
  });

  test("rejects host networking and unknown host ports", () => {
    const value = body();
    value.HostConfig.NetworkMode = "host";
    expect(() => createDockerGuardPolicy(scope).evaluate(request(value))).toThrow("unsafe_container_options");
    value.HostConfig.NetworkMode = scope.network.name;
    value.HostConfig.PortBindings["5432/tcp"][0]!.HostPort = "57022";
    expect(() => createDockerGuardPolicy(scope).evaluate(request(value))).toThrow("unexpected_port_binding");
  });

  test("rejects foreign project labels, names, and images", () => {
    const policy = createDockerGuardPolicy(scope);
    const value = body();
    value.Labels["com.supabase.cli.project"] = "mmhr";
    expect(() => policy.evaluate(request(value))).toThrow("foreign_project");
    expect(() => policy.evaluate({ ...request(), target: "/containers/create?name=supabase_db_mmhr" })).toThrow("foreign_container_name");
    value.Labels["com.supabase.cli.project"] = projectId;
    value.Image = "arbitrary/image:latest";
    expect(() => policy.evaluate(request(value))).toThrow("unexpected_image");
  });

  test("allows only scratch-owned volumes or read-only scratch file mounts", () => {
    const value = body();
    value.HostConfig.Binds = [`${scope.scratchRoot}/supabase/gateway.yml:/gateway.yml:ro`];
    expect(createDockerGuardPolicy(scope).evaluate(request(value)).captureCreatedContainer).toBe(true);
    value.HostConfig.Binds = [`${scope.scratchRoot}/../private:/private:ro`];
    expect(() => createDockerGuardPolicy(scope).evaluate(request(value))).toThrow("outside_scratch_mount");
    value.HostConfig.Binds = [`${scope.scratchRoot}/file:/file:rw`];
    expect(() => createDockerGuardPolicy(scope).evaluate(request(value))).toThrow("writable_host_mount_readwrite@db");
    value.HostConfig.Binds = [`${scope.scratchRoot}/file:/file:ro,z`];
    expect(() => createDockerGuardPolicy(scope).evaluate(request(value))).toThrow("writable_host_mount_readonly_options@db");
    value.HostConfig.Binds = ["supabase_db_mmhr:/data"];
    expect(() => createDockerGuardPolicy(scope).evaluate(request(value))).toThrow("outside_scratch_mount");
  });

  test("does not allow writes to guessed or unrelated container IDs", () => {
    const policy = createDockerGuardPolicy(scope);
    const id = "b".repeat(64);
    const start = { method: "POST", target: `/containers/${id}/start`, body: Buffer.alloc(0) };
    expect(() => policy.evaluate(start)).toThrow("foreign_container");
    policy.registerContainer(Buffer.from(JSON.stringify({ Id: id })));
    expect(policy.evaluate(start).body.length).toBe(0);
    expect(() => policy.evaluate({ ...start, target: "/containers/supabase_db_mmhr/start" })).toThrow("foreign_container");
  });

  test("allows the CLI secret archive only for a registered container root", () => {
    const policy = createDockerGuardPolicy(scope);
    const id = "c".repeat(64);
    policy.registerContainer(Buffer.from(JSON.stringify({ Id: id })));
    const archive = { method: "PUT", target: `/containers/${id}/archive?path=%2F`, body: Buffer.from("tar") };
    expect(policy.evaluate(archive).body.toString()).toBe("tar");
    expect(policy.evaluate({ ...archive, method: "POST", target: `/containers/${id}/archive` }).body.toString()).toBe("tar");
    expect(policy.evaluate({ ...archive, method: "HEAD", target: `/containers/${id}/archive?path=%2F` }).body.toString()).toBe("tar");
    expect(policy.evaluate({ ...archive, target: `/containers/${id.slice(0, 12)}/archive?path=%2F` }).body.toString()).toBe("tar");
    expect(policy.evaluate({ ...archive, target: `/containers/${name}/archive?path=%2F` }).body.toString()).toBe("tar");
    expect(() => policy.evaluate({ ...archive, target: `/containers/${id}/archive?path=%2Ftmp` })).toThrow("unsafe_archive_path");
    expect(() => policy.evaluate({ ...archive, target: `/containers/${"d".repeat(64)}/archive?path=%2F` })).toThrow("foreign_container");
  });

  test("allows only project-owned container attach requests", () => {
    const policy = createDockerGuardPolicy(scope);
    const attach = { method: "POST", target: `/containers/${name}/attach?stream=1&stdout=1&stderr=1`, body: Buffer.alloc(0) };
    expect(policy.evaluate(attach).body.length).toBe(0);
    expect(() => policy.evaluate({ ...attach, target: `/containers/${"d".repeat(64)}/attach` })).toThrow("foreign_container");
    expect(() => policy.evaluate({ ...attach, method: "GET" })).toThrow("unsupported_endpoint");
  });

  test("allows cleanup only with the exact generated project filter", () => {
    const policy = createDockerGuardPolicy(scope);
    const filter = JSON.stringify({ label: [`com.supabase.cli.project=${projectId}`] });
    const cleanup = { method: "POST", target: `/containers/prune?filters=${encodeURIComponent(filter)}`, body: Buffer.alloc(0) };
    expect(policy.evaluate(cleanup).captureCreatedContainer).toBe(false);
    expect(() => policy.evaluate({ ...cleanup, target: "/containers/prune" })).toThrow("missing_project_filter");
    const foreign = JSON.stringify({ label: ["com.supabase.cli.project=mmhr"] });
    expect(() => policy.evaluate({ ...cleanup, target: `/volumes/prune?filters=${encodeURIComponent(foreign)}` })).toThrow("missing_project_filter");
    const combined = JSON.stringify({ label: [`com.supabase.cli.project=${projectId}`, "com.supabase.cli.project=mmhr"] });
    expect(() => policy.evaluate({ ...cleanup, target: `/volumes/prune?filters=${encodeURIComponent(combined)}` })).toThrow("missing_project_filter");
    expect(() => policy.evaluate({ ...cleanup, target: `${cleanup.target}&filters=${encodeURIComponent(foreign)}` })).toThrow("missing_project_filter");
  });

  test.each(["/containers/../containers/create", "/%2e%2e/containers/create", "//docker/containers/create", "/containers\\create"])(
    "rejects ambiguous request targets (%#)", (target) => {
      expect(() => createDockerGuardPolicy(scope).evaluate({ ...request(), target })).toThrow("invalid_target");
    },
  );

  test.each(["/images/create", "/build", "/plugins/create", "/swarm/init", "/networks/unknown/connect"])(
    "rejects unapproved write endpoint %s", (target) => {
      expect(() => createDockerGuardPolicy(scope).evaluate({ method: "POST", target, body: Buffer.alloc(0) })).toThrow("unsupported_endpoint");
    },
  );
});

describe("database-only owned project bindings", () => {
  test.each(["", "0.0.0.0", "::", "127.0.0.1"])("rewrites only the database binding for HostIp %s", host => {
    const databaseProject = "mmhr-r1-r7invoice-01234567";
    const databaseName = "supabase_db_" + databaseProject;
    const databaseScope = { ...scope, network: { ...scope.network,
      projectId: databaseProject, name: databaseProject + "-loopback" } };
    const payload = body();
    payload.Labels["com.supabase.cli.project"] = databaseProject;
    payload.Labels["com.docker.compose.project"] = databaseProject;
    payload.HostConfig.NetworkMode = databaseScope.network.name;
    payload.HostConfig.Binds = [databaseName + ":/var/lib/postgresql/data"];
    payload.HostConfig.PortBindings["5432/tcp"][0]!.HostIp = host;
    payload.NetworkingConfig.EndpointsConfig = { [databaseScope.network.name]: { Aliases: ["db"] } };
    const expected = structuredClone(payload);
    expected.HostConfig.PortBindings["5432/tcp"][0]!.HostIp = "127.0.0.1";
    const result = createDockerGuardPolicy(databaseScope).evaluate({ method: "POST",
      target: "/containers/create?name=" + databaseName, body: Buffer.from(JSON.stringify(payload)) });
    expect(JSON.parse(result.body.toString())).toEqual(expected);
    expect(payload.HostConfig.PortBindings["5432/tcp"][0]!.HostIp).toBe(host);
  });
});
