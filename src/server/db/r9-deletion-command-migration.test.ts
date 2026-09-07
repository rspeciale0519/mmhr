import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0090_r9_deletion_commands.sql"), "utf8");

describe("R9 deletion command migration review", () => {
  test("adds requester identity and fixed audited RPC", () => {
    expect(migration).toContain("requested_by_identity_id uuid REFERENCES public.identities(id)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_record_deletion");
    expect(migration).toContain("r1_checked_receipt");
    expect(migration).toContain("r1_finish_security_command");
  });

  test("enforces reviewer separation and status transitions", () => {
    expect(migration).toContain("request.requested_by_identity_id = v_actor");
    expect(migration).toContain("request.status <> 'requested'");
    expect(migration).toContain("UPDATE public.deletion_requests SET status=payload->>'decision'");
  });

  test("keeps raw tables closed and grants only authenticated RPC access", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_deletion(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_deletion(jsonb,uuid,uuid) TO authenticated");
  });
});
