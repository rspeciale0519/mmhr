import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  parseBootstrapInput,
  parseVerifiedClaims,
  validateLocalBootstrapEnvironment,
} from "../../../scripts/r1-bootstrap-super-admin.mjs";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const correlationId = "33333333-3333-4333-8333-333333333333";
const localConfig = `project_id = "mmhr"\n[api]\nport = 54321\n[db]\nport = 54322\n`;
const localEnv = {
  NODE_ENV: "development",
  R1_BOOTSTRAP_LOCAL: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
  MIGRATION_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

describe("local Super Admin bootstrap contract", () => {
  test("requires explicit local opt-in and loopback endpoints", () => {
    expect(() => validateLocalBootstrapEnvironment({ ...localEnv, R1_BOOTSTRAP_LOCAL: "0" }, localConfig))
      .toThrow("R1_BOOTSTRAP_LOCAL=1");
    expect(() => validateLocalBootstrapEnvironment({ ...localEnv, NEXT_PUBLIC_SUPABASE_URL: "https://cloud.example" }, localConfig))
      .toThrow("local loopback Supabase API");
    expect(validateLocalBootstrapEnvironment(localEnv, localConfig).migrationUrl?.port).toBe("54322");
  });

  test("parses prepare input without accepting one target or shared approvals", () => {
    expect(parseBootstrapInput(JSON.stringify({
      firstTargetIdentityId: firstId,
      secondTargetIdentityId: secondId,
      productApprovalReference: "product:approved-1",
      securityApprovalReference: "security:approved-1",
      correlationId,
    }), "prepare")).toEqual({
      firstTargetIdentityId: firstId,
      secondTargetIdentityId: secondId,
      productApprovalReference: "product:approved-1",
      securityApprovalReference: "security:approved-1",
      correlationId,
    });
    expect(() => parseBootstrapInput(JSON.stringify({
      firstTargetIdentityId: firstId,
      secondTargetIdentityId: firstId,
      productApprovalReference: "product:approved-1",
      securityApprovalReference: "security:approved-1",
      correlationId,
    }), "prepare")).toThrow("distinct");
    expect(() => parseBootstrapInput(JSON.stringify({
      firstTargetIdentityId: firstId,
      secondTargetIdentityId: secondId,
      productApprovalReference: "same",
      securityApprovalReference: "same",
      correlationId,
    }), "prepare")).toThrow("distinct");
  });

  test("requires two distinct access tokens for completion and never accepts token claims as input", () => {
    expect(parseBootstrapInput(JSON.stringify({
      firstAccessToken: "first-token-value-with-enough-length",
      secondAccessToken: "second-token-value-with-enough-length",
      correlationId,
    }), "complete")?.secondAccessToken).toBe("second-token-value-with-enough-length");
    expect(() => parseBootstrapInput(JSON.stringify({
      firstAccessToken: "same-token-value-with-enough-length",
      secondAccessToken: "same-token-value-with-enough-length",
      correlationId,
    }), "complete")).toThrow("distinct");
  });

  test("accepts only unexpired authenticated AAL2 claims", () => {
    const claims = parseVerifiedClaims({
      sub: firstId,
      session_id: secondId,
      role: "authenticated",
      aal: "aal2",
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    expect(claims).toMatchObject({ subjectId: firstId, sessionId: secondId });
    expect(() => parseVerifiedClaims({
      sub: firstId, session_id: secondId, role: "authenticated", aal: "aal1", exp: 4_000_000_000,
    })).toThrow("AAL2");
    expect(() => parseVerifiedClaims({
      sub: firstId, session_id: secondId, role: "authenticated", aal: "aal2", exp: 1,
    })).toThrow("AAL2");
  });

  test("has no page, action, route, or public database entry point", () => {
    const source = readFileSync(path.resolve(process.cwd(), "scripts/r1-bootstrap-super-admin.mjs"), "utf8");
    expect(source).toContain("MIGRATION_DATABASE_URL");
    expect(source).not.toContain("createServerClient");
    expect(source).not.toContain("NextResponse");
    expect(source).not.toContain("export async function POST");
  });
});
