import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import { getFreeScratchPort } from "./rehearsal-port";

const { create, choose } = vi.hoisted(() => ({ create: vi.fn(), choose: vi.fn() }));
vi.mock("node:crypto", () => ({ randomInt: choose }));
vi.mock("node:net", () => ({ createServer: create }));
const requested: Array<[number,string]> = [];
function server(error?: string) {
  const events = new EventEmitter();
  return Object.assign(events, { unref: vi.fn(), address: () => ({ port: requested.at(-1)![0] || 54321 }),
    listen: (port: number, host: string, callback: () => void) => { requested.push([port,host]);
      queueMicrotask(() => error ? events.emit("error", Object.assign(new Error("Synthetic bind failure"), { code: error })) : callback()); },
    close: (callback?: (error?: Error) => void) => callback?.(),
  });
}
beforeEach(() => { requested.length = 0; choose.mockReset().mockReturnValue(23456); create.mockReset().mockImplementation(() => server()); });
test("binds Windows scratch ports below the measured dynamic-client range and only on loopback", async () => {
  await expect(getFreeScratchPort("win32")).resolves.toBe(23456);
  expect(choose).toHaveBeenCalledWith(20_000,48_000); expect(requested).toEqual([[23456,"127.0.0.1"]]);
});
test("retains operating-system allocation on other platforms", async () => {
  await expect(getFreeScratchPort("linux")).resolves.toBe(54321); expect(choose).not.toHaveBeenCalled();
  expect(requested).toEqual([[0,"127.0.0.1"]]);
});
test.each(["EADDRINUSE","EACCES"])("tries another probe after %s without touching the existing process", async code => {
  create.mockImplementationOnce(() => server(code)); choose.mockReturnValueOnce(23455).mockReturnValueOnce(23456);
  await expect(getFreeScratchPort("win32")).resolves.toBe(23456); expect(requested).toHaveLength(2);
});
test("stops bounded allocation instead of hiding an exhausted range", async () => {
  create.mockImplementation(() => server("EADDRINUSE"));
  await expect(getFreeScratchPort("win32")).rejects.toThrow("after 64 attempts"); expect(requested).toHaveLength(64);
});
test("preserves unexpected socket failures", async () => {
  create.mockImplementation(() => server("ENETDOWN"));
  await expect(getFreeScratchPort("win32")).rejects.toMatchObject({ code: "ENETDOWN" }); expect(requested).toHaveLength(1);
});
