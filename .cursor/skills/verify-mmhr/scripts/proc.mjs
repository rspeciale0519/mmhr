#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { descendantPids } from "./lib.mjs";

function procPath(pid, leaf) {
  return `/proc/${pid}/${leaf}`;
}

export function readProcCmdline(pid) {
  const file = procPath(pid, "cmdline");
  if (!existsSync(file)) throw new Error(`Cannot read cmdline for pid ${pid}`);
  return readFileSync(file, "utf8").split("\0").filter(Boolean);
}

export function readProcPgid(pid) {
  const file = procPath(pid, "stat");
  if (!existsSync(file)) throw new Error(`Cannot read process group for pid ${pid}`);
  const stat = readFileSync(file, "utf8");
  const close = stat.lastIndexOf(") ");
  if (close === -1) throw new Error(`Cannot parse process group for pid ${pid}`);
  const rest = stat.slice(close + 2).split(" ");
  const pgid = Number(rest[2]);
  if (!Number.isInteger(pgid) || pgid <= 0) throw new Error(`Cannot parse process group for pid ${pid}`);
  return pgid;
}

export function readProcEnviron(pid) {
  const file = procPath(pid, "environ");
  if (!existsSync(file)) throw new Error(`Cannot read environ for pid ${pid}`);
  const env = {};
  for (const entry of readFileSync(file).toString("utf8").split("\0")) {
    if (!entry) continue;
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    env[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return env;
}

export function isVerificationLaunchCmdline(parts) {
  const text = parts.join(" ");
  if (text.includes("dev-local.mjs")) return true;
  const hasNext = parts.some(
    (part) => part === "next" || part.endsWith("/next") || part.includes("next/dist/bin/next"),
  );
  return hasNext && parts.includes("dev");
}

export function isNextServerCmdline(parts) {
  const text = parts.join(" ");
  if (text.includes("next-server") || text.includes("next/dist")) return true;
  return parts.some((part) => part === "next" || part.endsWith("/next")) && parts.includes("dev");
}

export function nextServerPids(rootPid, portOwners = []) {
  const tree = descendantPids(rootPid);
  const matched = [];
  for (const pid of tree) {
    let parts;
    try {
      parts = readProcCmdline(pid);
    } catch {
      continue;
    }
    if (isNextServerCmdline(parts)) matched.push(pid);
  }
  for (const pid of portOwners) {
    if (tree.has(pid) && !matched.includes(pid)) matched.push(pid);
  }
  if (matched.length === 0 && tree.has(rootPid)) matched.push(rootPid);
  return matched;
}
