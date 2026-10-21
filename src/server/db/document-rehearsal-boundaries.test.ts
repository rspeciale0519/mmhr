import { afterEach, describe, expect, test, vi } from "vitest";

import { openDocumentRehearsalObserver, openDocumentRehearsalWorker, openOriginalVerifierRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";

const fabricated = (databaseUrl: string) => ({
  projectId: "mmhr-r1-commandapi-1234abcd", databaseUrl, ports: { database: 59000 }, api: {}, apiLoopbackOnly: true,
}) as unknown as RehearsalContext;

describe("owned document fixture connection boundaries", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  test.each(["postgresql://127.0.0.1:59000/postgres",
    "postgresql://127.0.0.1:57022/postgres", "postgresql://example.invalid:59000/postgres",
    "invalid address"]) ("refuses fabricated context before opening a connection: %s", async (databaseUrl) => {
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("R1_MIGRATION_REHEARSAL", "1");
    const context = fabricated(databaseUrl);
    await expect(openDocumentRehearsalWorker(context, `mmhr_document_worker_${"a".repeat(32)}`, "b".repeat(43)))
      .rejects.toThrow("An active owned document database rehearsal is required");
    await expect(openOriginalVerifierRehearsal(context, `mmhr_original_verifier_${"a".repeat(32)}`, "b".repeat(43)))
      .rejects.toThrow("An active owned document database rehearsal is required");
    expect(() => openDocumentRehearsalObserver(context)).toThrow("An active owned document database rehearsal is required");
  });
  test("refuses production and missing fixture activation without inspecting a malformed address", async () => {
    for (const [environment, enabled] of [["production", "1"], ["test", "0"]]) {
      vi.stubEnv("NODE_ENV", environment); vi.stubEnv("R1_MIGRATION_REHEARSAL", enabled);
      await expect(openDocumentRehearsalWorker(fabricated("invalid address"), "invalid login", "invalid credential"))
        .rejects.toThrow("An active owned document database rehearsal is required");
      await expect(openOriginalVerifierRehearsal(fabricated("invalid address"), "invalid login", "invalid credential"))
        .rejects.toThrow("An active owned document database rehearsal is required");
    }
  });
});
