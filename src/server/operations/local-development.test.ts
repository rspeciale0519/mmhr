import { expect, test } from "vitest";
import { localDevelopmentEnvironment } from "../../../scripts/dev-local.mjs";

const config = "[api]\nport = 57021\n[db]\nport = 57022\n";
const stack = { DB_URL: "postgresql://localhost_test@127.0.0.1:57022/postgres", API_URL: "http://127.0.0.1:57021", ANON_KEY: "synthetic-anonymous-key" };

test("uses the configured local stack without a saved environment file", () => {
  expect(localDevelopmentEnvironment(stack, config, ["--port", "3006"])).toMatchObject({
    MIGRATION_DATABASE_URL: stack.DB_URL, NEXT_PUBLIC_SUPABASE_URL: stack.API_URL,
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3006", PORT: "3006",
  });
  expect(localDevelopmentEnvironment(stack, config).PORT).toBe("3100");
});

test("rejects remote or unrelated stacks and unexpected arguments", () => {
  for (const patch of [{ API_URL: "https://example.invalid" }, { DB_URL: "postgresql://example.invalid/postgres" },
    { API_URL: "http://127.0.0.1:54321" }, { ANON_KEY: "" }]) {
    expect(() => localDevelopmentEnvironment({ ...stack, ...patch }, config)).toThrow();
  }
  for (const args of [["--hostname", "0.0.0.0"], ["--port", "65536"], ["--port", "80"], ["--port", "3006", "extra"]]) {
    expect(() => localDevelopmentEnvironment(stack, config, args)).toThrow();
  }
});
