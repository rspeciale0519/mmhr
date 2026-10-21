import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0057_r4_response_review.sql"), "utf8");
describe("R4 response review migration", () => { test("records reviewed and approved states", () => { expect(migration).toContain("reviewed_by_identity_id"); expect(migration).toContain("approved_by_identity_id"); expect(migration).toContain("rfp_response_normalizations_review_state_ck"); }); test("requires audited distinct review and approval transitions", () => { expect(migration).toContain("r4.rsp.review"); expect(migration).toContain("r1_checked_receipt"); expect(migration).toContain("r1_finish_security_command"); expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_review_rfp_response_normalization"); }); });
