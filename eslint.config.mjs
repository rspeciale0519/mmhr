import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase CLI runtime cache. It is generated and excluded from Git.
    "supabase/.temp/**",
    // Vendored agent tooling, not application code. These are CommonJS hook
    // scripts managed by the _brain sync tool and must not be hand-edited, so
    // linting them only ever produces unfixable no-require-imports errors.
    ".claude/**",
    ".codex/**",
    // Archived code is kept in Git but is not built, linted, or tested.
    "archive/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
